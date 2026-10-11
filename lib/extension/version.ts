/** The newest released LinkedIn extension; bump with extensions/linkedin/package.json when a build is published. */
export const LATEST_EXTENSION_VERSION = "0.11.1"

const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/

/** A reported version, or null when the header is absent or not plain major.minor.patch. */
export function cleanVersion(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  return SEMVER.test(t) ? t : null
}

/** Numeric comparison per part: 0.10.0 is newer than 0.9.0. */
export function compareVersions(a: string, b: string): number {
  const x = a.split(".").map(Number)
  const y = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

export type ExtensionVersionState = { tone: "good" | "warn" | "muted"; value: string; sub: string }

/** What the extension page shows for the installed build. */
export function extensionVersionState(
  installed: string | null,
  hasActiveToken: boolean,
): ExtensionVersionState {
  if (!hasActiveToken)
    return { tone: "muted", value: "Not installed", sub: `Latest is ${LATEST_EXTENSION_VERSION}` }
  if (!installed)
    return {
      tone: "warn",
      value: "Not reported",
      sub: `Older than 0.11.1 or not used yet. Update to ${LATEST_EXTENSION_VERSION}.`,
    }
  if (compareVersions(installed, LATEST_EXTENSION_VERSION) >= 0)
    return { tone: "good", value: installed, sub: "Up to date" }
  return { tone: "warn", value: installed, sub: `Update available: ${LATEST_EXTENSION_VERSION}` }
}
