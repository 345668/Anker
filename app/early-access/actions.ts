"use server"
import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { rateLimit } from "@/lib/rate-limit"
import { saveWaitlistRequest, type WaitlistInput, type WaitlistResult } from "@/lib/marketing/waitlist"
export async function submitEarlyAccessRequest(input: WaitlistInput): Promise<WaitlistResult> {
  const requestHeaders = await headers()
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const key = createHash("sha256").update(ip).digest("hex")
  if (!rateLimit(`waitlist:${key}`, { limit: 8, windowMs: 600_000 }).ok) {
    return { success: false, message: "Please wait a few minutes before trying again." }
  }
  return saveWaitlistRequest(input)
}
