// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "@supabase/supabase-js";
import { AppMobileNav } from "@/components/shell/app-mobile-nav";
import { NavPersonaProvider } from "@/components/shell/nav-persona";
import { CommandPalette } from "@/components/shell/command-palette";
import { DataTable } from "@/components/data/data-table";
import { TaskFeed } from "@/components/tasks/task-feed";
import { EntitySwitcher } from "@/components/shell/entity-switcher";
import { QuickStart } from "@/components/shell/quick-start";
import { DashboardContent } from "@/components/tesseract/dashboard-content";

const navigation = vi.hoisted(() => ({ push: vi.fn(), pathname: "/dashboard/crm" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => navigation.pathname }));
vi.mock("@/components/shell/header-trays", () => ({ HeaderTrays: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
let container: HTMLDivElement;
let root: Root;
let desktopListener: (() => void) | undefined;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
const user: User = { id: "test-user", aud: "authenticated", created_at: "2026-01-01T00:00:00Z", app_metadata: {}, email: "alex@example.com", user_metadata: { first_name: "Alex" } };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  media = { matches: false, addEventListener: vi.fn((_event, callback) => { desktopListener = callback }), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  localStorage.clear();
  navigation.push.mockClear();
  container = document.createElement("div");
  container.className = "platform-workspace";
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (element: React.ReactNode) => act(async () => root.render(element));
const byText = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text)!;
const key = (element: EventTarget, value: string) => act(async () => { element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })) });
const click = (element: HTMLElement) => act(async () => element.click());
const type = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

function mobile(persona: "founder" | "vc" | "lp" | null = "founder", isAdmin = false) {
  return createElement(NavPersonaProvider, { persona, children: createElement(AppMobileNav, { user, isAdmin }) });
}

describe("mobile workspace navigation", () => {
  it("marks the current route, opens a named dialog and restores focus on Escape", async () => {
    await render(mobile());
    expect(container.querySelector('a[href="/dashboard/crm"]')?.getAttribute("aria-current")).toBe("page");
    const menu = byText("Menu");
    expect(menu.getAttribute("aria-label")).toBe("Open workspace navigation");
    menu.focus();
    await click(menu);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Workspace navigation");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog.querySelector('a[href="/dashboard/portfolio/fund"]')).toBeNull();
    expect(dialog.querySelector('a[href="/dashboard/admin"]')).toBeNull();
    await key(document.activeElement!, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(menu));
  });
  it("returns focus when the close control is used and reserves the device safe area", async () => {
    await render(mobile());
    const menu = byText("Menu");
    menu.focus();
    await click(menu);
    const dialog = document.querySelector('[role="dialog"]')!;
    const close = [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Close"));
    expect(close).not.toBeUndefined();
    expect(container.querySelector(".platform-mobile-tabs")?.className).toContain("safe-area-inset-bottom");
    await click(close as HTMLButtonElement);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(menu));
  });
  it("preserves LP routes and hides relationship actions for LPs", async () => {
    await render(mobile("lp"));
    expect(container.querySelector('a[href="/dashboard/crm"]')).toBeNull();
    await click(byText("Menu"));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('a[href="/lp"]')).not.toBeNull();
    expect(dialog.querySelector('a[href="/lp/documents"]')).not.toBeNull();
  });
  it("keeps the owner console gated and releases the mobile dialog on desktop resize", async () => {
    await render(mobile(null, true));
    await click(byText("Menu"));
    expect(document.querySelector('[role="dialog"] a[href="/dashboard/admin"]')).not.toBeNull();
    await act(async () => { media.matches = true; desktopListener?.() });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});

describe("workspace search", () => {
  async function open() {
    await render(createElement(CommandPalette, { persona: "founder" }));
    await act(async () => { window.dispatchEvent(new Event("open-command-palette")) });
    return document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  }
  it("recovers after an empty search and navigates the selected result with Enter", async () => {
    const input = await open();
    expect(document.activeElement).toBe(input);
    await type(input, "zzzz-no-page");
    await key(input, "ArrowDown");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    await key(input, "Enter");
    expect(navigation.push).not.toHaveBeenCalled();
    await type(input, "contacts — table");
    const selected = document.getElementById(input.getAttribute("aria-activedescendant")!)!;
    expect(selected.getAttribute("aria-selected")).toBe("true");
    await key(input, "Enter");
    expect(navigation.push).toHaveBeenCalledWith("/dashboard/crm/table");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("returns focus to the invoking workspace control on Escape", async () => {
    await render(createElement("div", null, createElement("button", { id: "search-trigger" }, "Search"), createElement(CommandPalette)));
    const trigger = document.getElementById("search-trigger")!;
    trigger.focus();
    await act(async () => { window.dispatchEvent(new Event("open-command-palette")) });
    await key(document.activeElement!, "Escape");
    expect(document.activeElement).toBe(trigger);
  });
});

describe("working tables and task state", () => {
  it("exposes operable sort controls and distinguishes no matches from an empty dataset", async () => {
    await render(createElement(DataTable<{id: string; name: string}>, {
      columns: [{ key: "name", header: "Name" }], rows: [{ id: "b", name: "Beta" }, { id: "a", name: "Alpha" }], getRowId: (r) => r.id,
    }));
    await click(byText("Name"));
    expect(container.querySelector("th")?.getAttribute("aria-sort")).toBe("ascending");
    expect(container.querySelector("tbody tr")?.textContent).toBe("Alpha");
    await click(byText("Name"));
    expect(container.querySelector("tbody tr")?.textContent).toBe("Beta");
    await type(container.querySelector("input")!, "no-result");
    expect(container.textContent).toContain("No matching records");
  });
  it("keeps a task open when saving fails and completes it after a successful retry", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (options?.method === "PATCH") return { ok: false } as Response;
      return { ok: true, json: async () => ({ tasks: [{ id: "1", title: "Review deck", stage: "to_do", due_date: null, entity_label: null }] }) } as Response;
    });
    await render(createElement(TaskFeed));
    await click(container.querySelector<HTMLButtonElement>('[aria-label="Complete task: Review deck"]')!);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be completed");
    expect(container.querySelector('[aria-label="Complete task: Review deck"]')).not.toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    await click(container.querySelector<HTMLButtonElement>('[aria-label="Complete task: Review deck"]')!);
    expect(container.querySelector('[aria-label="Complete task: Review deck"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("reports unavailable tasks instead of claiming everything is complete", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await render(createElement(TaskFeed));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be loaded");
    expect(container.textContent).not.toContain("You're all caught up");
  });
});

it("shows a failed workspace switch without pretending the new entity is active", async () => {
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    if (options?.method === "POST") return { ok: false } as Response;
    return { ok: true, json: async () => ({ activeOrgId: "a", memberships: [{ orgId: "a", name: "Fund Alpha", kind: "fund" }, { orgId: "b", name: "Fund Beta", kind: "fund" }] }) } as Response;
  });
  await render(createElement(EntitySwitcher));
  const trigger = container.querySelector<HTMLButtonElement>("button")!;
  await key(trigger, "ArrowDown");
  const beta = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((n) => n.textContent?.includes("Fund Beta"))!;
  await click(beta);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not switch workspace");
  expect(trigger.textContent).toContain("Fund Alpha");
  expect(trigger.disabled).toBe(false);
});

it("uses LP quick actions instead of founder actions", async () => {
  await render(createElement(NavPersonaProvider, { persona: "lp", children: createElement(QuickStart) }));
  expect(container.querySelector('a[href="/lp"]')).not.toBeNull();
  expect(container.querySelector('a[href="/dashboard/find-investors"]')).toBeNull();
});

it("keeps zero amounts distinct from missing amounts and labels the overview scope", async () => {
  await render(createElement(DashboardContent, { user, stats: {
    totalFirms: 0, totalDeals: 2, totalContacts: 0, totalInvestors: 0, activeDeals: 2, closedDeals: 0, pipelineValue: 0, closedValue: 0,
    recentDeals: [{ id: "a", name: "Zero deal", stage: "prospect", amount: 0, firmName: null, updatedAt: null }, { id: "b", name: "Missing amount", stage: "prospect", amount: null, firmName: null, updatedAt: "invalid" }],
  } }));
  const rows = [...container.querySelectorAll("li")];
  expect(rows[0].textContent).toContain("0");
  expect(rows[0].textContent).not.toContain("$");
  expect(rows[0].textContent).not.toContain("Amount not set");
  expect(rows[1].textContent).toContain("Amount not set");
  expect(container.textContent).toContain("Your relationship records and pipeline.");
  expect(container.textContent).not.toContain("Invalid Date");
  expect(container.querySelectorAll("h1")).toHaveLength(1);
});
