import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { requireAiPrincipal } from "./principal"

export interface ToolArtifact { name: string; url: string; kind: "xlsx" | "docx" | "csv" | "png" | "pptx" | "pdf" }
export interface ToolResult {
  observation: string; artifact?: ToolArtifact; artifacts?: ToolArtifact[]
  /** A verified block shown to the user after the model's answer, verbatim (lib/assistant/reports.ts). */
  report?: string
  /** A short correction shown above the model's text when it may have overstated a fact (reports.ts). */
  notice?: string
  /** What was asked for and what exists, so a count the model states can be corrected in its text (reports.ts). */
  countClaim?: { asked: number; found: number }
}
export interface ToolDef {
  name: string;
  description: string;
  /** Human-readable parameter hints shown to the model. */
  params: string;
  run: (input: any) => Promise<ToolResult>;
}


export const ARTIFACT_TYPES: Record<ToolArtifact["kind"], string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv; charset=utf-8", png: "image/png", pdf: "application/pdf",
}

/** Small generated artifacts persist atomically with their access metadata. */
export async function saveArtifact(buf: Buffer, base: string, kind: ToolArtifact["kind"]): Promise<ToolArtifact> {
  const scope = await requireAiPrincipal()
  if (!ARTIFACT_TYPES[kind] || !buf.length || buf.length > 20 * 1024 * 1024) throw new Error("The generated file must be between 1 byte and 20 MB.")
  const id = randomUUID()
  const name = `${base.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "output"}.${kind}`
  await sql`INSERT INTO private_artifacts(id, user_id, org_id, scope_key, filename, content_type, content)
    VALUES (${id}, ${scope.userId}, ${scope.orgId}, ${scope.scopeKey}, ${name}, ${ARTIFACT_TYPES[kind]}, decode(${buf.toString("base64")}, 'base64'))`
  return { name, url: `/api/artifacts/${id}`, kind }
}
