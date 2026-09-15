// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import { Navigation } from "@/components/landing/navigation";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    media: "(prefers-color-scheme: dark)",
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  localStorage.clear();
  document.documentElement.className = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  document.documentElement.className = "";
  vi.unstubAllGlobals();
});
const renderNavigation = () =>
  act(async () =>
    root.render(
      createElement(
        ThemeProvider,
        { attribute: "class", defaultTheme: "system", enableSystem: true },
        createElement(Navigation),
      ),
    ),
  );

it("follows the system initially, saves an explicit choice and restores it on remount", async () => {
  await renderNavigation();
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  const toggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="Switch to light mode"]',
  )!;
  expect(toggle.disabled).toBe(false);
  // The theme control remains available without opening the navigation.
  expect(toggle.closest("nav")).toBeNull();
  await act(async () => toggle.click());
  expect(localStorage.getItem("theme")).toBe("light");
  expect(document.documentElement.classList.contains("light")).toBe(true);
  expect(toggle.getAttribute("aria-label")).toBe("Switch to dark mode");
  await act(async () => root.unmount());
  root = createRoot(container);
  await renderNavigation();
  expect(document.documentElement.classList.contains("light")).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Switch to dark mode"]')!
      .click(),
  );
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});
