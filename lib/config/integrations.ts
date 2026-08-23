/**
 * Platform integration status (server-only).
 *
 * Reports which deployment-managed integrations are configured, for the read-only status
 * panel on the API-keys page. These are set via the deployment ENVIRONMENT (Vercel), not
 * through a settings UI — some (the Supabase service-role key, the cron secret) are core
 * secrets that must never be editable from the app. We expose booleans + metadata only,
 * NEVER the secret values.
 */
import "server-only"

export type IntegrationCategory = "core" | "email" | "compliance" | "documents"

export interface IntegrationStatus {
  key: string
  label: string
  /** The env var(s) that configure it. */
  envVars: string[]
  configured: boolean
  /** What breaks / is disabled when it's not set. */
  enables: string
  category: IntegrationCategory
  /** Whether it's a hard requirement for core operation vs. an optional feature. */
  required: boolean
}

const has = (...vars: string[]) => vars.every((v) => !!process.env[v])

/** Compute the current integration statuses from the environment. */
export function integrationStatuses(): IntegrationStatus[] {
  return [
    // ── Core platform ────────────────────────────────────────────────────────
    {
      key: "supabase_service_role", label: "Supabase service role", envVars: ["SUPABASE_SERVICE_ROLE_KEY"],
      configured: has("SUPABASE_SERVICE_ROLE_KEY"), category: "core", required: true,
      enables: "The full user roster on Users & roles (Auth Admin API); sign-up auto-confirm.",
    },
    {
      key: "cron_secret", label: "Cron secret", envVars: ["CRON_SECRET"],
      configured: has("CRON_SECRET"), category: "core", required: true,
      enables: "Scheduled jobs (deadline reminders, compliance digest, outreach scheduler). Without it crons fail closed (401).",
    },
    {
      key: "blob_storage", label: "Vercel Blob storage", envVars: ["BLOB_READ_WRITE_TOKEN"],
      configured: has("BLOB_READ_WRITE_TOKEN"), category: "documents", required: false,
      enables: "Persistent storage for generated documents (K-1s, capital-call/distribution notices).",
    },
    // ── Email ────────────────────────────────────────────────────────────────
    {
      key: "resend", label: "Resend (email)", envVars: ["RESEND_API_KEY"],
      configured: has("RESEND_API_KEY"), category: "email", required: false,
      enables: "Sending outreach and LP notices (send_outreach, capital-call/distribution notices).",
    },
    // ── Compliance / integrations ──────────────────────────────────────────────
    {
      key: "opensanctions", label: "OpenSanctions (KYC screening)", envVars: ["OPENSANCTIONS_API_KEY"],
      configured: has("OPENSANCTIONS_API_KEY"), category: "compliance", required: false,
      enables: "Live sanctions / PEP / adverse-media screening. Without it, KYC falls back to the local dev watchlist (not a reliable clear).",
    },
    {
      key: "companies_house", label: "Companies House (UK filings)", envVars: ["COMPANIES_HOUSE_API_KEY"],
      configured: has("COMPANIES_HOUSE_API_KEY"), category: "compliance", required: false,
      enables: "Syncing statutory filing deadlines (confirmation statement, annual accounts) into the equity-compliance register.",
    },
    {
      key: "comp_benchmark", label: "Compensation benchmark provider", envVars: ["COMP_BENCHMARK_API_URL", "COMP_BENCHMARK_API_KEY"],
      configured: has("COMP_BENCHMARK_API_URL"), category: "compliance", required: false,
      enables: "Pulling market salary + equity ranges into comp bands (COMP_BENCHMARK_API_KEY optional bearer).",
    },
    // ── Documents / signing ────────────────────────────────────────────────────
    {
      key: "docusign", label: "DocuSign (e-signature)", envVars: ["DOCUSIGN_BASE_URI", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_ACCESS_TOKEN"],
      configured: has("DOCUSIGN_BASE_URI", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_ACCESS_TOKEN"), category: "documents", required: false,
      enables: "Sending contracts for e-signature. Needs all three vars.",
    },
    {
      key: "doc_worker", label: "Doc-worker (LaTeX / LibreOffice)", envVars: ["DOC_WORKER_URL", "DOC_WORKER_TOKEN"],
      configured: has("DOC_WORKER_URL"), category: "documents", required: false,
      enables: "High-fidelity typeset PDFs (render_document_pro). Falls back to serverless docx when unset. DOC_WORKER_TOKEN optional bearer.",
    },
  ]
}
