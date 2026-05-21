/**
 * Anker AI Assistant API.
 *
 * POST /api/assistant   { task: string, maxSteps?: number }
 *   Runs the agentic loop (lib/assistant/agent) which can web-search,
 *   crawl, matchmake LPs, build profiles, query the DB, and generate
 *   .xlsx / .docx deliverables. Returns the reasoning steps, the final
 *   answer, and any generated file links.
 *
 * Auth: any signed-in user.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistant } from "@/lib/assistant/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const task = String(body?.task ?? "").trim();
  if (!task) return NextResponse.json({ error: "Provide a 'task'." }, { status: 400 });

  try {
    const result = await runAssistant(task, { maxSteps: Number(body?.maxSteps) || 6 });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[assistant] run failed:", e);
    return NextResponse.json({ error: e?.message ?? "Assistant run failed" }, { status: 500 });
  }
}
