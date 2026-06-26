/**
 * Legal & Compliance — entity + document catalogue.
 *
 * Canonical source-of-truth for the fund-formation structure:
 *
 *   3 entity kinds: Management Company → General Partner → Fund
 *   13 standard documents distributed across them
 *
 * Used by lib/portfolio/legal.ts to auto-seed a fund's legal entities
 * + documents on first read. The catalogue lives in TS so adding a
 * document or renaming an entity is one edit (no DB migration).
 *
 * The doc_key strings are stable IDs — used as jsonb keys for field
 * mappings (phase 2) and as the basis of template file names (phase 6).
 * Don't rename them lightly.
 */

// ── entity kinds ────────────────────────────────────────────────────────

export type EntityKind = "management_company" | "general_partner" | "fund"

export const ENTITY_KINDS: EntityKind[] = ["management_company", "general_partner", "fund"]

export const ENTITY_LABELS: Record<EntityKind, string> = {
  management_company: "Management Company",
  general_partner: "General Partner",
  fund: "Limited Partner",
}

/** Default suffix appended to the fund name to derive each entity's legal
 *  name. The screenshot used "Summit Venture Studio Fund II Management,
 *  LLC" / "... GP, LLC" / "Summit Venture Studio Fund II" — same shape. */
export const ENTITY_NAME_SUFFIX: Record<EntityKind, string> = {
  management_company: "Management, LLC",
  general_partner: "GP, LLC",
  fund: "",
}

// ── documents ──────────────────────────────────────────────────────────

export interface DocumentDef {
  key: string                  // stable slug
  title: string                // display name
  shortTitle: string           // tab label (≤ 14 chars)
  entityKind: EntityKind       // which entity owns this doc
  /** Phase-2 hook: which field-section the doc primarily concerns. */
  primarySection?: string
  /** Phase-6 hook: filename of the template (e.g. "cert-of-lp.md"). */
  templateFile: string
  /** Compact summary shown on hover / in audit emails. */
  description: string
}

export const DOCUMENT_CATALOGUE: DocumentDef[] = [
  // ─── Management Company (4) ──────────────────────────────────────────
  {
    key: "fm_authorization_to_act_as_organizer",
    title: "FM Authorization to Act as Organizer",
    shortTitle: "FM Auth",
    entityKind: "management_company",
    primarySection: "legal_compliance",
    templateFile: "fm-authorization.md",
    description:
      "Authorizes the named organizer to file the Certificate of Formation " +
      "for the Management Company.",
  },
  {
    key: "fm_certificate_of_formation",
    title: "FM Certificate of Formation",
    shortTitle: "FM Cert",
    entityKind: "management_company",
    primarySection: "legal_compliance",
    templateFile: "fm-cert-of-formation.md",
    description:
      "State-filed formation document creating the Management Company LLC.",
  },
  {
    key: "fm_initial_llc_agreement",
    title: "FM Initial LLC Agreement",
    shortTitle: "FM LLCA",
    entityKind: "management_company",
    primarySection: "legal_compliance",
    templateFile: "fm-initial-llca.md",
    description:
      "Initial operating agreement governing the Management Company.",
  },
  {
    key: "investment_management_agreement",
    title: "Investment Management Agreement",
    shortTitle: "IMA",
    entityKind: "management_company",
    primarySection: "terms_structure",
    templateFile: "ima.md",
    description:
      "Agreement under which the Management Company provides investment " +
      "advisory services to the Fund.",
  },

  // ─── General Partner (3) ─────────────────────────────────────────────
  {
    key: "gp_authorization_to_act_as_organizer",
    title: "GP Authorization to Act as Organizer",
    shortTitle: "GP Auth",
    entityKind: "general_partner",
    primarySection: "legal_compliance",
    templateFile: "gp-authorization.md",
    description:
      "Authorizes the organizer to file the GP LLC formation paperwork.",
  },
  {
    key: "gp_certificate_of_formation",
    title: "GP Certificate of Formation",
    shortTitle: "GP Cert",
    entityKind: "general_partner",
    primarySection: "legal_compliance",
    templateFile: "gp-cert-of-formation.md",
    description: "State-filed formation document creating the GP LLC.",
  },
  {
    key: "gp_initial_llc_agreement",
    title: "GP Initial LLC Agreement",
    shortTitle: "GP LLCA",
    entityKind: "general_partner",
    primarySection: "legal_compliance",
    templateFile: "gp-initial-llca.md",
    description: "Initial operating agreement governing the GP LLC.",
  },

  // ─── Fund / Limited Partner layer (6) ────────────────────────────────
  {
    key: "certificate_of_limited_partnership",
    title: "Certificate of Limited Partnership",
    shortTitle: "Cert LP",
    entityKind: "fund",
    primarySection: "legal_compliance",
    templateFile: "cert-of-lp.md",
    description:
      "State-filed formation document creating the Limited Partnership.",
  },
  {
    key: "initial_limited_partnership_agreement",
    title: "Initial Limited Partnership Agreement",
    shortTitle: "Initial LPA",
    entityKind: "fund",
    primarySection: "terms_structure",
    templateFile: "initial-lpa.md",
    description:
      "Initial LPA executed at fund formation; superseded by the A&R LPA " +
      "at first close.",
  },
  {
    key: "accredited_investor_certification",
    title: "Accredited Investor Certification",
    shortTitle: "AIC",
    entityKind: "fund",
    primarySection: "fundraising_investors",
    templateFile: "aic.md",
    description:
      "LP-executed certification that they qualify as an accredited " +
      "investor under SEC rules.",
  },
  {
    key: "private_placement_memorandum_venture_capital",
    title: "Private Placement Memorandum (Venture Capital)",
    shortTitle: "PPM",
    entityKind: "fund",
    primarySection: "strategy_market",
    templateFile: "ppm-vc.md",
    description:
      "Marketing + disclosure document presenting the fund strategy, " +
      "terms, team, and risk factors to prospective LPs.",
  },
  {
    key: "amended_restated_lpa_venture_capital",
    title: "Amended & Restated LPA (Venture Capital)",
    shortTitle: "A&R LPA",
    entityKind: "fund",
    primarySection: "terms_structure",
    templateFile: "ar-lpa-vc.md",
    description:
      "Final LPA executed at first close. Governs the partnership for the " +
      "life of the fund.",
  },
  {
    key: "subscription_agreement_venture_capital",
    title: "Subscription Agreement (Venture Capital)",
    shortTitle: "Sub Agreement",
    entityKind: "fund",
    primarySection: "fundraising_investors",
    templateFile: "subscription-vc.md",
    description:
      "LP-executed commitment + representations document binding the LP " +
      "to the LPA.",
  },

  // ─── Fund operations layer (5) — added in the +5 batch ──────────────
  {
    key: "form_d_notice_of_exempt_offering",
    title: "Form D — Notice of Exempt Offering of Securities",
    shortTitle: "Form D",
    entityKind: "fund",
    primarySection: "legal_compliance",
    templateFile: "form-d.md",
    description:
      "SEC notice (Reg D / Section 4(a)(5)) filed within 15 days of first " +
      "sale. Identifies issuer, exemption claimed, offering size, investor " +
      "count.",
  },
  {
    key: "form_adv_part_2a_brochure",
    title: "Form ADV Part 2A — Investment Adviser Brochure",
    shortTitle: "Form ADV 2A",
    entityKind: "management_company",
    primarySection: "legal_compliance",
    templateFile: "form-adv-2a.md",
    description:
      "Plain-English disclosure brochure required of every SEC-registered " +
      "or state-registered investment adviser. ERAs file Part 1A only.",
  },
  {
    key: "nvca_management_rights_letter",
    title: "Management Rights Letter (NVCA Model)",
    shortTitle: "Mgmt Rights",
    entityKind: "fund",
    primarySection: "operations_reporting",
    templateFile: "mgmt-rights-letter.md",
    description:
      "Letter granting the Fund consultation/information rights in each " +
      "portfolio company so the Fund qualifies as a VCOC under ERISA " +
      "Section 3(42).",
  },
  {
    key: "side_letter_template",
    title: "Side Letter Template",
    shortTitle: "Side Letter",
    entityKind: "fund",
    primarySection: "fundraising_investors",
    templateFile: "side-letter.md",
    description:
      "Bespoke LP terms outside the LPA (MFN, fee discounts, reporting " +
      "uplifts, tax/ERISA carve-outs). Subject to the LPA's MFN process.",
  },
  {
    key: "investor_suitability_questionnaire",
    title: "Investor Suitability & AML/KYC Questionnaire",
    shortTitle: "Suitability Q",
    entityKind: "fund",
    primarySection: "fundraising_investors",
    templateFile: "investor-questionnaire.md",
    description:
      "Onboarding questionnaire collecting accredited-investor status, " +
      "source of funds, KYC documents, FATCA/CRS tax certifications.",
  },

  // ─── EU fund-formation layer (6) — Luxembourg SCSp/RAIF path ────────-
  {
    key: "aifm_registration",
    title: "AIFM Registration with Home Regulator (Article 3 AIFMD)",
    shortTitle: "AIFM Reg",
    entityKind: "management_company",
    primarySection: "legal_compliance",
    templateFile: "aifm-registration.md",
    description:
      "Sub-threshold AIFM registration with the home Member State " +
      "regulator (Article 3(2)(b) of Directive 2011/61/EU). Required for " +
      "VC AIFMs with < EUR 500M AUM. Full authorisation needed above " +
      "the threshold.",
  },
  {
    key: "euveca_registration",
    title: "EuVECA Registration (Article 14)",
    shortTitle: "EuVECA",
    entityKind: "fund",
    primarySection: "legal_compliance",
    templateFile: "euveca-registration.md",
    description:
      "EuVECA passport registration under Regulation (EU) No 345/2013. " +
      "Light-touch pan-EU marketing regime for sub-EUR 500M VC funds " +
      "investing 70%+ in qualifying portfolio undertakings.",
  },
  {
    key: "lux_scsp_partnership_agreement",
    title: "Luxembourg SCSp Limited Partnership Agreement",
    shortTitle: "SCSp LPA",
    entityKind: "fund",
    primarySection: "terms_structure",
    templateFile: "lux-scsp-lpa.md",
    description:
      "Société en commandite spéciale partnership agreement under " +
      "Articles 22-1 to 22-10 of the Luxembourg Law of 10 August 1915 " +
      "(as amended 2013). The dominant Luxembourg VC structure.",
  },
  {
    key: "lux_raif_issuing_document",
    title: "Luxembourg RAIF Issuing Document",
    shortTitle: "RAIF Doc",
    entityKind: "fund",
    primarySection: "fundraising_investors",
    templateFile: "lux-raif-issuing-doc.md",
    description:
      "Reserved Alternative Investment Fund offering memorandum under " +
      "the Luxembourg Law of 23 July 2016. No CSSF product approval " +
      "required — supervision flows through the authorised AIFM.",
  },
  {
    key: "sfdr_precontractual_disclosure",
    title: "SFDR Pre-Contractual Disclosure (Article 6 / 8 / 9)",
    shortTitle: "SFDR",
    entityKind: "fund",
    primarySection: "operations_reporting",
    templateFile: "sfdr-precontractual.md",
    description:
      "Sustainability-related disclosure for financial market " +
      "participants under Regulation (EU) 2019/2088. Article 6 = no ESG " +
      "claim · Article 8 = promotes E/S characteristics · Article 9 = " +
      "sustainable investment objective.",
  },
  {
    key: "aifmd_premarketing_notification",
    title: "AIFMD Pre-Marketing Notification (Article 30a)",
    shortTitle: "Pre-Marketing",
    entityKind: "fund",
    primarySection: "legal_compliance",
    templateFile: "aifmd-premarketing.md",
    description:
      "Notification to the home Member State regulator before any " +
      "pre-marketing activity in another EU Member State, per Article " +
      "30a of AIFMD (added by Directive (EU) 2019/1160 — Cross-Border " +
      "Distribution of Funds).",
  },
]

// ── derived indexes ─────────────────────────────────────────────────────

export const DOCS_BY_KEY: Record<string, DocumentDef> = Object.fromEntries(
  DOCUMENT_CATALOGUE.map((d) => [d.key, d]),
)

export function docsForEntity(kind: EntityKind): DocumentDef[] {
  return DOCUMENT_CATALOGUE.filter((d) => d.entityKind === kind)
}

/** Total document count. Currently 24 (13 US-formation + 5 US fund-ops + 6 EU fund-formation). */
export const TOTAL_DOCUMENTS = DOCUMENT_CATALOGUE.length
