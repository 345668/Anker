# 08. Retention as configured (generated)

*Generated from `lib/investor/retention-policy.ts`, the numbers the daily job (`/api/cron/investor-retention`) uses. Every period is **proposed, for counsel to confirm**. Do not edit by hand: change the policy file and regenerate with `npx tsx scripts/legal/gen-investor-pack.ts`; a test fails if this file differs.*

| Data | Kept for | Then |
| --- | --- | --- |
| A pending sign-up (address, name, hashed code) | 1 day after it was asked for | Deleted |
| A pending code to link a record a fund added | 1 day | Deleted |
| Answered, revoked and expired team invitations (an email address) | 30 days after they closed | Deleted |
| A fund's discoverability invitation nobody answered | 30 days | Closed as withdrawn |
| The card a fund saw, kept on an answered invitation | 180 days after the answer | The card is emptied; the fact and date of the invitation stay (they enforce the 90-day wait after a decline) |
| Identity documents in the passport of an entity that was archived | 30 days after archiving | File contents wiped |
| A replaced passport record that was never shared | 30 days | Deleted (the bytes were wiped when it was replaced) |
| Files attached to messages in a conversation that ended (declined or withdrawn) | 365 days after it ended | Files deleted; the messages stay |
| The entity's activity log (who did what) | 1095 days (three years) | Deleted |

## Not removed by the job, by design

- A fund's relationship record with an investor, and the fund's own messages: these are the fund's records, under the fund's own retention. They are anonymised if the investor asks for erasure.
- Anything a fund has already checked in its onboarding (identity documents, subscription documents): the fund's legal records.
- The investor's profile, entities, messages and passport while the account exists: kept until the person deletes them or erases the account.
- Audit-log entries about sharing and erasure, which hold no document content or personal text.
