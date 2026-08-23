/**
 * DocuSign e-signature seam.
 *
 * Sends a document out for signature via the DocuSign eSignature REST API (envelopes).
 * Inert until configured: with no DocuSign env the client reports "not configured" and
 * the caller degrades gracefully (same pattern as lib/docworker/client). Never throws —
 * returns a typed result so a route can surface the reason.
 *
 * Env:
 *   DOCUSIGN_BASE_URI       e.g. https://demo.docusign.net  (or your prod account host)
 *   DOCUSIGN_ACCOUNT_ID     the API account id (GUID)
 *   DOCUSIGN_ACCESS_TOKEN   an OAuth access token (JWT or Authorization-Code grant)
 *
 * Obtaining/refreshing the token (JWT grant) is an auth concern owned by the deployment;
 * this seam consumes a valid access token. Wire it once and the "Send for signature"
 * action goes live with no code change.
 */

export interface Signer {
  email: string
  name: string
}

export interface SendForSignatureInput {
  /** Email subject the signer sees. */
  subject: string
  /** Base64 of the document to sign (PDF/DOCX). */
  documentBase64: string
  documentName: string
  /** File extension without the dot. Default "pdf". */
  fileExtension?: string
  signers: Signer[]
}

export interface SendForSignatureResult {
  ok: boolean
  envelopeId?: string
  /** DocuSign envelope status (usually "sent"). */
  status?: string
  error?: string
}

export function isDocuSignConfigured(): boolean {
  return !!(process.env.DOCUSIGN_BASE_URI && process.env.DOCUSIGN_ACCOUNT_ID && process.env.DOCUSIGN_ACCESS_TOKEN)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const TIMEOUT_MS = Math.min(60_000, Math.max(5_000, Number(process.env.DOCUSIGN_TIMEOUT_MS) || 30_000))

/** Create + send a signature envelope. Never throws. */
export async function sendForSignature(input: SendForSignatureInput): Promise<SendForSignatureResult> {
  const base = process.env.DOCUSIGN_BASE_URI
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID
  const token = process.env.DOCUSIGN_ACCESS_TOKEN
  if (!base || !accountId || !token) {
    return { ok: false, error: "DocuSign is not configured — set DOCUSIGN_BASE_URI, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_ACCESS_TOKEN to enable e-signature." }
  }
  const signers = (input.signers ?? []).filter((s) => s?.email && EMAIL_RE.test(s.email))
  if (!signers.length) return { ok: false, error: "Provide at least one signer with a valid email." }
  if (!input.documentBase64) return { ok: false, error: "Provide the document (base64) to send for signature." }

  // Each signer gets a SignHere tab anchored on "/sig/" if present, else placed near the
  // end of page 1 as a sensible default.
  const envelope = {
    emailSubject: input.subject || "Please sign",
    documents: [{
      documentBase64: input.documentBase64,
      name: input.documentName || "Document",
      fileExtension: input.fileExtension || "pdf",
      documentId: "1",
    }],
    recipients: {
      signers: signers.map((s, i) => ({
        email: s.email, name: s.name || s.email, recipientId: String(i + 1), routingOrder: String(i + 1),
        tabs: {
          signHereTabs: [{
            anchorString: "/sig/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "0",
            // Fallback fixed placement if the anchor isn't found.
            documentId: "1", pageNumber: "1", xPosition: "100", yPosition: "700",
          }],
        },
      })),
    },
    status: "sent",
  }

  const url = `${base.replace(/\/$/, "")}/restapi/v2.1/accounts/${accountId}/envelopes`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return { ok: false, error: `DocuSign ${res.status}: ${txt.slice(0, 300)}` }
    }
    const data = (await res.json().catch(() => ({}))) as any
    if (!data?.envelopeId) return { ok: false, error: "DocuSign response missing envelopeId." }
    return { ok: true, envelopeId: String(data.envelopeId), status: data.status ? String(data.status) : "sent" }
  } catch (e: any) {
    const reason = e?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : (e?.message ?? "network error")
    return { ok: false, error: `DocuSign request failed: ${reason}` }
  } finally {
    clearTimeout(timer)
  }
}
