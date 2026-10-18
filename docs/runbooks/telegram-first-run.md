# Telegram channel: the first real run (T5a)

For the founder, with Claude watching. Doc 57 section 21. Nothing here needs code. The aim is to see each behaviour of the channel once, on a real phone, and write down what is wrong. Never paste a bot token into the chat: it goes only into the Anker page below.

## Where things are
| What | Where |
| --- | --- |
| The Telegram page for customers (connect a bot, link a phone, switches) | **Anker, `/dashboard/channels`**: the sidebar's bottom block, "Connected channels" (added 2026-10-18); also in the command palette |
| Usage and allowance | Anker, `/dashboard/usage` ("Usage" next to it) |
| Operator view: webhook, queue, links | **SAIL, Telegram channel** (Governance) |
| The switch that turns the channel on | **SAIL, Feature flags: `telegram_channel`** |
| The public list of services that see customer data | SAIL, Sub-processors: "Telegram" |
| Per-workspace overrides | SAIL, Tenants, the workspace, features |

## Before you start (about 10 minutes)
1. **Decide who can see the card.** Turning `telegram_channel` on makes the card available to **every workspace that has no plan** (all 14 workspaces today, because none has a plan assigned). Nobody gets Telegram unless they connect a bot themselves, but until the first run is done it is cleaner to keep it to your workspace: in SAIL, Tenants, open **Summit Venture Studio**, **Winner Capital** and **Serian Media** (the three with real users) and set the feature `channel_telegram` to off.
2. **Create a test bot.** In Telegram open @BotFather, send `/newbot`, name it something like "Anker AI test", copy the token. Keep it to yourself.
3. **SAIL, Feature flags:** switch `telegram_channel` **on**.
4. **SAIL, Sub-processors:** set Telegram to "in use today" (the public privacy page says "not in use" until you do).
5. **Anker, Connected channels, "Your own bot":** paste the token, press Connect bot. You should see "Connected: @yourbot" and "Telegram is delivering messages to Anker". (If it says the platform key is not set, tell me: `SECRET_KEY` is missing in Vercel.)
6. **Tell me "bot connected".** I run `node scripts/telegram-watch.mjs`, which prints counts and statuses only (no message text, no names, no tokens) and confirms the bot row and the webhook are there.

## The walk (each step: what you do, what you should see, what I check)
| # | You do | You should see | I check |
| --- | --- | --- | --- |
| 1 | Press **Connect Telegram**, open the link on your phone, press Start | The bot answers "Almost there... approve this device" | a device in `pending` |
| 2 | Back in Anker, **Approve this device** | The bot sends "Connected" | the device `active` |
| 3 | Type: "who did I contact last week?" | An answer in plain text within about 20 seconds; "typing" while it works | one update `done`, usage event for chat |
| 4 | Type the same from a second, unlinked Telegram account (or ask someone) | Only "I don't know this Telegram account yet" | no answer, no link |
| 5 | Tick **"I may make changes"** on the device, then type: "move [a contact] to Contacted" | A message with the change and **Approve** and **Reject** buttons | one pending proposal |
| 6 | Press **Approve** | "Done", the contact is in Contacted in Anker; pressing again does nothing | proposal `applied` once |
| 7 | Type a request to email someone | The bot refuses to send anything to others and offers a draft only | no send, no proposal above R1 |
| 8 | Send a **voice note**, 20 seconds, saying "Remind me to call Katja Friday" | The bot shows what it heard and asks you to **Save as note, Ask, or Discard** (nothing happens before you tap) | a held note, a speech usage event |
| 9 | Tap **Ask** | An answer based on what you said | an update `done` |
| 10 | Send a **PDF** (a few pages, no secrets) | A short summary; the file is not kept | a file usage event, nothing stored |
| 11 | Send a **photo of text** | It reads the text | |
| 12 | Switch on **"read my answers aloud"** and ask a short question | The text, then a short **voice message** | a speech usage event |
| 13 | Switch on **"send me a short brief each morning"**, then wait for the next morning after 07:00 Berlin | One message "Your day" with task titles | a `last_brief_on` date |
| 14 | Send `/forget` | The bot deletes the last 48 hours of both sides and says how many | `telegram_sent` emptied |
| 15 | **Disconnect** the device in Anker | The bot says it was disconnected and answers nothing after | device `revoked` |
| 16 | Open **SAIL, Telegram channel** | Webhook registered, queue empty, last error none | |

Things to try that are likely to break, because they are unusual: a question in German; a 30-minute voice note (it should be cut and read in pieces); a file over 20 MB (it should refuse with a pointer to the web app); a voice note while the workspace has no speech key (it should say so in words); sending a message while Vercel is mid-deploy (it should arrive late, not twice).

## Afterwards
- I write what worked, what did not and what was fixed into `docs/status-register.md`.
- If everything passed, leave the flag on for your workspace only and tell me which workspaces to enable next; if not, switch `telegram_channel` off in SAIL (the bot then answers that it is not available).
- Revoke the test bot in @BotFather (`/revoke`) when you are done, or keep it for daily use.
