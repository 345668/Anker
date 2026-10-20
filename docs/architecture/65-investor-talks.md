# 65. Build plan: talks between an investor and a fund (doc 61 P3, first part)

Status: **built 2026-10-20 (thread, mute and block, content-free notifications, nudges); migration applied to production; see section 7.** Plan as written: Follows doc 64. Doc 61 section 7 describes talks as a message thread, materials the fund shares, an NDA step, a meeting request, and nudges. This slice builds the thread, the controls around it and the nudges. Materials, the NDA and meeting requests are left for P3b because they depend on the fund's document library and the logged download route of doc 60, and need their own design check.

## 1. Rules
- A thread exists per relationship. It can be written to only while the relationship is `in_talks`, `invited_to_onboard`, `onboarding` or `active`. In every other stage it is readable and closed. A fund cannot write before it has accepted (no unsolicited contact); an investor cannot write before the fund has accepted.
- Plain text, 1 to 4,000 characters, no attachments in this slice. At most 30 messages an hour per sender per relationship.
- **Mute** (either side) keeps the thread but stops that side's notifications. **Block** ends the relationship: a block by the fund sets it to `declined` and stops that person asking the fund again; a block by the investor sets it to `withdrawn`. Messages stay readable to both for the records the fund must keep, but nothing new can be sent.
- **Notifications carry no content.** An investor gets an email saying there is a new message and a link; a fund's owners and admins get an in-app notification saying the same. At most one per side per relationship per hour. The email never names the fund's amounts or the text.
- Read marks: opening a thread marks the other side's messages read; the list shows unread counts.
- A fund sees only its own relationships' threads; an investor only their own. Notes the fund keeps are not part of this slice and are never shown to the investor.

## 2. Nudges (doc 61 section 6, decision 7)
A daily job. A request still `interested` after 7 days: one reminder to the fund's owners and admins. After 14 days the investor's request list shows a one-line offer to withdraw (computed from the date; nothing is sent). A relationship `in_talks` with no message for 30 days: one in-app note to the fund and one email to the investor asking whether to continue; repeated no sooner than 30 days. Nothing is declined automatically.

## 3. Data (migration `2026-10-20b-investor-talks.sql`)
`relationship_messages(id, relationship_id, fund_id, sender 'investor'|'fund', sender_user_id, body, created_at, read_at)`; on `fund_relationships`: `investor_muted`, `fund_muted`, `blocked_by`, `investor_notified_at`, `fund_notified_at`, `nudged_at`, `quiet_asked_at`, `last_message_at`. The messages table is fund-scoped in the tenant registry (a fund's erasure removes its threads).

## 4. Surfaces
API: investor `/api/investor/requests/[id]/messages` (GET, POST) and `.../prefs` (POST mute, unmute, block); fund `/api/fund/investor-requests/[id]/messages` and `.../prefs`. Pages: a thread panel on "My requests" and on the fund's queue. Cron: `/api/cron/investor-nudges` daily.

## 5. Tests
Cannot write before acceptance; closed stages are read-only; length and rate limits; each side reads only its own threads and another fund sees nothing; read marks; mute stops notifications and a notification is throttled to one an hour; email text has no message content; a fund's block declines and stops a new request from that person; an investor's block withdraws; nudges: 7-day reminder once, 30-day quiet note once and not again within 30 days, nothing declined.

## 6. Not in this slice
Attachments, materials, NDA, meeting requests (P3b); the Actions-inbox proposal for a new request; the bridge to doc 60 (P4).

## 7. What was built, and what was not checked (2026-10-20)
- `lib/investor/talks.ts`; migration `2026-10-20b-investor-talks.sql` (applied to production and recorded); API routes for both sides (`.../messages`, `.../prefs`); a thread panel on "My requests" and on the fund's queue; cron `/api/cron/investor-nudges` (daily 07:20 UTC, registered in `vercel.json` and the ops freshness table); a fund's block also stops that person's next request.
- Tested: 12 PGlite integration tests (no writing before acceptance, closed stages, text limits, rate limit, isolation between pairs and funds, read marks, content-free notices throttled to one an hour and silenced by mute, block by each side, both nudges once and nothing declined) plus the existing suite: 2281 tests and `tsc` pass.
- **Not checked:** an email actually delivered, the pages in a browser, the cron firing on Vercel (it runs after this deploy), any of it with a real fund. The whole investor side is still closed behind `investor_signup` and `listed_for_lps`.
- Left for P3b: attachments, fund materials, the NDA step, meeting requests.
