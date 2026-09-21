import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Download, ShieldCheck } from "lucide-react"
import { requirePersona } from "@/lib/auth/persona-guard"
import { callScope } from "@/lib/calls/access"
import { callReleases } from "@/lib/calls/releases"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Install the desktop companion — Anker",
  description: "Download and install Halyard, the Anker call intelligence desktop companion.",
}

/**
 * Private install page for the desktop companion.
 *
 * Deliberately not a public marketing page: every installer is served by
 * /api/calls/download, which requires a session and streams from a private blob
 * store. Linking a file here that is not in the validated manifest would
 * bypass that, so the page renders only what callReleases() returns.
 *
 * The releases are read on the server rather than fetched from
 * /api/calls/releases, so the page cannot render a download control for
 * something the download endpoint would then refuse.
 */

const PLATFORMS: Record<string, { label: string; os: "mac" | "win" | "linux"; note: string }> = {
  "mac-arm64": { label: "macOS · Apple silicon", os: "mac", note: "M1 and later" },
  "mac-x64": { label: "macOS · Intel", os: "mac", note: "Pre-2020 Macs" },
  "windows-x64": { label: "Windows · 64-bit", os: "win", note: "Windows 10 and 11" },
  "linux-x64": { label: "Linux · x86-64", os: "linux", note: "AppImage" },
  "linux-arm64": { label: "Linux · ARM64", os: "linux", note: "AppImage" },
}

const STEPS: Record<"mac" | "win" | "linux", string[]> = {
  mac: [
    "Open the downloaded .zip — it expands to Halyard.app.",
    "Drag the app into your Applications folder.",
    "Open it. The first launch asks for Screen Recording and Microphone permission; both are required for capture, and macOS will ask you to quit and reopen the app once after granting them.",
  ],
  win: [
    "Run the downloaded .exe. It installs for your user account only, so it never asks for an administrator password.",
    "Choose an install location if you want one other than the default.",
    "Launch it from the Start menu.",
  ],
  linux: [
    "Mark the download executable: chmod +x halyard-*.AppImage",
    "Run it directly — an AppImage needs no installation.",
    "Your desktop may ask to integrate it into the application menu; either answer is fine.",
  ],
}

function bytes(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`
}

export default async function DesktopDownloadPage() {
  await requirePersona(["founder", "vc"])
  const scope = await callScope().catch(() => null)
  if (!scope) redirect("/dashboard/calls")

  // A malformed manifest is an operator error, not a visitor's problem: show
  // the same "not published yet" state rather than a stack trace.
  let releases: ReturnType<typeof callReleases> = []
  let manifestBroken = false
  try { releases = callReleases() } catch { manifestBroken = true }

  const osPresent = Array.from(new Set(releases.map(r => PLATFORMS[r.platform]?.os).filter(Boolean))) as Array<"mac" | "win" | "linux">

  return <div className="mx-auto max-w-3xl px-6 py-10">
    <Link href="/dashboard/calls" className="inline-flex items-center gap-2 text-sm underline"><ArrowLeft size={14} /> Call Intelligence</Link>
    <h1 className="mt-5 font-serif text-4xl">Desktop companion</h1>
    <p className="mt-3 leading-relaxed text-muted-foreground">Captures a call on your own computer. With local Whisper the audio never leaves the machine, and only the transcript you explicitly choose is uploaded to this workspace.</p>

    {!releases.length ? (
      <div className="mt-8 border p-5">
        <h2 className="text-lg">Not published yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {manifestBroken
            ? "The release manifest is configured but invalid, so nothing is being offered. This is a configuration problem on our side, not a problem with your account."
            : "No signed installer has been published for any platform yet. The companion can be built and run from source in the meantime."}
        </p>
        <a className="mt-4 inline-block text-sm underline" href="https://github.com/345668/Halyard" target="_blank" rel="noreferrer">Source and build instructions</a>
      </div>
    ) : <>
      <ul className="mt-8 space-y-4">
        {releases.map(r => {
          const meta = PLATFORMS[r.platform]
          return <li key={r.platform} className="border p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg">{meta?.label ?? r.platform}</h2>
              <span className="text-sm text-muted-foreground">Version {r.version} · {bytes(r.size)}{meta?.note ? ` · ${meta.note}` : ""}</span>
            </div>
            <a href={`/api/calls/download?platform=${r.platform}`}
              className="mt-4 inline-flex min-h-12 items-center gap-2 bg-foreground px-5 text-background transition-opacity hover:opacity-85">
              <Download size={16} /> Download {r.filename}
            </a>
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Verify this download</summary>
              <p className="mt-2 leading-relaxed">Compare the SHA-256 of the file you received against the one below. They must match exactly.</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all border p-2">{r.sha256}</pre>
              <p className="mt-2">macOS and Linux: <code>shasum -a 256 {r.filename}</code></p>
              <p>Windows: <code>certutil -hashfile {r.filename} SHA256</code></p>
            </details>
          </li>
        })}
      </ul>

      {osPresent.map(os => <section key={os} className="mt-8 border-t pt-6">
        <h2 className="text-lg">Installing on {os === "mac" ? "macOS" : os === "win" ? "Windows" : "Linux"}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          {STEPS[os].map(step => <li key={step}>{step}</li>)}
        </ol>
      </section>)}

      <section className="mt-8 flex gap-3 border-t pt-6 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>These installers are signed and notarised, so they open without a security warning. If your computer warns you that this app is damaged or from an unidentified developer, <strong>do not bypass it</strong> — the file did not come from us. Download it again from this page and tell us.</p>
      </section>
    </>}

    <section className="mt-8 border-t pt-6 text-sm leading-relaxed text-muted-foreground">
      <h2 className="text-foreground">Connecting it to this workspace</h2>
      <p className="mt-2">Create a device token under <Link href="/dashboard/calls" className="underline">Desktop companion</Link> on the Call Intelligence page, then paste it into the app once. Tokens are per device and can be revoked from that page at any time.</p>
      {/* GPL-3.0: recipients of a binary are entitled to the source for that
          build, and a private audience is still distribution. */}
      <p className="mt-4">The companion is free software under the GPL-3.0-or-later licence. You are entitled to the <a className="underline" href="https://github.com/345668/Halyard" target="_blank" rel="noreferrer">complete source code</a> for the build you install.</p>
    </section>
  </div>
}
