/**
 * JSON Schemas for the MCP-exposed tools (app/api/mcp/route.ts).
 *
 * ToolDef.params is a human-readable hint string; these are the machine-readable
 * input schemas MCP clients validate against and use for autocompletion. Kept in a
 * separate map so the tool implementations stay untouched. Any tool without an entry
 * falls back to a permissive object schema (with the hint carried in the description).
 */

type JSONSchema = Record<string, unknown>

const INVESTOR_TYPE = ["family-office", "vc", "accelerator", "corporate", "angel", "private-equity"]
const obj = (properties: Record<string, JSONSchema>, required: string[] = [], additional = false): JSONSchema => ({
  type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: additional,
})
const str = (extra: JSONSchema = {}): JSONSchema => ({ type: "string", ...extra })
const num = (extra: JSONSchema = {}): JSONSchema => ({ type: "number", ...extra })
const bool = (): JSONSchema => ({ type: "boolean" })
const arr = (items: JSONSchema): JSONSchema => ({ type: "array", items })
const NO_INPUT = obj({}, [], false)

export const TOOL_SCHEMAS: Record<string, JSONSchema> = {
  // ── research ──────────────────────────────────────────────────────────────
  web_search: obj({ query: str(), limit: num({ minimum: 1, maximum: 25 }) }, ["query"]),
  web_crawl: obj({ url: str({ format: "uri" }) }, ["url"]),

  // ── investor discovery / matching ─────────────────────────────────────────
  query_investors: obj({
    type: str({ enum: INVESTOR_TYPE }), keyword: str(), limit: num({ minimum: 1, maximum: 50 }),
  }),
  build_investor_profile: obj({ investorId: str(), firmId: str() }),
  matchmake_lps: obj({
    fundName: str(), targetRaiseUsd: num(), sectors: arr(str()), geographicFocus: arr(str()),
    headquarters: str(), thesisKeywords: arr(str()), preferLesserKnown: bool(),
    rightSizeToTarget: bool(), excludeHouseholdNames: bool(), top: num({ minimum: 1, maximum: 200 }),
  }, ["fundName"]),
  score_investors: obj({
    thesis: str(), type: str({ enum: INVESTOR_TYPE }), keyword: str(),
    ids: arr(str()), limit: num({ minimum: 1, maximum: 40 }),
  }, ["thesis"]),
  enrich_firms: obj({
    ids: arr(str()), type: str(), keyword: str(), limit: num({ minimum: 1, maximum: 10 }),
  }),

  // ── outreach ──────────────────────────────────────────────────────────────
  draft_outreach_batch: obj({
    founder: obj({
      companyName: str(), oneLiner: str(), facts: arr(str()), calendarUrl: str({ format: "uri" }),
    }, ["companyName", "oneLiner"]),
    type: str(), keyword: str(), ids: arr(str()), limit: num({ minimum: 1, maximum: 25 }),
  }, ["founder"]),

  // ── generation ────────────────────────────────────────────────────────────
  generate_spreadsheet: obj({
    title: str(), columns: arr(str()),
    rows: arr(arr({ type: ["string", "number"] })),
  }, ["title", "columns", "rows"]),
  generate_document: obj({ title: str(), markdown: str() }, ["title", "markdown"]),
  generate_image: obj({
    prompt: str(),
    model: str({ enum: ["z-image-turbo", "qwen-image-2.0", "wan2.6-t2i"] }),
    size: str({ enum: ["1024x1024", "1024x1792", "1792x1024"] }),
  }, ["prompt"]),
  create_pitch_deck: obj({
    deck: obj({
      title: str(), subtitle: str(), author: str(),
      theme: obj({ accent: str(), background: str(), text: str(), muted: str() }, [], true),
      slides: arr(obj({}, [], true)),
    }, ["title", "slides"], true),
  }, ["deck"]),
  improve_pitch_deck: obj({
    improved: obj({}, ["title", "slides"], true),
    formats: arr(str({ enum: ["pptx", "pdf"] })),
    rationale: str(),
  }, ["improved"]),

  // ── media ─────────────────────────────────────────────────────────────────
  analyze_image: obj({ imageUrl: str({ format: "uri" }), imageBase64: str(), prompt: str() }),
  ocr_image: obj({ imageUrl: str({ format: "uri" }), imageBase64: str() }),
  translate_text: obj({ text: str(), to: str(), from: str() }, ["text", "to"]),

  // ── XLSX pipelines (base64 in, XLSX out) ─────────────────────────────────────
  enrich_db_from_xlsx: obj({
    xlsxBase64: str(), source: str(), sheet: str(), firmNameCol: str(),
  }, ["xlsxBase64", "source"], true),
  db_gap_analysis: obj({
    xlsxBase64: str(), firmType: str(), limit: num({ minimum: 1 }),
  }, ["xlsxBase64", "firmType"]),
  generate_event_outreach_drafts: obj({
    xlsxBase64: str(),
    event: obj({
      title: str(), when: str(), presenters: str(), registrationUrl: str({ format: "uri" }),
      secondaryUrl: str({ format: "uri" }),
    }, ["title", "when", "presenters", "registrationUrl"], true),
  }, ["xlsxBase64", "event"]),
  apply_template_to_outreach_drafts: obj({
    xlsxBase64: str(), subject: str(), emailTemplate: str(), dmTemplate: str(),
  }, ["xlsxBase64", "subject", "emailTemplate", "dmTemplate"], true),
  enrich_xlsx_with_llm: obj({
    xlsxBase64: str(), senderContext: str(), sheet: str(), limit: num({ minimum: 1 }),
  }, ["xlsxBase64", "senderContext"]),

  // ── platform (CRM / deals / network / inbox / fund) ──────────────────────────
  crm_overview: NO_INPUT,
  crm_search: obj({
    q: str(), stage: str(), tier: str({ enum: ["A", "B", "C"] }), limit: num({ minimum: 1, maximum: 25 }),
  }),
  crm_update_stage: obj({ entryId: str(), stage: str() }, ["entryId", "stage"]),
  crm_add_task: obj({ title: str(), entryId: str(), dueAt: str({ description: "YYYY-MM-DD" }) }, ["title"]),
  deal_pipeline: NO_INPUT,
  network_intro_paths: obj({ person: str({ description: "name or linkedin.com/in/… URL" }) }, ["person"]),
  outreach_inbox: NO_INPUT,
  fund_performance: NO_INPUT,
}

/** MCP input schema for a tool: the tight schema if we have one, else a permissive
 *  object (the human-readable hint still ships in the tool description). */
export function inputSchemaFor(name: string): JSONSchema {
  return TOOL_SCHEMAS[name] ?? { type: "object", additionalProperties: true }
}
