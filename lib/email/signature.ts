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
  email: string
  linkedin: string
}

export const ANKER_SIGNATORY: Signatory = {
  name: process.env.ANKER_SIGNATORY_NAME || "Philippe M. Masindet",
  title: process.env.ANKER_SIGNATORY_TITLE || "Founder, Anker AI",
  email: process.env.ANKER_SIGNATORY_EMAIL || "beetlesflying@gmail.com",
  linkedin:
    process.env.ANKER_SIGNATORY_LINKEDIN ||
    "https://www.linkedin.com/in/philippe-m-masindet/",
}

/** Plain-text signature — four lines, blank line before it handled by caller. */
export function signatureText(s: Signatory = ANKER_SIGNATORY): string {
  return [s.name, s.title, s.email, s.linkedin].join("\n")
}

/** HTML signature — small, restrained, matches transactional style. */
export function signatureHtml(s: Signatory = ANKER_SIGNATORY): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return [
    `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5;color:#374151">`,
    `<strong>${esc(s.name)}</strong><br>`,
    `${esc(s.title)}<br>`,
    `<a href="mailto:${esc(s.email)}" style="color:#2563eb">${esc(s.email)}</a><br>`,
    `<a href="${esc(s.linkedin)}" style="color:#2563eb">LinkedIn</a>`,
    `</div>`,
  ].join("")
}

/** Append the signature to a plain-text body with one blank line before it. */
export function withSignatureText(body: string, s: Signatory = ANKER_SIGNATORY): string {
  return `${body.replace(/\s+$/, "")}\n\n${signatureText(s)}`
}
