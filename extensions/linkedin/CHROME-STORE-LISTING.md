# Chrome Web Store — Listing Copy

Paste this into the Chrome Web Store developer dashboard when submitting.
Screenshots and promo tiles need to be generated separately (see the
`screenshots/` folder — TODO).

---

## Short name (max 45 chars)

    Anker · LinkedIn to CRM

## Category

Productivity → Workflow & Planning

## Language

English

## Summary (max 132 chars)

    One-click LinkedIn profile capture into your Anker CRM, plus a Network graph of your 1st-degree connections and mutual introductions.

## Detailed description

**Anker LinkedIn** is a companion tool for the [Anker](https://anker.de)
venture platform. If you're running deal flow, LP outreach, or a founder
CRM inside Anker, this extension eliminates the manual step of copying
LinkedIn profiles into your database.

### What it does

1. **One-click profile capture** — on any `linkedin.com/in/` page, a
   floating "Send to Anker" button appears. Click it once and the profile
   is matched against your CRM (or saved to your LinkedIn Network graph
   if no CRM row matches). Anker's LLM extracts full name, title, firm,
   location, and connection degree.

2. **Sync your Network** — on your connections list or on any
   people-search results page, hit "Sync network to Anker" and every
   visible card is captured. The Anker dashboard renders the result as an
   interactive constellation graph — you at the centre, 1st/2nd/3rd
   degree rings, firm clusters, and "who can introduce me?" paths through
   mutual connections.

3. **Outreach assist in the LinkedIn inbox** — on `/messaging/*`, a side
   panel shows the pre-drafted subject + email body + LinkedIn DM Anker
   generated for that recipient (via the curated-XLSX import flow). Three
   Copy buttons. No auto-paste, no auto-send.

4. **Bulk capture from the toolbar popup** — paste a list of LinkedIn
   URLs and the extension captures each in a background tab with
   configurable throttling.

### What it does NOT do

- No auto-sending of connection requests or DMs.
- No scraping in the background without your click.
- No data collected from any site other than `linkedin.com`.
- No LinkedIn credentials, cookies, or session tokens are read or sent.
- No analytics or telemetry.

### Who it's for

Anker customers running:

- **Venture funds** — LP outreach and portfolio-company relationship
  tracking.
- **Venture studios** — cross-portfolio warm-intro paths.
- **Corporate deal teams** — target company + advisor mapping.

You need an Anker account. Mint a token from **Settings →
Extension tokens** in your Anker dashboard and paste it into the
extension's Setup screen.

### Privacy

Every request goes to your own Anker server — never to a third party.
Nothing is stored in the extension beyond the base URL and bearer token
you configure. Full privacy policy:
<https://github.com/345668/Anker/blob/main/extensions/linkedin/PRIVACY.md>.

### Open source

<https://github.com/345668/Anker/tree/main/extensions/linkedin>

## Screenshot slots

1. **1280×800** — extension popup, Setup tab, connected state (green
   "Connected as …" banner).
2. **1280×800** — LinkedIn profile page with the floating "Send to
   Anker" button highlighted, showing the "Saved to Anker" success
   toast.
3. **1280×800** — the Sync network confirmation on the Connections
   list page.
4. **1280×800** — the Anker Network constellation graph in the
   dashboard.
5. **1280×800** — the popup Bulk-capture tab mid-run showing the
   progress list.

## Promotional images

- **Small tile — 440×280**: rounded Anker anchor icon on the LinkedIn
  blue with tagline "LinkedIn → CRM, one click."
- **Marquee — 1400×560**: side-by-side split — LinkedIn profile on
  the left with the button, Anker CRM record on the right.

## Support URL

<https://github.com/345668/Anker/issues>

## Homepage URL

<https://anker.de>

## Privacy policy URL

<https://github.com/345668/Anker/blob/main/extensions/linkedin/PRIVACY.md>

## Single-purpose justification

> This extension has a single purpose: to move LinkedIn contact data into
> the user's Anker CRM. Every code path — profile capture, network sync,
> messaging assist — supports that one workflow. Nothing runs outside
> `linkedin.com` and nothing is sent anywhere except the user's own
> Anker server.

## Permission justifications

- **host_permissions (linkedin.com):** read the DOM on pages the user
  visits so we can capture profile data they click to send.
- **storage:** persist the user's Anker base URL and bearer token
  between browser sessions.
- **tabs + scripting:** implement the bulk-capture flow — open a URL in
  a background tab, extract HTML, close the tab.
- **activeTab:** read the current profile when the user clicks the
  toolbar action.

## Remote code use

None. All JavaScript is bundled with the extension. No dynamic script
injection, no eval, no external module loading.
