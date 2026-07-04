# Anker LinkedIn Extension

Chrome extension that does two things while you're using LinkedIn:

1. **Capture profiles into Anker CRM.** On any `linkedin.com/in/<slug>` page,
   a floating *Send to Anker* button appears top-right. One click ships the
   rendered HTML to `POST /api/extension/ingest`, which the server parses
   with `lib/agents/linkedin-public.ts` and writes onto the matching
   `crm_entries` row.

2. **Outreach assist.** On `linkedin.com/messaging/*`, a side panel shows the
   pre-drafted subject + email body + LinkedIn DM that Anker generated for
   that recipient (via the curated-XLSX import). Three Copy buttons. No
   auto-paste, no auto-send.

Plus a popup with bulk capture (a textarea of LinkedIn URLs, sequential
hidden-tab capture, throttled).

## Why an extension instead of headless scraping

LinkedIn renders most of its data with client-side JS post-auth. From a Node
server we'd need to log in (TOS-violating) or pay for an enrichment API. The
extension runs INSIDE your authenticated browser, so it sees what you see —
no impersonation, no scraping schedule, no cookie shipping.

## Install (developer mode)

1. `cd extensions/linkedin && pnpm install` (or `npm install`).
2. `cp .env.example .env` and set `PLASMO_PUBLIC_ANKER_BASE_URL` to your
   Anker deployment URL.
3. `pnpm dev` — Plasmo builds into `build/chrome-mv3-dev/`.
4. In Chrome, open `chrome://extensions`, enable **Developer mode** (top
   right), click **Load unpacked**, and select `build/chrome-mv3-dev/`.
5. Open the extension popup (Anker icon in the toolbar) → **Setup** tab:
   - Anker base URL: your deployment
   - Bearer token: mint at `<base>/dashboard/settings/extension-tokens` or
     by `POST /api/extension/tokens` while signed into Anker
   - Click **Test connection** — should say *"Connected as <your email>"*
6. Open any `linkedin.com/in/<slug>` page and look for the floating *Send to
   Anker* button.

For production builds: `pnpm build` produces `build/chrome-mv3-prod/`.

## Privacy

- The bearer token lives only in `chrome.storage.local` for this Chrome
  profile. It is never sent anywhere except your configured Anker base URL.
- The extension never reads or transmits LinkedIn cookies or auth state.
- All Anker API calls go through the background service worker, which
  forwards them with the bearer header. Content scripts cannot see the
  token.

## Hard constraints (deliberate)

- **No auto-send.** The extension never clicks LinkedIn's Send button on
  messages or connection requests. It surfaces drafts; you copy them.
- **No scheduled scraping.** Capture is always click-initiated (single
  profile via floating button) or popup-initiated (bulk capture).
- **No DOM-parser in the extension.** The HTML is shipped as-is to the
  server. `lib/agents/linkedin-public.ts` is the only place that knows
  LinkedIn's DOM shape — so when LinkedIn rewrites their markup, we patch
  one file server-side instead of redeploying the extension.

## Repository layout

```
extensions/linkedin/
├── package.json          # Plasmo + React + TS
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md             # this file
└── src/
    ├── background.ts     # Service worker - the only thing that holds the token
    ├── popup.tsx         # Toolbar popup: Setup + Bulk capture tabs
    ├── lib/
    │   └── anker-client.ts   # Anker API client (whoami / ingest / draft-by-name)
    └── contents/
        ├── profile.tsx       # linkedin.com/in/* floating capture button
        └── messaging.tsx     # linkedin.com/messaging/* draft panel
```

## Server-side companion

The extension talks to these routes in the Anker Next.js app
(`v0/345668-9c5fb9de`):

| Endpoint | Purpose |
|---|---|
| `POST   /api/extension/tokens` | Mint a bearer token (cookie-auth from dashboard) |
| `GET    /api/extension/tokens` | List active tokens |
| `DELETE /api/extension/tokens/:id` | Revoke |
| `GET    /api/extension/whoami` | Verify bearer + return user info |
| `POST   /api/extension/ingest` | Capture HTML into `crm_entries.linkedin_data` |
| `GET    /api/extension/draft-by-name` | Look up subject + body + DM for a recipient |

All extension routes accept CORS (`Access-Control-Allow-Origin: *`) and
bearer-token auth via `Authorization: Bearer ank_…`.
