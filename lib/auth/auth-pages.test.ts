// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
const mocks = vi.hoisted(() => ({ reset: vi.fn(), update: vi.fn(), fetch: vi.fn() }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("next=/dashboard/discover") }))
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update } }) }))
import LoginPage from "@/app/auth/login/page"
import ForgotPage from "@/app/auth/forgot-password/page"
import ResetPage from "@/app/auth/reset-password/page"
import SignupPage from "@/app/auth/sign-up/page"

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("fetch", mocks.fetch)
  window.history.replaceState({}, "", "/")
  container = document.createElement("div"); document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
async function enter(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!
  expect(input.labels?.length).toBe(1)
  await act(async () => {
    Object.getOwnPropertyDescriptor(input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
  })
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }

it("keeps login retryable after failure and supports password visibility without submitting", async () => {
  mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Invalid email or password" }) })
  await act(async () => root.render(createElement(LoginPage)))
  await enter("email", "founder@example.com"); await enter("password", "Secret123!")
  const password = container.querySelector<HTMLInputElement>("#password")!
  expect(password.autocomplete).toBe("current-password")
  const reveal = container.querySelector<HTMLButtonElement>('[aria-label="Show password"]')!
  await act(async () => reveal.click())
  expect(password.type).toBe("text"); expect(reveal.getAttribute("aria-pressed")).toBe("true")
  expect(mocks.fetch).not.toHaveBeenCalled()
  await submit()
  expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/sign-in", expect.objectContaining({ credentials: "same-origin", body: JSON.stringify({ email: "founder@example.com", password: "Secret123!" }) }))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid email or password")
  expect(container.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false)
  expect(password.value).toBe("Secret123!")
})

it("prevents duplicate submissions while sign-in is pending", async () => {
  let resolve!: (value: unknown) => void
  mocks.fetch.mockReturnValue(new Promise(r => { resolve = r }))
  await act(async () => root.render(createElement(LoginPage)))
  await enter("email", "founder@example.com"); await enter("password", "Secret123!")
  await submit(); await submit()
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  expect(container.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true)
  await act(async () => resolve({ ok: false, json: async () => ({ error: "Try again" }) }))
})

it("only confirms recovery after the service accepts it, with a PKCE callback and retry", async () => {
  mocks.reset.mockResolvedValueOnce({ error: new Error("Try again later") }).mockResolvedValueOnce({ error: null })
  await act(async () => root.render(createElement(ForgotPage)))
  await enter("email", "founder@example.com"); await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Try again later")
  expect(container.querySelector('[role="status"]')).toBeNull()
  await submit()
  expect(mocks.reset).toHaveBeenCalledWith("founder@example.com", { redirectTo: window.location.origin + "/auth/callback?next=/auth/reset-password" })
  expect(container.querySelector('[role="status"]')?.textContent).toContain("If an account exists")
  const another = [...container.querySelectorAll("button")].find(b => b.textContent === "Use another email address")!
  await act(async () => another.click())
  expect(container.querySelector<HTMLInputElement>("#email")!.value).toBe("founder@example.com")
})

it("validates password confirmation before updating and provides an explicit success action", async () => {
  mocks.update.mockResolvedValue({ error: null })
  await act(async () => root.render(createElement(ResetPage)))
  await enter("password", "NewSecret123!"); await enter("confirmPassword", "Different123!"); await submit()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("don’t match")
  await enter("confirmPassword", "NewSecret123!"); await submit()
  expect(mocks.update).toHaveBeenCalledWith({ password: "NewSecret123!" })
  expect(container.querySelector('[role="status"]')?.textContent).toContain("has been changed")
  expect(container.textContent).toContain("Continue to sign in")
  expect(container.querySelector("form")).toBeNull()
})

it("explains invitation access without offering an unusable registration form", async () => {
  await act(async () => root.render(createElement(SignupPage)))
  expect(container.querySelector("h1")?.textContent).toBe("A personal invitation.")
  expect(container.querySelector("form")).toBeNull()
  expect(container.querySelector('a[href="/contact"]')).not.toBeNull()
})

it("preserves the invitation and selected role when registration fails", async () => {
  window.history.replaceState({}, "", "/auth/sign-up?invite=test-invitation")
  mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Invitation expired" }) })
  await act(async () => root.render(createElement(SignupPage)))
  await enter("firstName", "Alex"); await enter("lastName", "Smith"); await enter("email", "alex@example.com")
  await enter("role", "vc"); await enter("password", "LongPassword123!"); await submit()
  expect(mocks.fetch).toHaveBeenCalledWith("/api/auth/sign-up", expect.objectContaining({ body: JSON.stringify({ email: "alex@example.com", password: "LongPassword123!", name: "Alex Smith", role: "vc", invite: "test-invitation" }) }))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invitation expired")
  expect(container.querySelector<HTMLSelectElement>("#role")!.value).toBe("vc")
  expect(container.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false)
})
