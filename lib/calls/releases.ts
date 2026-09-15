import { z } from "zod"
const releaseSchema = z.object({
  platform: z.enum(["windows-x64", "mac-arm64", "mac-x64", "linux-x64", "linux-arm64"]),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/),
  pathname: z.string().regex(/^call-intelligence\/[A-Za-z0-9/_.-]+$/).refine(p => !p.includes("..")),
  filename: z.string().regex(/^[A-Za-z0-9_.-]+\.(exe|zip|AppImage)$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive(),
  // Set only after native signature/notarization and release review, not at build time.
  approved: z.literal(true),
})
export function callReleases() {
  const raw = process.env.ANKER_CALL_RELEASES
  if (!raw || !process.env.ANKER_CALL_BLOB_TOKEN) return []
  const releases = z.array(releaseSchema).max(5).parse(JSON.parse(raw))
  if (new Set(releases.map(r => r.platform)).size !== releases.length) throw new Error("Duplicate release platform")
  return releases
}
