// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Navigation } from "@/components/landing/navigation";
import { EditorialPlatform } from "@/components/landing/editorial-platform";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(text),
  )!;

describe("editorial navigation", () => {
  it("opens a disclosure with a click, closes with Escape and returns focus", async () => {
    await act(async () => root.render(createElement(Navigation)));
    const trigger = button("Platform");
    await act(async () => trigger.click());
    const panel = document.getElementById(
      trigger.getAttribute("aria-controls")!,
    )!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('a[href="/products/fund-os"]')).not.toBeNull();
    panel.querySelector("a")!.focus();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
  it("closes the mobile menu on Escape and keeps the silver mark under dark mode", async () => {
    document.documentElement.classList.add("dark");
    await act(async () => root.render(createElement(Navigation)));
    const toggle = button("Menu");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(container.querySelector('ellipse[class*="dark:block"]')).toBeNull();
    document.documentElement.classList.remove("dark");
  });
});

it("changes product tabs with the keyboard and exposes the matching product link", async () => {
  await act(async () => root.render(createElement(EditorialPlatform)));
  const first = container.querySelector<HTMLButtonElement>('[role="tab"]')!;
  first.focus();
  await act(async () =>
    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  const selected = container.querySelector(
    '[role="tab"][aria-selected="true"]',
  )!;
  expect(selected.textContent).toBe("Deal Flow");
  expect(document.activeElement).toBe(selected);
  const panel = container.querySelector<HTMLElement>(
    '[role="tabpanel"]:not([hidden])',
  )!;
  expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
  expect(panel.querySelector('a[href="/products/deal-flow"]')).not.toBeNull();
  expect(
    container.querySelectorAll('[role="tabpanel"]:not([hidden])'),
  ).toHaveLength(1);
});
