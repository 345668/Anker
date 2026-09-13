import { NextResponse } from "next/server"
/** Retired Figma workflow: no legacy fund or template context is exposed. */
function retired() { return NextResponse.json({ error: "This Figma integration has been retired. Open Deck Studio to edit and download a native deck." }, { status: 410 }) }
export const GET = retired
export const POST = retired
export const PATCH = retired
export const DELETE = retired
export const OPTIONS = retired
