# 36 — Chat attachments: past the request-size limit

Status: implemented 2026-10-02. Applies to `/dashboard/assistant` and `/dashboard/anker-ai`.

## Problem

Uploading a PDF or Word file in either chat returns **HTTP 413**. Both routes
(`/api/assistant`, `/api/anker/chat`) take the files as multipart in the request body.
Vercel rejects function request bodies above ~4.5 MB before application code runs, so the
app's own limits (12 MB body, 5 MB per file, 10 MB total) are never reached, and the
platform's reply is plain text, which the client reports as "Error 413". Separately, Word
files are refused by the server ("Word and audio are not supported yet") although the UI
offers `.docx` in Anker AI and a Word reader already exists (`lib/files/office-text.ts`).

## Decision

Reuse the pattern doc 14 §8 already settled for founder decks: **the browser uploads large
files straight to private Vercel Blob, the chat request carries only references, and the
server reads then deletes the blob.**

- `lib/assistant/attachment-limits.ts` — one set of limits for client and server.
  Inline (multipart) only while the total is ≤ 3 MB; otherwise every file goes via Blob.
  Blob ceiling 25 MB per file, 5 files, 40 MB total. Types: PDF, DOCX, XLSX, PNG/JPEG/WebP,
  TXT/MD/CSV/JSON/TSV.
- `POST /api/assistant/upload` — client-upload token route. Requires an AI principal; the
  token is bound to `assistant-uploads/<scope>/`, the allowed types, 25 MB and 10 minutes.
- `lib/assistant/upload-client.ts` — `prepareAttachments()` decides inline vs Blob and
  uploads. Both chat components use it and send `blobs: [{url, name}]` in JSON.
- `assistantUploads(files, blobs, scopeKey)` reads blob references the same way as files,
  after checking the path belongs to the caller's workspace, then deletes them.
- Word (`.docx`) is read as text for both chats.
- The client names the real cause: a 413 from the platform becomes "That upload is too
  large" instead of a bare status.

## Not changed

Vision/extraction paths, the 12 MB `boundedRequest` cap (still applies to inline bodies),
and the founder deck upload. Blobs never read (user abandons the send) remain until
removed; they are private, unguessable and bound to one workspace. A lifecycle sweep is a
follow-up, not part of this change.

## Acceptance

A 10 MB PDF and a Word file attach and are answered in both chats; a path under another
workspace's prefix is refused; blobs are deleted after reading; typecheck and tests pass.
