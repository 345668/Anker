/**
 * The investor terms and the investor privacy notice, as data (docs/architecture/74 section 4). One source for the public pages (/investor/terms, /investor/privacy), the sign-up
 * consent that links to them, the re-acceptance gate, and the counsel pack (10 and 09 are generated from this file).
 *
 * STATUS: "draft". The text below is a careful draft for counsel; bracketed items are facts or legal wording only the founder or counsel can supply. While the status is "draft" every
 * page shows a banner saying so. To publish: counsel's text replaces this text, the version is raised (everyone is asked to accept again), and the status becomes "approved" - which
 * the tests refuse while any [bracketed placeholder] remains.
 */
import { POLICY } from "./retention-policy"

export const INVESTOR_TERMS_VERSION = "2026-10-23-draft-1"
export const TERMS_STATUS: "draft" | "approved" = "draft"
export const DRAFT_BANNER = "Draft for legal review. This text is not yet in force and may change. It is shown so that you can see what investor accounts will be governed by."

export interface Section { heading: string; body: string[] }   // a body line starting "- " is a list item

export const TERMS: Section[] = [
  { heading: "1. Who these terms are between", body: ["These terms are between [company name, registered office] (“Anker”, “we”) and you, a person who has an investor account on Anker. If you use Anker for a company, trust, family office or other entity, “you” includes that entity and you confirm that you are allowed to act for it."] },
  { heading: "2. What Anker is, and is not", body: [
    "Anker is a platform. Venture funds present themselves on it to registered investors, and investors can say that they are interested in a fund and talk to it.",
    "Anker is not a broker, an adviser, a marketplace or an issuer. **No interest in any fund is offered, sold or subscribed on Anker.** Anything you decide to do with a fund you do with that fund, under that fund’s own documents. Anker does not take or move money and takes no investment decision for you." ] },
  { heading: "3. Your account", body: [
    "You must be of full age. You must give true information. What you say about yourself, including the kind of investor you say you are, is your own statement; a fund may ask you to prove it, and Anker does not check it.",
    "Keep your password safe. You are responsible for what is done with your account, and for the people you give a role on an entity (see 9)." ] },
  { heading: "4. Finding funds", body: [
    "Anker shows funds that their managers chose to list, and ranks them by how well each fund’s stated focus matches what you say you look for. **The ranking is not advice and not a recommendation.** It does not consider performance, quality or suitability for you. A fund’s description is the fund manager’s; Anker does not verify it. Check each fund yourself and take your own advice.",
    "The eligibility check compares your details with the fund’s own stated rules. It is a guide. The fund decides." ] },
  { heading: "5. Asking a fund to talk", body: [
    "A request is an expression of interest. **It is not an offer, a subscription or an obligation** for you or for the fund. You choose what to share with the fund; the fund receives your email address only if it accepts. The fund is responsible, as a separate controller, for what it then holds about you." ] },
  { heading: "6. Conversations, files and NDAs", body: [
    "Use conversations only for the purpose of dealing with that fund. Do not send anything unlawful, abusive or harmful, and do not send files that contain malicious code. Files are limited to PDF, JPEG or PNG, 4 MB each, and Anker may refuse or remove a file it considers unsafe.",
    "If a fund asks you to accept its NDA, the NDA is between you and the fund. Anker records that you accepted the fund’s text, the time, and technical details of the acceptance as evidence; Anker does not write, review or advise on the NDA and is not a party to it. Read it before you accept.",
    "A fund may withdraw a document it shared at any time. A copy you have already downloaded stays with you, and the NDA, if any, applies to it." ] },
  { heading: "7. Identity documents (when this is available)", body: [
    "Keeping identity documents in your passport is optional and is available only when we have opened it. You decide which fund gets a copy and which documents; sharing is a copy for that fund’s onboarding checks. You can take a copy back. If the fund has already checked it, the fund keeps it for its legal records and you should ask the fund to remove it when it no longer needs it.",
    "Only share documents you may lawfully share. Anker does not read your documents and does not decide whether you are accepted: the fund does." ] },
  { heading: "8. Being found by funds (when this is available)", body: [
    "If you switch this on for an entity, funds whose rules you meet may see a card with the kind of entity, country, your declared category, your cheque range and what you look for, never your name, email or team. A fund can only invite you to connect; nothing is shared unless you accept. You can switch it off at any time." ] },
  { heading: "9. Teams on an entity", body: [
    "The owner of an entity may give other people a role: able to act (ask funds to talk, write, accept NDAs, share documents) or able to view. The owner is responsible for the people they add. Funds do not see your team. Anyone with a role sees that entity’s requests and conversations." ] },
  { heading: "10. Stopping or limiting your use", body: [
    "We may suspend or limit an account or remove content if it is used unlawfully or abusively, or to protect others or the platform. Where we can, we will tell you why. You can delete your investor account at any time (see 11)." ] },
  { heading: "11. Your data", body: [
    "How we use your data is described in the investor privacy notice. You can download your data and delete your investor account from your profile page." ] },
  { heading: "12. Availability and changes", body: [
    "Anker is provided as it is available; [counsel: availability and warranty wording]. We may change these terms. If we change them in a way that matters we will ask you to accept the new version before you continue." ] },
  { heading: "13. Liability", body: ["[Counsel to supply: limits and exclusions of liability appropriate to the service and to consumers and businesses, in accordance with the applicable law.]"] },
  { heading: "14. Governing law and place of jurisdiction", body: ["[Counsel to supply.]"] },
  { heading: "15. Contact", body: ["[Name, address and email for questions and notices.]"] },
]

const policyLines = POLICY.map((p) => `- ${p.data}: ${p.period}. Then: ${p.then.charAt(0).toLowerCase()}${p.then.slice(1)}.`)

export const NOTICE: Section[] = [
  { heading: "Who we are", body: ["[Company name, registered office, email, data-protection contact.] We run Anker, a platform for venture funds, founders and investors. For your investor account we decide how and why your data is used (we are the controller)."] },
  { heading: "What this notice covers", body: ["Your investor account on Anker: finding funds, asking funds to talk, conversations with funds, your investor documents (if available), and being found by funds if you choose."] },
  { heading: "What we collect, and why", body: [
    "- Your account: email address, name, password (kept by our sign-in provider as a hash) and when you accepted the terms. To give you an account (contract).",
    "- Your profile and entities: name, country, languages, how you want to be contacted, a short description; for each entity you invest through: its name, kind, country, tax residence, the category of investor you say you are, and what you look for. To show you funds that fit and to let you ask them to talk (contract; steps at your request).",
    "- Requests and conversations: the requests you send and what you chose to share, the messages and files you exchange with a fund, NDAs you accept (a copy of the text, the time, your IP address and a hash of your browser details, as evidence), meetings you arrange. To carry out what you asked for (steps at your request); the NDA record to keep evidence (legitimate interest).",
    "- Identity documents (optional, when available): copies you add to your passport, and a record of which fund received a copy and when. Only if you add them, and shared only when you choose (consent).",
    "- Being found (optional, off by default): if you switch it on, funds that fit see a card without your name, email or team. We record when you switched it on and which wording you saw (consent).",
    "- Security and abuse prevention: sign-up attempts and limits, and a log of who did what on your entity (legitimate interest)." ] },
  { heading: "Who receives it", body: [
    "A fund receives only what you choose to share when you ask to talk or accept its invitation, your email address when it accepts, and documents only when you share them. Our service providers process data for us: hosting, database, sign-in and email delivery (the current list is on the sub-processors page). We do not send your investor data to AI providers." ] },
  { heading: "Where", body: ["Our database is hosted in the United States (AWS us-east-1, through Neon). [Regions of sign-in and email delivery, and the safeguards for transfers outside the EU, to be completed once confirmed.]"] },
  { heading: "How long we keep it", body: [...policyLines, "- Your account and the data in it: until you delete them.", "- Funds you have dealt with keep their own records, with your name removed if you erase your account, and anything they have already checked in their onboarding, under their own retention."] },
  { heading: "Your rights", body: ["Access and a copy (Download my data on your profile), correction (edit your profile), erasure (Delete my investor account), withdrawal of consent (switch off being found; take back a shared document), restriction and objection (write to [address]), and complaint to your supervisory authority [name]."] },
  { heading: "Funds are separate controllers", body: ["Once you ask a fund to talk, the fund also holds the information you gave it and is responsible for it under its own privacy notice. Ask the fund to correct or delete what it holds."] },
  { heading: "Automated decisions", body: ["We rank funds by how well their stated focus matches what you say you look for. This is not advice and not a recommendation, and it is not a decision with legal or similar effect."] },
  { heading: "Changes", body: ["[How you will be told of changes.]"] },
]

const md = (title: string, version: string, sections: Section[]) => [`# ${title}`, ``, `*Version ${version}. Status: ${TERMS_STATUS}.*`, ``, ...sections.flatMap((s) => [`## ${s.heading}`, ``, ...s.body.flatMap((b) => [b, ``])])].join("\n")
export const termsMarkdown = () => md("Investor terms", INVESTOR_TERMS_VERSION, TERMS)
export const noticeMarkdown = () => md("Investor privacy notice", INVESTOR_TERMS_VERSION, NOTICE)

/** Placeholders still waiting for counsel or the founder, in [brackets]. */
export const placeholders = (): string[] => [...TERMS, ...NOTICE].flatMap((s) => s.body).flatMap((l) => l.match(/\[[^\]]+\]/g) ?? [])
