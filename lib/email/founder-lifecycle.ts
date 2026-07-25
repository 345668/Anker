/**
 * Founder-facing lifecycle emails for the campaign engine. All transactional
 * (noTracking) and all signed as the Anker AI founder.
 *
 *   1. submission received       — confirmation + public_ref + what's next
 *   2. assessed: not ready       — respectful decline + constructive feedback
 *   3. investor interested       — immediate alert with context + next step
 *   4. campaign complete         — wrap-up funnel (contacted / opened / interested)
 *
 * Each returns the SendEmailResult (or null when Resend is unconfigured) so the
 * caller can stamp emailed_at. None throw on send failure — the caller decides.
 */
import { isResendConfigured, sendEmail, type SendEmailResult } from "./resend"
import { signatureText, signatureHtml, ANKER_REPLY_TO, ANKER_BCC } from "./signature"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.an-ker.de"
}

async function send(
  to: string,
  subject: string,
  bodyText: string,
  bodyHtml: string,
): Promise<SendEmailResult | null> {
  if (!isResendConfigured()) {
    console.warn("[founder-lifecycle] Resend not configured; skipping:", subject)
    return null
  }
  return sendEmail({
    to,
    subject,
    text: `${bodyText.trim()}\n\n${signatureText()}`,
    html: `${bodyHtml}${signatureHtml()}`,
    replyTo: ANKER_REPLY_TO,
    bcc: ANKER_BCC,
    noTracking: true,
  })
}

// ─── 1. Submission received ──────────────────────────────────────────────────

export function sendSubmissionConfirmation(args: {
  to: string
  founderName: string
  startupName: string
  publicRef: string
}): Promise<SendEmailResult | null> {
  const { to, founderName, startupName, publicRef } = args
  const statusUrl = `${appUrl()}/apply/status/${encodeURIComponent(publicRef)}`
  const text = `Hi ${founderName},

Thanks for submitting ${startupName} to Anker AI. We've received your application and pitch deck.

Your reference is ${publicRef}. What happens next:

  1. Our assessment engine reviews your startup and deck against what our investor network is actively looking for.
  2. If it's a strong fit, we build a targeted list of the most relevant investors and begin warm, personalized outreach on your behalf.
  3. You'll hear from us either way — and we'll notify you the moment an investor expresses interest.

You can check your status any time at ${statusUrl}.`

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827">
    <p>Hi ${escapeHtml(founderName)},</p>
    <p>Thanks for submitting <strong>${escapeHtml(startupName)}</strong> to Anker AI. We've received your application and pitch deck.</p>
    <p>Your reference is <strong>${escapeHtml(publicRef)}</strong>. What happens next:</p>
    <ol>
      <li>Our assessment engine reviews your startup and deck against what our investor network is actively looking for.</li>
      <li>If it's a strong fit, we build a targeted list of the most relevant investors and begin warm, personalized outreach on your behalf.</li>
      <li>You'll hear from us either way — and we'll notify you the moment an investor expresses interest.</li>
    </ol>
    <p>You can check your status any time at <a href="${escapeHtml(statusUrl)}" style="color:#2563eb">${escapeHtml(statusUrl)}</a>.</p>
  </div>`

  return send(to, `We've received ${startupName} — Anker AI (${publicRef})`, text, html)
}

// ─── 2. Assessed: not ready (conservative decline with feedback) ─────────────

export function sendAssessmentDecline(args: {
  to: string
  founderName: string
  startupName: string
  feedback: string[] // specific, constructive points
}): Promise<SendEmailResult | null> {
  const { to, founderName, startupName, feedback } = args
  const bullets = feedback.length ? feedback : ["Sharpen the problem, market size, and traction narrative in your deck."]
  const text = `Hi ${founderName},

Thank you for submitting ${startupName}. We've reviewed it carefully, and it isn't the right fit for our investor network at this stage.

We don't run outreach unless we're confident it will land well for both sides, so rather than send it out, here's specific, honest feedback we hope is useful:

${bullets.map((b) => `  • ${b}`).join("\n")}

None of this is a judgment on the company — timing and fit change fast. You're welcome to strengthen these areas and re-apply. We'd genuinely like to see the next version.`

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827">
    <p>Hi ${escapeHtml(founderName)},</p>
    <p>Thank you for submitting <strong>${escapeHtml(startupName)}</strong>. We've reviewed it carefully, and it isn't the right fit for our investor network at this stage.</p>
    <p>We don't run outreach unless we're confident it will land well for both sides, so rather than send it out, here's specific, honest feedback we hope is useful:</p>
    <ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
    <p>None of this is a judgment on the company — timing and fit change fast. You're welcome to strengthen these areas and re-apply; we'd genuinely like to see the next version.</p>
  </div>`

  return send(to, `Your Anker AI application — ${startupName}`, text, html)
}

// ─── 3. Investor interested ──────────────────────────────────────────────────

export function sendInterestAlert(args: {
  to: string
  founderName: string
  startupName: string
  investorName: string
  investorFirm?: string | null
}): Promise<SendEmailResult | null> {
  const { to, founderName, startupName, investorName, investorFirm } = args
  const who = investorFirm ? `${investorName} (${investorFirm})` : investorName
  const text = `Hi ${founderName},

Good news — ${who} expressed interest in ${startupName} through our outreach.

We're compiling their details and will coordinate the introduction. Keep an eye on your inbox; the next step is usually a short intro call. We'll be in touch shortly with specifics.`

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827">
    <p>Hi ${escapeHtml(founderName)},</p>
    <p>Good news — <strong>${escapeHtml(who)}</strong> expressed interest in <strong>${escapeHtml(startupName)}</strong> through our outreach.</p>
    <p>We're compiling their details and will coordinate the introduction. The next step is usually a short intro call — we'll be in touch shortly with specifics.</p>
  </div>`

  return send(to, `An investor is interested in ${startupName} 🎉`, text, html)
}

// ─── 4. Campaign complete ────────────────────────────────────────────────────

export function sendCampaignComplete(args: {
  to: string
  founderName: string
  startupName: string
  contacted: number
  opened: number
  interested: number
}): Promise<SendEmailResult | null> {
  const { to, founderName, startupName, contacted, opened, interested } = args
  const text = `Hi ${founderName},

Your outreach campaign for ${startupName} is complete. Here's how it went:

  • Investors contacted:   ${contacted}
  • Opened your materials: ${opened}
  • Expressed interest:    ${interested}

${interested > 0
    ? `We've already notified you about interested investors and are coordinating those introductions.`
    : `No interest landed this round. That's common and rarely about the company itself — timing, thesis fit, and current deployment all move quickly. Happy to talk through what we saw and whether a refreshed round makes sense.`}`

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827">
    <p>Hi ${escapeHtml(founderName)},</p>
    <p>Your outreach campaign for <strong>${escapeHtml(startupName)}</strong> is complete. Here's how it went:</p>
    <ul>
      <li>Investors contacted: <strong>${contacted}</strong></li>
      <li>Opened your materials: <strong>${opened}</strong></li>
      <li>Expressed interest: <strong>${interested}</strong></li>
    </ul>
    <p>${interested > 0
      ? "We've already notified you about interested investors and are coordinating those introductions."
      : "No interest landed this round. That's common and rarely about the company itself — timing, thesis fit, and current deployment all move quickly. Happy to talk through what we saw and whether a refreshed round makes sense."}</p>
  </div>`

  return send(to, `Campaign wrap-up — ${startupName}`, text, html)
}

// ─── util ────────────────────────────────────────────────────────────────────

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
