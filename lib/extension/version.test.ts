import { describe, expect, it } from "vitest"
import { cleanVersion, compareVersions, extensionVersionState, LATEST_EXTENSION_VERSION } from "./version"

describe("extension version", () => {
  it("compares each part as a number", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1)
    expect(compareVersions("0.6.0", "0.11.1")).toBe(-1)
    expect(compareVersions("0.11.1", "0.11.1")).toBe(0)
  })
  it("accepts only plain major.minor.patch", () => {
    expect(cleanVersion("0.11.1")).toBe("0.11.1")
    expect(cleanVersion("0.11.1-beta; drop table")).toBeNull()
    expect(cleanVersion(null)).toBeNull()
  })
  it("tells the person what to do", () => {
    expect(extensionVersionState(null, false).value).toBe("Not installed")
    expect(extensionVersionState(null, true).value).toBe("Not reported")
    expect(extensionVersionState("0.6.0", true).sub).toContain("Update available")
    expect(extensionVersionState(LATEST_EXTENSION_VERSION, true).sub).toBe("Up to date")
    expect(extensionVersionState("0.99.0", true).tone).toBe("good")
  })
})
