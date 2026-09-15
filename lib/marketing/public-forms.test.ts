// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
const mocks = vi.hoisted(() => ({ contact: vi.fn() }));
vi.mock("@/app/contact/actions", () => ({ submitContactForm: mocks.contact }));
vi.mock("@/components/landing/navigation", () => ({ Navigation: () => null }));
vi.mock("@/components/landing/footer-section", () => ({ FooterSection: () => null }));
import ContactPage from "@/app/contact/page";
import ApplyPage from "@/app/apply/page";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("submits the contact form through the existing action and announces the result", async () => {
  mocks.contact.mockResolvedValue({ success: true, message: "Message received" });
  await act(async () => root.render(createElement(ContactPage)));
  for (const [name,value] of Object.entries({name:"Test Founder",email:"founder@example.com",company:"Example",inquiryType:"founder",message:"A platform demo"})) {
    const control = container.querySelector<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>(`[name="${name}"]`)!;
    expect(control.labels?.length).toBe(1);
    const prototype = control.tagName === "INPUT" ? HTMLInputElement.prototype : control.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype,"value")!.set!.call(control,value); control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", {bubbles:true})); });
  }
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(mocks.contact).toHaveBeenCalledWith({ name:"Test Founder",email:"founder@example.com",company:"Example",inquiryType:"founder",message:"A platform demo" });
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Message received");
  expect(container.querySelector<HTMLInputElement>('[name="email"]')!.value).toBe("");
});

it("associates the application fields and exposes selected sectors", async () => {
  await act(async () => root.render(createElement(ApplyPage)));
  for (const name of ["startup_name","website","one_liner","raise_amount"]) {
    const input=container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    expect(input.labels?.length).toBe(1);
  }
  const climate = [...container.querySelectorAll("button")].find(button=>button.textContent==="Climate")!;
  expect(climate.getAttribute("aria-pressed")).toBe("false");
  await act(async () => climate.click());
  expect(climate.getAttribute("aria-pressed")).toBe("true");
});
