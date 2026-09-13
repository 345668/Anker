import { callResponse, callScope } from "@/lib/calls/access"
import { callReleases } from "@/lib/calls/releases"
export async function GET() {
  return callResponse(async () => {
    await callScope()
    return { releases: callReleases().map(({ platform, version, filename, sha256, size }) => ({ platform, version, filename, sha256, size })) }
  })
}
