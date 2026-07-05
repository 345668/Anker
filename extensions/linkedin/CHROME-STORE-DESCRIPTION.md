# Chrome Web Store — Detailed description

_Paste directly into the "Detailed description" field of your Store
listing. Under 16 000 characters as required. Plain text, one blank line
between paragraphs, no Markdown syntax — the store renders line breaks
and links from bare URLs on its own._

---

Anker LinkedIn is a companion tool for the Anker venture platform (anker.de). If you run a fund, a venture studio, or a corporate deal team out of Anker, this extension eliminates the manual copy-paste of LinkedIn profiles into your CRM. Every action is user-initiated. Every request goes only to your Anker server. No LinkedIn credentials, no cookies, no third-party analytics, no ads.

What it does

1. One-click profile capture
On any linkedin.com/in/<slug> page, a floating "Send to Anker" button appears in the top-right of the viewport. Click it once and the current profile is captured. The extension reads the rendered HTML of the page, forwards it to the Anker server, and lets Anker's LLM parse the fields — full name, current title, firm, geography, connection degree, and any named mutual connections visible in the top card. If the person already exists in your Anker CRM, the row is updated with the fresh data. If they don't, they are saved to your LinkedIn Network graph as a captured connection instead — nothing is lost, and next time you match them against a CRM upload they get promoted automatically.

2. Sync your 1st-degree network
On your connections list at linkedin.com/mynetwork/invite-connections/connections or on any people-search results page, a floating "Sync network to Anker" panel appears on the right. Hit the button and the extension auto-scrolls the virtualised list, extracts every visible card, deduplicates by profile URL, and streams the batch to Anker in chunks of 50 with clear progress reporting. The Anker dashboard then renders the result as an interactive constellation graph — you at the centre, 1st / 2nd / 3rd degree rings, firm-based clustering, click-to-drawer intro paths via mutual connections.

3. Outreach assist in the LinkedIn inbox
On linkedin.com/messaging, a side panel shows the pre-drafted subject line, email body, and LinkedIn DM that Anker generated for the current conversation's recipient (via the curated-XLSX outreach workflow). Three copy buttons — one per snippet. No auto-paste, no auto-send, no keystroke automation. You are always the one who hits Send.

4. Bulk profile capture from the toolbar popup
Paste a list of LinkedIn URLs into the popup's Bulk capture tab and the extension captures each one in a hidden background tab with configurable throttling (default 3 seconds between profiles). Each row shows a real-time success / no-CRM-match / error state and can be re-run on demand.

Who it's for

Venture funds — Sync 1st-degree LP relationships, map warm-intro paths to prospects, and pipe every LinkedIn interaction back into your fund's CRM without leaving Anker.

Venture studios — Track cross-portfolio operator and advisor relationships. See at a glance which of your portfolio companies has a warm path to a specific target.

Corporate deal teams — Build a searchable graph of every named contact you meet, with automatic deduplication against your CRM's shortlist boards.

Sales and business development teams that already run outreach through Anker — Skip the copy-paste step. Every profile you visit becomes one click away from being enriched, drafted, and tracked.

You need an Anker account to use the extension. Mint an extension bearer token from Settings → Extension tokens in your Anker dashboard and paste it into the extension's Setup screen. Tokens are hashed server-side with SHA-256 — the plaintext is only ever shown to you once at mint time, and you can revoke a token from the same page at any time.

How it works under the hood

The extension is a Manifest V3 Chrome extension. It runs only on the linkedin.com domain and only when you click something. There is no background scraping and no persistent listener that watches your browsing.

Auth — Your Anker base URL and bearer token live in chrome.storage.local, scoped to your Chrome profile. On every request the token is sent as an Authorization: Bearer header. Nothing else is stored: no cookies, no session data, no request cache.

Profile capture — When you click "Send to Anker" on a profile page, the content script grabs the rendered outer HTML of the page and forwards it to POST /api/extension/ingest on your Anker server. The server parses it with Anker's own LinkedIn parser and writes onto the matching CRM entry or the linkedin_connections table. Owner-scoped by your user id — you never see other users' data and other users never see yours.

Network sync — Auto-scroll uses a bounded loop that stops when the scroll height stops growing for six consecutive ticks (i.e. LinkedIn has no more cards to load). Extracted cards are batched to POST /api/extension/connections in chunks of 50, again owner-scoped. Duplicate captures never lose data — on conflict, the server keeps whichever version has the richer non-null fields.

Mutuals — On a profile page, the extension additionally reads any "you and X both know Y" text visible in the top-card mutuals widget. Named mutuals are shipped separately to POST /api/extension/mutuals, where they power the 2nd / 3rd degree edges in your Anker Network graph and the "who can introduce me?" drawer in the CRM.

Messaging assist — On a conversation page, the extension reads the recipient's display name from the conversation title, calls GET /api/extension/draft-by-name on your Anker server, and renders the returned draft in a side panel with three Copy buttons. If your Anker CRM has no matching draft, the panel shows a "no draft" state — nothing is auto-generated in-place.

Bulk capture — The popup opens each URL in a background tab, waits up to 12 seconds for the tab to reach a settled state, injects a one-off scripting.executeScript to read outerHTML, forwards to the server, closes the tab, sleeps the configured delay, and moves on. LinkedIn's own load pace is respected — the default 3-second throttle is on the conservative side of what a human would do.

What it does not do

Never sends connection requests, DMs, InMail, or any other outbound message on your behalf.

Never reads or transmits your LinkedIn credentials, session cookies, li_at tokens, JSESSIONID, or any other LinkedIn auth material.

Never runs in the background without a user click. There is no periodic sync, no idle-time scraping, no notification listener that fires on inbound messages.

Never reads content on domains other than linkedin.com. The extension has zero host permissions outside www.linkedin.com and *.linkedin.com.

Never uses declarativeNetRequest, webRequest, or any request-interception API. It cannot see, modify, or log traffic to any site.

Never sends telemetry, crash reports, or usage data. There is no analytics SDK bundled and no external network endpoint other than your own configured Anker base URL.

Never bundles remote code. All JavaScript ships in the extension package. There is no eval, no dynamic script tag injection, no CDN-loaded module.

Privacy in one paragraph

The only data the extension moves is the LinkedIn page HTML you deliberately click Send on, plus the visible fields from cards you deliberately Sync, plus the recipient name from a conversation you already have open. Everything else — connection graphs, CRM rows, drafts, notes — stays on your Anker server. Full privacy policy at https://github.com/345668/Anker/blob/main/extensions/linkedin/PRIVACY.md.

Permission justifications

storage — Persist your Anker base URL and bearer token between browser sessions so you don't paste them every time.

tabs and scripting — Bulk capture — open one URL in a background tab, extract HTML with a one-shot scripting.executeScript, close the tab.

activeTab — Read the current profile page's HTML when you click the toolbar action.

host_permissions on www.linkedin.com — Inject the floating buttons and side panels on the LinkedIn pages you visit. The extension does not have — and does not request — any host access to non-LinkedIn sites.

Single-purpose statement

This extension has a single purpose: to move LinkedIn contact data into the user's Anker CRM. Every code path — profile capture, network sync, messaging assist, bulk capture — supports that one workflow. Nothing runs outside linkedin.com and nothing is sent anywhere except the user's own Anker server.

Compliance with LinkedIn

The extension operates only on pages you're already logged into and only captures data that's already visible to you on the screen — the same data LinkedIn itself has made accessible to you. Nothing is scraped headlessly, no session sharing, no distributed collection. Every action is user-initiated. If your LinkedIn account terms forbid using extensions of this kind for your specific use case, please don't install it.

Open source

The full source is at https://github.com/345668/Anker/tree/main/extensions/linkedin — content scripts, background service worker, popup UI, and the API client. Issues at https://github.com/345668/Anker/issues. Preflight checklist and store-listing copy live alongside the source at extensions/linkedin/PREFLIGHT.md.

Get started in three steps

1. Sign into your Anker dashboard and visit /dashboard/settings/extension-tokens.
2. Mint a token — copy the plaintext once, paste it into the extension's Setup screen alongside your Anker base URL, and click Test connection.
3. Go browse LinkedIn. Every profile is one click away from your CRM.

Support and feedback

Support URL: https://github.com/345668/Anker/issues
Homepage: https://anker.de
Privacy policy: https://github.com/345668/Anker/blob/main/extensions/linkedin/PRIVACY.md
