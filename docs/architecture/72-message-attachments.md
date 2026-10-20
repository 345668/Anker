# 72. Build plan: attachments in messages (doc 61 section 7, closing doc 65)

Status: **built 2026-10-20; migration applied to production; see section 5.** Plan as written: Doc 61 section 7 allows attachments to a message: PDF, up to 4 MB. Doc 65 left them out because they need an upload and file-check pipeline. This is that pipeline, kept small and honest about what it does not do.

## 1. Rules
- Either side attaches up to **3 files** to a message, each **PDF, JPEG or PNG** judged by content (not by name or declared type), **up to 4 MB**, at most **25 MB per conversation**. A message may be only attachments (no text). Only while the conversation is open and the person's role allows writing.
- **File checks.** The type is read from the first bytes. A PDF is refused if it contains active content or things that run or hide other files (JavaScript, launch actions, embedded files, rich media, forms scripts, open actions) or disguises those names with hex escapes. This is a screen for the common risks, **not a virus scanner**: there is none yet, and the page says documents should only be opened if expected. Images are accepted as they are.
- **Storage.** Encrypted by the application (AES-256-GCM, as the passport and doc 60) before they reach the database; with no key the upload is refused (no plaintext fallback). The SHA-256 of the original is kept. Never read by any AI feature.
- **Download.** Through a route that checks that the person belongs to that conversation (either side's team, including viewers, who may read), sends the file as a download with the stored type, `nosniff` and no caching. Fund erasure removes them with the fund's relationships.
- **Notices** are unchanged: content-free, throttled, silenced by mute. They never name a file.

## 2. Data (migration `2026-10-20i-message-attachments.sql`)
`relationship_attachments(id, message_id, relationship_id, fund_id, filename, content_type, size_bytes, sha256, content_enc, created_at)`, fund-scoped in the tenant registry ahead of the messages; and the message text rule relaxed from "at least one character" to "at most 4,000" (a message may be attachments only).

## 3. Tests
Count, size, total and type limits; content not name; active-content PDFs and hex-disguised names refused; an attachments-only message; closed and view-only refusals; encrypted at rest and no bytes in thread listings; each side downloads the other's file; a stranger, another fund and another investor cannot; no key refuses; the registry orders the table before the messages; notices still carry no file name.

## 5. What was built, and what was not checked (2026-10-20)
- `lib/investor/attachments.ts` (checks), `lib/investor/read-message.ts`, `sendMessage` and `readThread` extended, `attachmentFor` added in `lib/investor/talks.ts`; message routes accept JSON or multipart on both sides; download routes `.../messages/files/[aid]`; the conversation panel has a file picker and shows attachments as download links. Migration `2026-10-20i-message-attachments.sql` applied to production (the message text rule is relaxed to "at most 4,000 characters"); the registry rules the new table ahead of the messages.
- Tested: 7 integration tests (type from content; active-content and hex-disguised PDFs refused, plain ones pass; count, size and empty; file-name cleaning; encrypted at rest, no bytes in listings; each side downloads the other's file, a viewer may read; notices carry no file name; stranger, other fund and other investor refused, a viewer cannot send; no key, conversation total, closed, nothing at all; a refused message stores nothing). Full suite 2346 passing, `tsc` clean.
- **Limits, stated plainly:** this is a screen, not a virus scanner, and there is none; images are not inspected beyond their header; a PDF that hides active content in ways the screen does not look for would pass. No retention job. A downloaded file cannot be recalled. **Not checked:** an upload and download in a browser against production storage.
