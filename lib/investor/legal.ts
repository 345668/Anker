/**
 * Every sentence of legal weight on the investor side, in one place (docs/architecture/73). The screens and the emails take their wording from here; nothing legal is typed
 * into a component. Counsel reviews this file (as the generated `docs/legal/investor-side/07-wording-as-shipped.md`), and a test pins its hash: changing a sentence fails the
 * test until the change is deliberate, `LEGAL_VERSION` is raised and the pack is regenerated.
 *
 * Links are written `[label](/path)` and drawn by `LegalText`.
 */
// Pure on purpose: client components import it, so it uses no Node-only module. The hash that pins it lives in the test.

export const LEGAL_VERSION = "2026-10-21"

export type Topic = "sign-up" | "listing" | "requests" | "nda" | "attachments" | "passport" | "discoverability" | "team" | "rights" | "emails"
export interface LegalText { id: string; topic: Topic; audience: string; where: string; text: string }

const T = (id: string, topic: Topic, audience: string, where: string, text: string): LegalText => ({ id, topic, audience, where, text })

export const TEXTS = {
  signupConsent: T("signup_consent", "sign-up", "A person creating an investor account", "Sign-up form and 'Create your investor profile' (checkbox label, required)", "I accept the [terms](/terms) and have read the [privacy notice](/privacy)."),
  signupClosedTitle: T("signup_closed_title", "sign-up", "Anyone", "Investor sign-up page while the platform switch is off", "Investor sign-up is not open yet."),
  signupClosedBody: T("signup_closed_body", "sign-up", "Anyone", "Investor sign-up page while the platform switch is off", "We are not accepting investor accounts yet. If you were invited to a fund, use the link you were sent."),
  fitDisclaimer: T("fit_disclaimer", "listing", "An investor browsing funds", "'Funds that fit you' page, above the list", "Funds are ranked by how well their stated focus matches what you say you look for. This is not advice and not a recommendation; check each fund yourself."),
  listingManagerNotice: T("listing_manager_notice", "listing", "A fund manager", "Fund workspace, 'Show this fund to investors'", "Investors see a fixed summary taken from your fund and your profile: never documents, your LP list, performance or your CRM. Nothing is shown until you set who may invest and switch it on."),
  listingStrictLabel: T("listing_strict_label", "listing", "A fund manager", "Listing form, beside the rules", "Do not accept requests from investors who clearly do not meet these rules"),
  strictRefusal: T("strict_refusal", "requests", "An investor who does not meet a fund's stated rules", "Shown instead of sending the request, when the fund has chosen to refuse such requests", "This fund only takes requests from investors who meet its stated rules, and your details do not. Check the rules on the fund page."),
  discoveryPoolNotice: T("discovery_pool_notice", "discoverability", "A fund manager", "Fund workspace, 'Find investors', while too few investors have opted in", "Cards are shown only once enough investors have opted in that a card cannot point to one person. That has not happened yet."),
  requestStatement: T("request_statement", "requests", "An investor asking a fund to talk", "Fund page, above the request form", "This is an expression of interest. It is not an offer, a subscription or an obligation. The fund sees what you choose to share below, and your email address only if it accepts."),
  inviteAcceptNote: T("invite_accept_note", "discoverability", "An investor answering a fund's invitation", "Profile page, 'Funds that would like to connect'", "If you accept, the fund sees what you tick below, and your email address."),
  claimIntro: T("claim_intro", "requests", "An investor whose address a fund already holds", "Profile page, 'Funds that added you'", "These funds hold a record with your email address. Link one to your profile to follow it here."),
  ndaInvestorNotice: T("nda_investor_notice", "nda", "An investor", "Conversation, before documents can be opened", "This fund asks you to accept its NDA before you can open documents. Anker records that you accepted the fund’s text; it does not review it, so read it carefully."),
  ndaFundLabel: T("nda_fund_label", "nda", "A fund manager", "Listing form, beside the NDA text box", "Text of your NDA (Anker records that an investor accepted it; it does not write or check it)"),
  ndaFundRefusal: T("nda_fund_refusal", "nda", "A fund manager", "Shown when the NDA requirement is on without text", "Paste the text of your NDA, or turn the NDA requirement off. Anker records that an investor accepted your text; it does not write one."),
  materialsNote: T("materials_note", "nda", "An investor", "Conversation, under the documents the fund has shared", "The fund can withdraw a document at any time. A copy you have downloaded stays with you."),
  attachmentWarning: T("attachment_warning", "attachments", "Both sides", "Conversation, beside the file picker", "Attach up to 3 files (PDF, JPEG or PNG, 4 MB each). Only open files you expect; Anker checks them but is not a virus scanner."),
  teamNote: T("team_note", "team", "An investor team", "Entity dashboard, Team", "People with a role here see this entity’s requests and conversations. Funds never see the team."),
  passportIntro: T("passport_intro", "passport", "An investor", "Entity dashboard, Verification passport", "Keep your identity documents here once. Nothing is shared until you choose to share it with one fund; the fund still reviews and decides. Files are encrypted, and no automated system reads them."),
  passportShareConsent: T("passport_share_consent", "passport", "An investor", "Passport, beside 'Share a copy with <fund>' (shown before the button)", "By sharing, you give this one fund a copy of the documents you ticked, for its onboarding checks. The fund reviews and decides. You can take a copy back; if the fund has already checked it, the fund keeps it for its legal records and you should ask the fund to remove it."),
  passportTakenDeleted: T("passport_taken_deleted", "passport", "An investor", "Passport, after taking a share back", "Taken back; the fund’s copy was deleted."),
  passportTakenRetained: T("passport_taken_retained", "passport", "An investor", "Passport, after taking a share back", "Taken back. The fund had already checked it and keeps it for its records."),
  passportTakenReplaced: T("passport_taken_replaced", "passport", "An investor", "Passport, after taking a share back", "Taken back."),
  passportRemoveConfirm: T("passport_remove_confirm", "passport", "An investor", "Passport, confirmation before removing a document", "Remove this document? Copies you shared are taken back first."),
  discoverabilityOwner: T("discoverability_owner", "discoverability", "An investor entity's owner", "Entity dashboard, 'Let funds find you' (shown only when the platform has opened it)", "If you switch this on, funds whose rules you meet can see a card: the kind of entity, country, your declared category, your cheque range and what you look for. Never your name, email or team. A fund can only invite you to connect; nothing else is shared unless you accept. Switch it off any time."),
  discoverabilityFund: T("discoverability_fund", "discoverability", "A fund manager", "Fund workspace, 'Find investors' (shown only when the platform has opened it)", "Investors who chose to be found, whose category and country meet your rules, best fit first. You see a card, never a name or address. An invitation carries no message; the investor decides whether to accept and what to share."),
  exportStatement: T("export_statement", "rights", "An investor", "Profile page, 'Your data'", "Download a copy of the data Anker holds about you as a file. It lists your profile, entities, requests, conversations, meetings, passport records and activity. Your passport files are not included; download them one by one from the passport."),
  eraseStatement: T("erase_statement", "rights", "An investor", "Profile page, 'Your data', before the confirmation box", "Deleting your investor account removes your profile, your entities’ details, your team, your passport files and your sign-in. Funds you have dealt with keep their own records, with your name removed: the fact of the conversation, their own messages and any onboarding records they are required to keep. What you wrote in conversations is replaced by a removal notice and your attachments are deleted. If you own an entity with a team, the team loses access. This cannot be undone."),
  eraseConfirmPhrase: T("erase_confirm_phrase", "rights", "An investor", "Profile page, 'Your data', the word to type", "ERASE"),
} as const

/** Emails that carry legal weight (what a person is told, and by whom). The code emails hold the code and nothing else. */
export const EMAILS = {
  signupCode: (o: { code: string; minutes: number }) => ({ subject: `Your code: ${o.code}`, text: `Your Anker code is ${o.code}\n\nIt is valid for ${o.minutes} minutes. If you did not ask to sign up, ignore this email: nothing is created without this code.` }),
  claimCode: (o: { code: string; minutes: number }) => ({ subject: `Your code: ${o.code}`, text: `Your Anker code is ${o.code}\n\nIt is valid for ${o.minutes} minutes. If you did not ask to link an investment, ignore this email.` }),
  teamInvite: (o: { url: string; days: number }) => ({ subject: "You have an invitation on Anker", text: `Someone has invited you to an investor account on Anker.\n\nSign in with this email address to see it and answer: ${o.url}/investor\n\nThe invitation is valid for ${o.days} days. If you did not expect it, ignore this email.` }),
  fundInvite: (o: { url: string }) => ({ subject: "You have an invitation on Anker", text: `A fund would like to connect with one of your investing entities.\n\nSee it and decide here: ${o.url}/investor\n\nNothing is shared with the fund unless you accept.` }),
  newMessage: (o: { url: string }) => ({ subject: "You have a new message on Anker", text: `A fund you asked to talk to has something for you.\n\nRead it here: ${o.url}/investor/requests\n\nIf you do not want these emails, mute the conversation there.` }),
  quiet: (o: { url: string }) => ({ subject: "Do you want to continue your conversation?", text: `Your conversation with a fund has been quiet for a month. You can write again or withdraw here: ${o.url}/investor/requests` }),
}

/** Everything counsel reads, in a fixed order, with the emails drawn with visible placeholders. */
export function legalCatalogue(): LegalText[] {
  const mail = (id: string, where: string, m: { subject: string; text: string }) => T(id, "emails", "The person emailed", where, `Subject: ${m.subject}\n\n${m.text}`)
  return [
    ...Object.values(TEXTS),
    mail("email_signup_code", "Sent to a person starting sign-up", EMAILS.signupCode({ code: "{six-digit code}", minutes: 10 })),
    mail("email_claim_code", "Sent to a person linking a record a fund added", EMAILS.claimCode({ code: "{six-digit code}", minutes: 10 })),
    mail("email_team_invite", "Sent to an address invited to an entity's team", EMAILS.teamInvite({ url: "{site}", days: 14 })),
    mail("email_fund_invite", "Sent to an entity's owner and people who can act when a fund invites it", EMAILS.fundInvite({ url: "{site}" })),
    mail("email_new_message", "Sent (at most once an hour) when a fund writes, shares a document or proposes a meeting", EMAILS.newMessage({ url: "{site}" })),
    mail("email_quiet", "Sent once a month to a conversation that has gone quiet", EMAILS.quiet({ url: "{site}" })),
  ]
}
/** The pack's wording document, generated from the registry so it cannot drift. */
export function wordingMarkdown(): string {
  const topics: Array<[Topic, string]> = [["sign-up", "Account and sign-up"], ["listing", "Listing and browsing funds"], ["requests", "Requests and linking records"], ["nda", "NDA and shared documents"], ["attachments", "Attachments"], ["team", "Teams"], ["passport", "The verification passport"], ["discoverability", "Discoverability"], ["rights", "The investor's rights"], ["emails", "Emails"]]
  const cat = legalCatalogue()
  const out = [`# 07. Wording as shipped (generated)`, ``, `*Generated from \`lib/investor/legal.ts\`, wording version **${LEGAL_VERSION}**. Do not edit by hand: change the registry, raise the version and regenerate with \`npx tsx scripts/legal/gen-investor-pack.ts\`. A test fails if this file differs from the registry. Links are written [label](path).*`, ``]
  for (const [topic, title] of topics) {
    const rows = cat.filter((c) => c.topic === topic)
    if (!rows.length) continue
    out.push(`## ${title}`, ``)
    for (const r of rows) out.push(`### ${r.id}`, `*Who sees it:* ${r.audience}  `, `*Where:* ${r.where}`, ``, ...r.text.split("\n").map((l) => `> ${l}`), ``)
  }
  return out.join("\n")
}
