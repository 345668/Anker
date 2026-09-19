#!/usr/bin/env node
/**
 * Publish desktop-companion installers to the private blob store and print the
 * manifest to set as ANKER_CALL_RELEASES.
 *
 *   node scripts/publish-call-release.mjs ~/Call-Intelligence/dist/*.zip ...
 *
 * Needs ANKER_CALL_BLOB_TOKEN in the environment — the same token the download
 * endpoint reads. Nothing here is destructive: it uploads under a
 * version-scoped path and prints the manifest for you to review and set
 * yourself. It never touches a running deployment.
 *
 * WHY A SCRIPT RATHER THAN AN UPLOAD FORM
 * The manifest carries `approved: true`, which lib/calls/releases.ts documents
 * as meaning a human confirmed the build was signed, notarised and reviewed.
 * A button in an admin page would make that a click; keeping it here keeps it a
 * deliberate act with the artifacts in hand.
 *
 * THIS SCRIPT DOES NOT MAKE A BUILD DISTRIBUTABLE.
 * It refuses macOS artifacts that are not signed and notarised, because an
 * ad-hoc-signed .app fails Gatekeeper after download and macOS tells the user
 * it is damaged. Publishing one would be worse than publishing nothing.
 */
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { basename } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { put } from "@vercel/blob"

const run = promisify(execFile)

/** Filenames electron-builder produces: anker-call-intelligence-<ver>-<os>-<arch>.<ext> */
const NAME = /^anker-call-intelligence-(\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?)-(mac|win|linux)-(x64|arm64)\.(zip|exe|AppImage)$/
const PLATFORM = { "mac-arm64": "mac-arm64", "mac-x64": "mac-x64", "win-x64": "windows-x64", "linux-x64": "linux-x64", "linux-arm64": "linux-arm64" }

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

/**
 * A notarised zip is stapled, so `spctl` accepts it offline. This is the check
 * that distinguishes "signed on my machine" from "will open on someone else's".
 */
async function gatekeeperAccepts(file) {
  try {
    await run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", file])
    return true
  } catch {
    return false
  }
}

const files = process.argv.slice(2)
if (!files.length) fail("Usage: node scripts/publish-call-release.mjs <artifact> [artifact...]")

const token = process.env.ANKER_CALL_BLOB_TOKEN
if (!token) fail("ANKER_CALL_BLOB_TOKEN is not set. Pull it from the Vercel project that serves the downloads.")

const manifest = []
for (const file of files) {
  const name = basename(file)
  const match = NAME.exec(name)
  if (!match) fail(`${name} is not a recognised artifact name.\n  Expected anker-call-intelligence-<version>-<os>-<arch>.<ext>, which is what electron-builder.cjs produces.`)
  const [, version, os, arch, ext] = match
  const platform = PLATFORM[`${os}-${arch}`]
  if (!platform) fail(`${name}: unsupported platform ${os}-${arch}.`)

  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) fail(`${file} does not exist.`)

  if (os === "mac") {
    if (process.platform !== "darwin") fail(`${name} is a macOS build, and its signature can only be verified on a Mac. Publish macOS artifacts from macOS.`)
    if (!(await gatekeeperAccepts(file))) {
      fail(`${name} is not signed and notarised — Gatekeeper rejects it.\n` +
        `  A download of this file would tell the user the app is damaged and should be moved to the Bin.\n` +
        `  Rebuild with MAC_SIGN=1 and APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID set.`)
    }
    console.log(`  ✓ ${name} passes Gatekeeper`)
  } else if (os === "win") {
    console.warn(`  ! ${name} — Windows signing is not verified here. If this installer is unsigned, SmartScreen will warn every user who runs it.`)
  }

  const bytes = await readFile(file)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const pathname = `call-intelligence/${version}/${name}`

  // addRandomSuffix would break the manifest's pathname, which is what the
  // download endpoint fetches by.
  await put(pathname, bytes, { access: "private", token, contentType: "application/octet-stream", addRandomSuffix: false })
  console.log(`  ↑ ${pathname} (${(info.size / 1e6).toFixed(1)} MB)`)

  manifest.push({ platform, version, pathname, filename: name, sha256, size: info.size, approved: true })
}

const platforms = manifest.map(m => m.platform)
if (new Set(platforms).size !== platforms.length) fail("Two artifacts claim the same platform — the manifest allows one build per platform.")
if (manifest.length > 5) fail("The manifest accepts at most 5 releases.")

console.log(`\nUploaded ${manifest.length}. Set this as ANKER_CALL_RELEASES, then redeploy:\n`)
console.log(JSON.stringify(manifest))
console.log(`\n  vercel env rm ANKER_CALL_RELEASES production\n  vercel env add ANKER_CALL_RELEASES production\n`)
console.log("Every entry is marked approved:true — that asserts you signed, notarised and reviewed these builds.\n")
