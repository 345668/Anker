# 03. Requests, conversations, the NDA, documents, meetings and files

*Questions 12 to 16. Wording: `07`, "Requests", "NDA and shared documents", "Attachments". Draft; not legal advice.*

## What the product does *(tested)*
- **A request** (an expression of interest). The investor picks one of their entities and a fund; may state an indicative amount range, a timing and a note (up to 1,000 characters); and chooses what to share with that fund: name, country, self-declared category, what they look for. The statement shown: "This is an expression of interest. It is not an offer, a subscription or an obligation. The fund sees what you choose to share below, and your email address only if it accepts." What the fund receives is a **copy with the time it was made**; it does not change if the investor later edits their entity.
- **One open request per entity and fund**, and the fund's daily limit on new requests. The eligibility check against the fund's rules and the fit are stored with the request.
- **The fund's answer.** The fund's workspace owner or admin accepts or declines. A decline tells the investor only "The fund is not able to take this forward"; any reason the fund types is not shown. On acceptance the investor's email address becomes visible to the fund.
- **The conversation** opens on acceptance: plain text up to 4,000 characters; at most 30 messages an hour per side; either side can mute (no notices) or block (ends the conversation; a fund's block also stops that person from asking that fund again). Notices to the other side are **content-free** ("something new"), at most one an hour per side, by email to the investor's side (the entity's owner and anyone who can act) and in the app to the fund's owners and admins.
- **Nudges** (daily): a request unanswered for a week reminds the fund once; a conversation quiet for 30 days asks both sides once whether to continue. Nothing is declined automatically.
- **Documents the fund shares.** A fund shares *fund-wide* documents from its own library with one investor, only while the conversation is open; each access is logged; the fund can withdraw a share at any time; a copy already downloaded cannot be recalled (the investor is told).
- **The NDA.** If the fund requires one, it pastes its own text (the product refuses "NDA required" with no text). The investor must accept before any document opens. Stored: a copy of the text, its SHA-256, the time, the IP address and a SHA-256 of the browser string. Later changes to the fund's text do not require a second acceptance. Anker does not draft, review or advise on the NDA, and says so on both sides.
- **Meetings.** Either side proposes a time and/or an https link (a note up to 500 characters); the other accepts or declines; the proposer can cancel; three open at most. Anker stores the proposal and outcome, not the call.
- **Files in messages.** Up to three PDF, JPEG or PNG files per message, 4 MB each, 25 MB per conversation. The type is read from the content, not the name. PDFs containing JavaScript, launch actions, embedded files, rich media, form scripts or open actions, or names disguised with hex escapes, are refused. Files are encrypted by the application (AES-256-GCM) before storage and downloaded through a route that checks membership of the conversation. The page says: "Only open files you expect; Anker checks them but is not a virus scanner."
- **From conversation to onboarding.** When the fund presses "Invite to onboard", one investor record is created in the fund (name, a mapped type, the contact address; nothing about tax or identity), and the fund's own invitation, verification and subscription flow (doc 60) begins. The conversation continues.

## What the product does not do
- It is not a signing tool for subscriptions beyond doc 60's flow; it moves no money.
- **Virus scanning is built but off by default** (`13`): with a ClamAV daemon configured, every file is scanned before storage and an infected file is refused; `required` mode refuses uploads when the scanner is unreachable. Without it, the screen says Anker is not a virus scanner. Images are accepted on their header; a PDF hiding active content in a way the screen does not look for would pass.
- Messages are stored as plain text in the database (files are encrypted).
- It does not notify the other side with any message content, file name or document title.
- No staff read conversations in the ordinary course; platform operators with database access could technically.

## Proposed position
- The request statement and the NDA notices are as in `07`; Anker is not a party to any NDA or investment.
- Anker is a conduit and a record-keeper for the conversation; each fund is responsible for what it says and shares.

## Open points
- Click acceptance of an NDA as evidence (question 14).
- Whether a scanner must precede launch (question 15).
- A staff-access and confidentiality policy for conversations (question 13).
