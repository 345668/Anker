/**
 * Request-body validation at the route boundary.
 *
 * Most routes read `body?.field` with optional chaining, so malformed input
 * fails deep inside the handler as a generic 500 instead of a clear 400 at
 * the edge. parseJsonBody() validates against a zod schema and, on failure,
 * returns a 400 NextResponse listing the offending fields — so the same
 * `instanceof NextResponse` early-return pattern as requireUser() applies:
 *
 *   const body = await parseJsonBody(req, MySchema)
 *   if (body instanceof NextResponse) return body
 *   // body is now typed as z.infer<typeof MySchema>
 */
import { NextResponse } from "next/server"
import { z } from "zod"

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T> | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 })
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }
  return parsed.data
}
