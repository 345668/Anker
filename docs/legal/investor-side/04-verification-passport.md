# 04. The verification passport

*Questions 17 to 21. Wording: `07`, "The verification passport". Draft; not legal advice. This is the most sensitive part of the investor side.*

## What it is *(tested)*
An investor entity keeps the documents a fund's verification asks for, once: for an individual, a government ID, proof of address and source of funds; for any other entity, a certificate of incorporation, an ownership declaration, proof of the registered address and source of funds. Later, when a fund is onboarding that entity, the investor can **share a copy with that one fund**.

## How it works, step by step
1. **Adding.** The owner or a person who can act uploads a PDF, JPEG or PNG (4 MB at most; the type is read from the content). The file is **encrypted by the application (AES-256-GCM) before it reaches the database**; with no key the upload is refused (there is no plaintext fallback). The SHA-256 of the original is kept. Replacing a document wipes the old bytes.
2. **Who sees it.** The owner and people who can act on the entity. A team member who can only view sees *that* a document exists, not its name or content. A fund never sees the passport.
3. **Sharing.** Possible only for a relationship in which the fund has invited the investor to onboard and the investor has confirmed their details in the fund's portal. The investor ticks the documents; the text before the button is the consent wording (`07`, `passport_share_consent`). The copy is placed in the fund's verification checklist exactly as if the investor had uploaded it there (doc 60: same encryption, same review screen, same audit). A document the fund already checked is not replaced. The share records the document's fingerprint, who shared, when, and **the wording version consented to**.
4. **Taking back.** If the fund has not yet looked at the copy (still "received"), it is deleted and the item returns to "requested". If the fund has already checked it, **it stays with the fund for its legal records**; the share is marked "kept by the fund"; the investor is told to ask the fund to remove it. If the investor has since uploaded a different file there, nothing is deleted.
5. **Removing a document** takes back its shares first by the same rule, then wipes the bytes.
6. **Erasure** of the investor takes back unseen copies, deletes the passport and its share records, and reports how many copies funds keep.
7. **Audit.** Every share and take-back is written to the audit log (document id, fund, outcome; no content), and to the entity's activity log, attributed to the person.

## What it does not do
- **No automated reading** of any document: no AI, no OCR, no index. The only readers are the share action (to copy) and the investor's own download. (Doc 60: "Anker collects and organises; the fund decides.")
- **No key rotation** yet: one application key encrypts all files. A rotation procedure is a known open item.
- **No retention job for what funds hold**; the passport's own retention is in `08`.
- **No virus scan** (files are accepted by content type and size).
- It does not make the fund accept anything; the fund reviews and decides.

## Data protection points
- **Special categories.** An ID copy shows a photo and may reveal origin or nationality. Anker does not process it to identify anyone (no biometrics, no reading). Counsel to confirm Article 9 does not apply to storage and transfer in this form.
- **German identity-card copies.** We understand that copying and passing on an identity card is restricted (purpose limits; the copy must be marked as a copy; the card holder may black out some data). Counsel to say what Anker must do, or must refuse to allow.
- **Region.** The files are stored in the database, hosted by Neon in AWS us-east-1 (US East), confirmed from the connection address on 2026-10-23. EU residents' identity documents therefore raise a transfer question before launch (question 19). Sign-in (Supabase) and email (Resend) use default regions, to be read from their dashboards; neither holds identity documents (Resend carries only the six-digit codes and content-free notices).
- **Roles.** Passport store: Anker as controller (proposed). A copy in a fund's checklist: the fund as controller, Anker as its processor.

## Proposed position
Consent per document and per fund, withdrawable, with the retained-by-the-fund rule explained at the moment of consent; passport files deleted on removal, on erasure and 30 days after the entity is archived (`08`); the fund's own anti-money-laundering retention is the fund's.

## Open points for counsel
Questions 17 (permissibility, basis, ID-copy rules), 18 (consent wording and the retained rule), 19 (US-region storage), 20 (key management), 21 (retention).

**Recommendation to the founder:** do not open the passport to real documents until questions 17 and 19 are answered. The rest of the investor side works without it (a fund can still collect documents in its own flow).
