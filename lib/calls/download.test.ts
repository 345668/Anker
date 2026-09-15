import { afterEach, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ scope: vi.fn(), get: vi.fn() }))
vi.mock("@vercel/blob", () => ({ get: mocks.get }))
vi.mock("@/lib/calls/access", async importOriginal => ({ ...(await importOriginal<any>()), callScope: mocks.scope }))
vi.mock("@/lib/supabase/server", () => ({}))
vi.mock("@/lib/org/active", () => ({}))
import { GET } from "@/app/api/calls/download/route"
import { CallError } from "./access"
import { callReleases } from "./releases"
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
const req = () => new NextRequest("https://www.an-ker.de/api/calls/download?platform=windows-x64")
it("requires browser authentication before fetching any installer", async () => {
  mocks.scope.mockRejectedValue(new CallError("Sign in", 401))
  expect((await GET(req())).status).toBe(401)
  expect(mocks.get).not.toHaveBeenCalled()
})
it("does not offer missing or malformed releases", async () => {
  mocks.scope.mockResolvedValue({ userId: "u" })
  vi.stubEnv("ANKER_CALL_RELEASES", ""); vi.stubEnv("ANKER_CALL_BLOB_TOKEN", "test")
  expect((await GET(req())).status).toBe(404)
  vi.stubEnv("ANKER_CALL_RELEASES", JSON.stringify([{ platform: "windows-x64", pathname: "https://evil.example/installer.exe" }]))
  expect(() => callReleases()).toThrow()
  expect(mocks.get).not.toHaveBeenCalled()
})
it("streams a private approved artifact without exposing its storage URL or token", async () => {
  mocks.scope.mockResolvedValue({ userId: "u" })
  vi.stubEnv("ANKER_CALL_BLOB_TOKEN", "server-secret")
  vi.stubEnv("ANKER_CALL_RELEASES", JSON.stringify([{ platform:"windows-x64",version:"1.0.0",pathname:"call-intelligence/1.0.0/windows.exe",filename:"Anker-1.0.0.exe",size:3,sha256:"a".repeat(64),approved:true }]))
  mocks.get.mockResolvedValue({statusCode:200,blob:{size:3},stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close()}})})
  const response=await GET(req())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toContain("no-store")
  expect(response.headers.get("location")).toBeNull()
  expect(mocks.get.mock.lastCall?.[1]).toMatchObject({access:"private",token:"server-secret"})
  expect((await response.arrayBuffer()).byteLength).toBe(3)
})
