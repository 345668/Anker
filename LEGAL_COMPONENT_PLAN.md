# Legal & Compliance — build plan

Six phases. Each phase ships independently and gracefully degrades if the next
phase hasn't been written. Mirrors the structure we used for the fund
assessment so the two components feel like siblings.

## What we're building

A fund-formation workflow that pairs with the assessment system. Three
primary views:

1. **Canvas** — Three-entity hierarchy (Management Company → GP → Fund) with
   document cards under each entity. Each doc shows its own completion %.
2. **Fields** — 94 fields the documents need, organised by section, with
   three-state approval workflow (Empty → Filled → Approved). Filterable
   by status and document.
3. **Document review** — A doc-by-doc viewer that surfaces every `[TBD]`
   placeholder in the rendered text and a right-rail Field Review panel
   that walks the editor through each one.

Plus a header with `0 legal credits`, Draft status, Submit-for-Legal-Review
CTA, and a Purchase-required lock.

## Phases

### Phase 1 — Entity hierarchy + canvas viewer

- DB: `legal_entities` (id, fund_id, kind, name, slug) and `legal_documents`
  (id, fund_id, entity_id, doc_key, title, status, completion_pct).
- Library: `lib/portfolio/legal-catalogue.ts` defines the 3 entity kinds and
  13 standard documents per kind. `lib/portfolio/legal.ts` is the storage
  layer with auto-seed on first read.
- API: `GET /api/portfolio/funds/[id]/legal` returns the tree.
- Page: `/dashboard/portfolio/fund/legal` renders the canvas.
- Header link from the fund detail page.

### Phase 2 — 94-field taxonomy + 3-state approval workflow

- `lib/portfolio/legal-fields-taxonomy.ts` — 94 fields across six sections:
  Strategy & Market (12), Terms & Structure (14), Fundraising & Investors
  (4), Operations & Reporting (5), Team & Track Record (15), Legal &
  Compliance (44).
- Each field references the documents it appears in.
- JSONB on `funds.legal_fields` (values) + `funds.legal_field_approvals`
  (per-field approval state with timestamp + approver).
- Editor at `/dashboard/portfolio/fund/legal/fields` with the All / Empty
  / Filled / Approved tabs from the screenshot, plus the green/orange/grey
  progress bar header.

### Phase 3 — Computed fields + AI generation

- Computed: Commitment Period Anniversary, Final Closing Period (Months),
  LP Split %, Management Fee Post-Investment Period, Investment Strategy
  Type, GP Commitment $.
- "Edit inputs" affordance on each computed field.
- Qwen-powered AI for the narrative fields (Affiliate Services, Material
  Conflicts, Professional Long-Term Relationships, Potential Third-Party
  Conflicts of Interest). Confidence bars matching the assessment
  treatment.

### Phase 4 — Document review viewer

- Per-document viewer with horizontal tabs (Cert LP | Initial LPA | AIC |
  PPM | A&R LPA | Sub Agreement | IMA | etc.).
- Document body renders the template Markdown with `[TBD]` placeholders
  visually highlighted.
- Right rail `Field Review` panel paginates through the unfilled fields
  for that doc with per-field Approve buttons.
- "Edit in document →" link from the field grid deep-links here and
  scrolls to the right placeholder.

### Phase 5 — Submit-for-Legal-Review workflow + credits

- State machine: Draft → Pending Review → Reviewed → Approved → Filed.
- Legal-credits balance on the fund, with a Stripe purchase flow (stub).
- On Submit: bundle all docs (PDF or zip), email legal counsel, lock
  editing for the duration of the review.
- Audit trail of who approved which fields when.

### Phase 6 — The 13 actual templates (LAST per user request)

- `lib/portfolio/legal-templates/*.md` — one template per document with
  `{{field_key}}` placeholders.
- Renderer that substitutes field values + leaves `[TBD]` for unfilled.
- DOCX + PDF export so legal counsel gets the bundle in the format they
  want.

## Storage at a glance

```
funds
  └── legal_entities        (3 per fund, auto-seeded)
        └── legal_documents (13 per fund, parented to entities)
  legal_fields jsonb        (94 values)
  legal_field_approvals jsonb (94 approval records)
  legal_status              (Draft / PendingReview / Reviewed / Approved / Filed)
  legal_credits             (integer balance)
```

## Order of execution

Build 1 → 2 → 3 → 4 → 5 → 6. Phase 6 lands last because it's the most
content-heavy and benefits from having the infrastructure already in place.
