# Anker LinkedIn Extension — Privacy Policy

_Last updated: July 2026_

## What this extension does

The Anker LinkedIn extension is a companion tool for the Anker platform
([anker.de](https://anker.de)). It runs entirely in your browser and helps
you:

1. Capture LinkedIn profile pages into your Anker CRM (contacts you're
   researching or already working with).
2. Sync your 1st-degree connections and mutual connections into your Anker
   Network graph.
3. Show pre-drafted outreach messages while you're composing DMs on
   LinkedIn — nothing is auto-sent.

## What data is collected

Only the data you deliberately capture. Specifically:

| Trigger | Data captured | Sent to |
|---|---|---|
| Clicking **Send to Anker** on a LinkedIn profile | The rendered profile HTML, the profile URL, the connection-degree badge (1st/2nd/3rd), and any named mutual connections visible in the top card. | Your Anker server (whichever base URL you configured in Setup). |
| Clicking **Sync network to Anker** on your connections list or a people-search results page | Per visible card: profile URL, name, headline, company, title, location, thumbnail URL, connection degree. | Your Anker server. |
| Opening the popup and pasting a token | Base URL + bearer token stored in `chrome.storage.local`. | Nowhere — used locally to authenticate outbound requests. |

The extension does **not** collect:

- LinkedIn account credentials, cookies, or session tokens.
- Message contents from your inbox.
- Data from any site other than `linkedin.com`.
- Analytics, telemetry, crash reports, or usage data of any kind.
- Data from profiles you didn't explicitly click on.

## Where the data goes

Everything sent from the extension goes to the Anker server URL you
configure. The default is your organisation's Anker instance
(`https://anker.de` or a self-hosted deployment). We never proxy through
any third-party service. Requests are authenticated with a bearer token you
mint yourself in the Anker dashboard — the token is only usable against
your own account.

## Storage

- **In the browser:** the base URL and bearer token live in
  `chrome.storage.local` and never leave the extension except as the
  `Authorization: Bearer` header on outbound requests. Nothing is written
  to `localStorage` or cookies.
- **On the Anker server:** captured profiles are stored in your Anker
  Postgres database (`crm_entries`, `linkedin_connections`,
  `linkedin_mutuals`), owner-scoped by your user ID.
- **On LinkedIn:** the extension only reads the DOM of pages you visit.
  Nothing is written back to LinkedIn.

## Permissions the extension requests

| Permission | Why |
|---|---|
| `host_permissions` for `linkedin.com` | Read the DOM on LinkedIn pages so we can capture the profile/HTML you click Send on. |
| `storage` | Persist your base URL + bearer token between browser sessions. |
| `tabs` + `scripting` | Bulk capture — open profile URLs in a background tab, extract the HTML, close the tab. |
| `activeTab` | Read the current profile page when you click the toolbar icon. |

No `webRequest`, no `background` network interception, no
`declarativeNetRequest` beyond CORS on Anker responses.

## Your control

- **Uninstall the extension** — everything in `chrome.storage.local` is
  cleared automatically.
- **Revoke your token** — visit `/dashboard/settings/extension-tokens` on
  your Anker instance and click Revoke. Every future request from that
  token returns 401 immediately.
- **Delete captured data** — the Anker CRM lets you delete any contact,
  connection, or mutual edge you don't want stored.

## Third parties

None. There are no analytics, no error monitoring services, no ad SDKs.
The extension code is open source in the Anker repo at
`extensions/linkedin/`.

## Compliance with LinkedIn

The extension operates only on pages you're already logged into and only
captures data that's already visible to you on the screen — the same data
LinkedIn itself has made accessible to you. Nothing is scraped in the
background without a user click. There is no rate manipulation, no session
sharing, and no distributed data collection. If your LinkedIn account
terms forbid using extensions of this kind, don't install it.

## Contact

If you have questions about this extension, reach out to the maintainer
via the Anker platform. Issues can be filed at
<https://github.com/345668/Anker/issues>.
