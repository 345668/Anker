# 68. Build plan: materials, the NDA step and meeting requests (doc 61 P3b)

Status: **built 2026-10-20; migration applied to production; see section 7.** Plan as written: Follows doc 65 (the thread). Doc 61 section 7: materials the fund shares are granted per relationship from the fund's own library, opened through a logged download route and withdrawable at any time; an NDA can be required first, accepted with the version and time recorded; a meeting request stores a proposed time or a link and the outcome, not the call. **Left out: attachments inside messages** (they need an upload and file-check pipeline of their own); the fund shares files through materials instead.

## 1. Materials
- A fund's owner or admin grants an investor access to a **fund-wide document** from the fund's document library (`data_room_documents` with no investor attached, not archived). Documents attached to one investor are never offered. A grant belongs to one relationship, can be withdrawn at any time, and is possible only while the thread is open (in talks or later, not blocked).
- The investor sees the list (title, kind, file name, size) and opens a file through `GET /api/investor/requests/[id]/materials/[docId]`. The route checks the sign-in, that the relationship is theirs, that the grant is live, that the thread is open, and that the NDA step is met; it writes the access log (`data_room_document_views`) and redirects to the file. A withdrawn grant stops working at once; a file already downloaded cannot be recalled, and the page says so.
- The fund sees what it has granted and, from the document's log, whether it was opened.

## 2. The NDA step
- The fund's rules gain the text of **its own** NDA. Setting "an NDA is needed" without text is refused. Anker records acceptance of the fund's text; it does not draft or vet the NDA and the page says so (counsel).
- The investor accepts on the request: a copy of the text, its hash, the time, the address and a hash of the browser string are stored on the relationship. Acceptance happens once; later edits to the fund's text do not require a second acceptance of this relationship.
- While the rules require an NDA and it is not accepted, **no material can be opened** and the investor is shown the text and the button; the fund sees "NDA not yet accepted" beside each grant.

## 3. Meeting requests
Either side proposes a meeting: a time, a link (https only), or both, with a short note (500 characters). The other side accepts or declines; the proposer can cancel. At most three open proposals per relationship. Only while the thread is open. The platform stores the proposal and its outcome, never the call.

## 4. Notices
The same content-free notice as the thread (doc 65), throttled to one an hour, silenced by mute: a grant, an NDA, a meeting proposal tell the other side only that something is waiting. The email wording is made neutral ("has something for you").

## 5. Data (migration `2026-10-20e-investor-materials.sql`)
`relationship_materials(id, relationship_id, fund_id, document_id, granted_by, granted_at, revoked_at)` with one live grant per document per relationship; `relationship_meetings(id, relationship_id, fund_id, proposed_by, starts_at, link, note, status, created_at, answered_at)`; on `fund_relationships`: `nda_accepted_at`, `nda_text_hash`, `nda_text`, `nda_ip`, `nda_agent_hash`. Both new tables are fund-scoped in the tenant registry.

## 6. Tests
Only fund-wide, live, own-fund documents can be granted; a grant needs an open thread; withdrawal stops the download; the download needs the grant, the open thread, the NDA when required, and the right investor; the access is logged; the NDA text is required with the rule; acceptance records the copy and is once only; materials are blocked until accepted; meeting proposals: https link only, a time or a link, three open at most, only the other side answers, only the proposer cancels, closed once the thread closes; another fund or investor sees nothing; the registry orders the new tables before the relationships.

## 7. What was built, and what was not checked (2026-10-20)
- `lib/investor/materials.ts`; routes under `/api/investor/requests/[id]/{materials,materials/[docId],nda,meetings}` and `/api/fund/investor-requests/[id]/{materials,meetings}`; a documents-and-meetings panel under each conversation on both sides; the fund's listing form gains the NDA text (required when the NDA is). Migration `2026-10-20e-investor-materials.sql` applied to production; the registry rules the two new tables ahead of the relationships. The notice email now reads "has something for you".
- Tested: 10 integration tests (only own fund-wide live documents; closed conversation; grant once; no content in the notice; open logged and shown to the fund; withdrawal stops access; other investor or fund reaches nothing; the NDA blocks, records a copy, hash, address and browser hash once, survives a later edit, cannot be accepted by someone else; meeting proposals: https only, future time, something to propose, three open, only the other side answers, only the proposer cancels, closed with the conversation). Full suite 2305 passing, `tsc` clean.
- **Not checked:** a file actually opening from the storage address in a browser, the panels in a browser, a real notice email. Whether the stored file addresses are public (they are the data room's existing file URLs) is the data room's property: withdrawing a share stops this route, not a link someone already copied. That is stated on the investor's page; if it matters for a fund, the data room needs signed addresses (not in this slice).
- Still left in doc 61 P3: attachments inside messages (needs upload and file checks).
