/**
 * The HTTP shape of a typed AI failure. Doc 35 #5.
 *
 * Kept apart from failure.ts, which is pure, so that file can be imported by the
 * provider layer and tests without pulling in the framework.
 */
import { NextResponse } from "next/server"
import { buildFailure, failureBody, httpStatusFor, newRequestId, type AiFailure } from "./failure"

/**
 * Answer a request whose AI call produced nothing.
 *
 * The body carries a safe message, a machine-readable `code`, whether a retry is
 * worthwhile and a request id to quote. The provider's own wording is logged here
 * with the same id and goes no further: it can name hosts, models and account
 * state that a user has no business seeing.
 */
export function aiFailureResponse(
  failure: AiFailure | undefined,
  extra: Record<string, unknown> = {},
): NextResponse {
  const f = failure ?? buildFailure({ error: "no text" })
  const requestId = newRequestId()
  console.warn(`[ai] request ${requestId} failed: ${f.kind}${f.status ? ` (upstream ${f.status})` : ""}`)
  return NextResponse.json(
    { ...failureBody(f, requestId), ...extra },
    {
      status: httpStatusFor(f.kind),
      headers: {
        "Cache-Control": "private, no-store",
        ...(f.retryAfterSec ? { "Retry-After": String(f.retryAfterSec) } : {}),
      },
    },
  )
}
