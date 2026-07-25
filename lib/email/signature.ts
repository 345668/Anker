/**
 * Anker AI founder signature block, injected into every founder- and
 * investor-facing send from the campaign engine so outreach always carries a
 * real person and a real reply path.
 *
 * Values are overridable via env for future team members, but default to
 * Philippe's details.
 */

export interface Signatory {
  name: string
  title: string
  /** Both addresses are shown in the signature. */
  emails: string[]
  linkedin: string
  website: string
}

export const ANKER_SIGNATORY: Signatory = {
  name: process.env.ANKER_SIGNATORY_NAME || "Philippe M. Masindet",
  title: process.env.ANKER_SIGNATORY_TITLE || "Founder, Anker AI",
  emails: (process.env.ANKER_SIGNATORY_EMAILS || "vc@an-ker.de, vc@philippemasindet.com")
    .split(",").map((e) => e.trim()).filter(Boolean),
  linkedin:
    process.env.ANKER_SIGNATORY_LINKEDIN ||
    "https://www.linkedin.com/in/philippe-m-masindet/",
  website: process.env.ANKER_SIGNATORY_WEBSITE || "www.an-ker.de",
}

/** Address replies are routed to. */
export const ANKER_REPLY_TO = process.env.ANKER_REPLY_TO || "vc@an-ker.de"

/** Always BCC'd on campaign email (a silent copy for the founder's records). */
export const ANKER_BCC = (process.env.ANKER_BCC_EMAILS || "vc@philippemasindet.com")
  .split(",").map((e) => e.trim()).filter(Boolean)

/** Legal confidentiality footer appended below the signature on every send. */
export const CONFIDENTIALITY_NOTICE =
  "CONFIDENTIALITY NOTICE: This message is intended only for the use of the individual or entity to which it is addressed and may contain information that is legally privileged and confidential. If the reader of this message is not the intended recipient, you are hereby notified that any dissemination, distribution or copying of this communication is strictly prohibited. If you have received this message in error, please immediately notify us by telephone and return the original message to us. Thank you for your cooperation in this regard."

/** Plain-text signature — name, title, both emails, LinkedIn, website, notice. */
export function signatureText(s: Signatory = ANKER_SIGNATORY): string {
  return [s.name, s.title, ...s.emails, s.linkedin, s.website].join("\n") +
    `\n\n${CONFIDENTIALITY_NOTICE}`
}

/** HTML signature — small, restrained, matches transactional style. */
export function signatureHtml(s: Signatory = ANKER_SIGNATORY): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const siteHref = s.website.startsWith("http") ? s.website : `https://${s.website}`
  return [
    `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5;color:#374151">`,
    `<strong>${esc(s.name)}</strong><br>`,
    `${esc(s.title)}<br>`,
    ...s.emails.map((e) => `<a href="mailto:${esc(e)}" style="color:#2563eb">${esc(e)}</a><br>`),
    `<a href="${esc(s.linkedin)}" style="color:#2563eb">LinkedIn</a><br>`,
    `<a href="${esc(siteHref)}" style="color:#2563eb">${esc(s.website)}</a>`,
    `</div>`,
    `<div style="margin-top:12px;font-size:11px;line-height:1.4;color:#9ca3af">${esc(CONFIDENTIALITY_NOTICE)}</div>`,
  ].join("")
}

/** Append the signature to a plain-text body with one blank line before it. */
export function withSignatureText(body: string, s: Signatory = ANKER_SIGNATORY): string {
  return `${body.replace(/\s+$/, "")}\n\n${signatureText(s)}`
}
