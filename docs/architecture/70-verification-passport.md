# 70. Build plan: the verification passport (doc 61 P6)

Status: **built 2026-10-20; migration applied to production; see section 7.** Plan as written: Follows docs 64 to 69. Doc 61 section 12: reuse of identity documents across funds with per-fund consent and revocation, so a second fund's onboarding does not ask again; the fund still reviews and decides. This is the most sensitive piece of the investor side: identity documents of real people. It is built to collect and pass on, never to judge.

## 1. What it is
A **passport** belongs to one investor entity: the documents doc 60 asks a fund for (for an individual: government ID, proof of address, source of funds; for any other entity: certificate of incorporation, ownership declaration, registered address proof, source of funds). The investor adds each once. The owner of the entity and anyone who can act may add, replace, share and revoke; a person who can only view sees that documents exist, never their contents.

## 2. Sharing is a copy, with consent, per fund
- Sharing is an explicit action on one relationship that has reached onboarding (the fund has invited the investor and the investor has confirmed their details in the fund's portal). The investor ticks the documents to share with **that** fund. A copy is placed in the fund's verification case exactly as if the investor had uploaded it there (doc 60 L3: encrypted, same checklist, same review). The passport itself is never opened to a fund.
- The share is recorded: which document, which fund, who, when, and the fingerprint of the file. Nothing is shared automatically, with a second fund, or later.
- A document the fund has already checked is not replaced. A document type the fund does not ask for is skipped.
- **Revoking** a share: if the fund has not yet looked at the copy (still "received"), the copy is deleted and the item goes back to "requested". If the fund has already checked it, it **stays with the fund for its legal records**, the share is marked revoked and retained, and the investor is told to ask the fund to remove it. If the investor has meanwhile uploaded a different file there, nothing is deleted.
- Removing a document from the passport revokes its shares first, by the same rule.

## 3. Safety
- Files are PDF, JPEG or PNG judged by content, up to 4 MB, encrypted by the application before they reach the database (AES-256-GCM); with no key, the upload is refused (no plaintext fallback). The SHA-256 of the original is kept.
- Passport files and their copies are **never** read by any AI feature, assistant tool, index or prompt; the only readers are the share action (to copy) and the investor's own download.
- Sharing and revoking are written to the audit log; every use of a passport document is attributed to a person (doc 69 activity log).
- A passport is investor-owned data: outside a fund's tenant erasure and export; the investor's own erasure removes it. Copies at a fund are the fund's (they were uploaded to it with the investor's consent).
- No retention job runs yet (same limit as doc 60 L3, stated).

## 4. Data (migration `2026-10-20g-investor-passport.sql`)
`passport_documents(id, entity_id, doc_type, filename, content_type, size_bytes, sha256, content_enc, uploaded_by, created_at, superseded)`; `passport_shares(id, document_id, entity_id, relationship_id, fund_id, lp_id, doc_type, sha256, shared_by, shared_at, revoked_at, retained)`. Both investor-owned in the tenant registry.

## 5. Surfaces
`GET/POST/DELETE /api/investor/entities/[id]/passport`, `.../passport/share`, `.../passport/revoke`, and a download for the investor's own document. A Passport section on the entity's dashboard.

## 6. Tests
Sharing needs a relationship of that entity at onboarding with a record; consent per fund; only types the fund asks for; verified documents untouched; the copy lands as if uploaded (spy on the doc 60 upload); the share row records the fingerprint; revoke deletes an unseen copy and resets the item, keeps a checked one and says so, leaves a replaced one alone; removing a document revokes first; viewers cannot add or share and cannot read contents; another entity's or person's passport is unreachable; no key refuses the upload; type, size and content checks; nothing in the share list carries file bytes; the registry classes the tables as investor-owned.

## 7. What was built, and what was not checked (2026-10-20)
- `lib/investor/passport.ts`; routes under `/api/investor/entities/[id]/passport` (list, add, remove, `share`, `revoke`, `file`); a Passport section on the entity dashboard (documents asked for, add or replace, download my copy, remove, share a copy with a fund that is onboarding the entity, take a share back, with the outcome in words). Migration `2026-10-20g-investor-passport.sql` applied to production; both tables are investor-owned (the share table names its fund column `with_fund` so it is not mistaken for a fund-keyed table).
- Replaced and removed files have their bytes wiped; their records stay so earlier shares keep their history.
- Tested: 13 integration tests (type, size, content and no-key refusals; encrypted at rest; replacement; view-only role sees no names and cannot download; a stranger reaches nothing; consent per fund and the copy lands only in that fund's checklist; the share record and the audit entry; stage and record required; checked documents untouched; which funds could receive what; revoke deletes an unseen copy, keeps a checked one and says so, leaves a replaced one alone; removal takes shares back first; activity log). The fund's own upload is doc 60's code and is stood in for here; the real path is covered by doc 60's tests. Full suite 2329 passing, `tsc` clean.
- **Not checked:** a real upload, share and revoke against the real fund checklist in a browser, with a real key in production (`SECRET_KEY` is already required by doc 60 L3). No retention job runs (same limit as doc 60). Counsel should read the consent wording, the "fund keeps what it checked" rule and the retention position before real documents are stored.
