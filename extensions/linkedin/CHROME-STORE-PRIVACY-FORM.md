# Chrome Web Store — Privacy form

Copy-paste text for every field in the CWS developer dashboard's
_Privacy_ tab. Each block is under its per-field character limit and
matches what `PRIVACY.md` in this folder discloses to the public.

---

## Single purpose description (≤1000 chars)

Anker LinkedIn moves LinkedIn contact data into the user's Anker CRM
(anker.de) and Network graph. Every code path in the extension supports
that one workflow. On a linkedin.com/in/ profile page, a floating "Send
to Anker" button captures the visible profile HTML and forwards it to
the user's Anker server so their CRM row is created or updated. On the
user's own connections list and people-search results, a "Sync network
to Anker" panel auto-scrolls, extracts the visible cards, and streams
them to the same server. On the messaging inbox, a side panel shows
Anker's pre-drafted DM for the current recipient with a Copy button. A
toolbar popup lets the user paste a list of LinkedIn URLs for throttled
bulk capture. Nothing runs outside linkedin.com. Everything is sent
only to the user's configured Anker base URL. No auto-messaging, no
headless scraping, no third-party services.

---

## Permission justifications

### storage (≤1000)

storage is used to persist two small values in chrome.storage.local
scoped to the user's Chrome profile: the Anker base URL the extension
talks to, and the bearer token the user pastes on the Setup screen.
Without persistent storage the user would have to re-paste their Anker
URL and token on every popup open, which is impractical. The token is
opaque to LinkedIn — it authenticates only against the user's own Anker
server. Nothing else is stored: no cookies, no session data, no page
HTML, no analytics identifiers, no cache of captured profiles. When the
user revokes their token in the Anker dashboard, the next request fails
with 401 and the extension surfaces the error; when the user uninstalls
the extension, Chrome clears chrome.storage.local automatically.

### tabs (≤1000)

tabs is used solely for the Bulk capture flow in the toolbar popup.
When the user pastes a list of LinkedIn profile URLs and clicks
Capture, the extension calls chrome.tabs.create({ active: false }) to
open each URL in a background tab, chrome.tabs.onUpdated to wait for the
tab to reach status "complete", and chrome.tabs.remove to close the tab
immediately after the HTML has been extracted. Between URLs, the
extension sleeps a configurable delay (default 3 seconds) to respect
LinkedIn's load pace. tabs is not used to enumerate the user's other
tabs, read their titles or URLs across sessions, or take any action
outside the URLs the user has explicitly pasted into the popup. If
bulk capture is disabled or unused, the tabs permission is inactive.

### scripting (≤1000)

scripting is used with chrome.scripting.executeScript exactly once per
URL during the Bulk capture flow. After a background LinkedIn tab
reaches "complete", the extension executes a single-line function —
document.documentElement.outerHTML — inside that tab to obtain the
rendered HTML of the profile page. That HTML is then forwarded to the
user's Anker server for parsing. The injected function reads the DOM
only. It does not write, click, submit forms, evaluate strings, or load
remote code. No other executeScript, insertCSS, or
registerContentScripts calls are made. Regular non-bulk capture on /in/
pages runs via a declared content script in the manifest, which does
not require the scripting permission at runtime.

### activeTab (≤1000)

activeTab is used only when the user clicks the extension's toolbar
action to open the popup on a LinkedIn tab. It grants a scoped,
temporary reading permission on the current tab so the popup can, if
needed, resolve whether the user is currently on a LinkedIn page and
offer the right controls. activeTab is not used to read the user's
browsing history, to inspect content on non-LinkedIn tabs, or to
perform any action that persists after the popup is dismissed.
Everything the extension does that requires reading a LinkedIn page's
DOM either runs from a declared content script (matches: linkedin.com
only) or through the Bulk capture scripting.executeScript path.

### Host permission (≤1000)

The extension declares host permissions only for
https://www.linkedin.com/* and https://*.linkedin.com/*. Access to
linkedin.com is required because the entire purpose of the extension
is to help the user move contact data from LinkedIn pages they visit
into their Anker CRM. The content scripts inject a floating "Send to
Anker" button on /in/ profile pages, a "Sync network to Anker" panel on
/mynetwork/…/connections/ and /search/results/people/ pages, and an
outreach-assist side panel on /messaging/ pages. Without host access to
linkedin.com the extension cannot read the profile HTML the user
chooses to capture and cannot render its own controls in the LinkedIn
UI. The extension does not request access to any non-LinkedIn hosts
and does not use <all_urls> or wildcard patterns beyond linkedin.com.

---

## Remote code

**Answer:** No, I am not using remote code.

Reason (not asked for as a field if you answer No, but keep it here for
the record): All JavaScript and static assets ship inside the extension
zip. There is no <script src="…external…">, no dynamic import from a
CDN, no eval-ed string, no Wasm loaded from the network. The build
output under `build/chrome-mv3-prod/` is fully self-contained.

---

## Data usage — what user data is collected

Tick the boxes below. Leave all other boxes unticked.

- [x] **Personally identifiable information** — captured profile names,
      headlines, firm names, LinkedIn URLs; the user's own email is
      visible in the Test connection response from the Anker server.
- [x] **Authentication information** — the user's Anker bearer token,
      stored in chrome.storage.local and sent as the Authorization
      header on API calls.
- [x] **Website content** — the rendered HTML of LinkedIn pages the
      user explicitly clicks Send on.
- [ ] Health information
- [ ] Financial and payment information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity

---

## Certifications

Tick all three:

- [x] I do not sell or transfer user data to third parties, outside of
      the approved use cases.
- [x] I do not use or transfer user data for purposes that are
      unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness
      or for lending purposes.

---

## Privacy policy URL (≤2048)

    https://github.com/345668/Anker/blob/main/extensions/linkedin/PRIVACY.md

Alternative plain-text version (only if reviewers ask for it):

    https://raw.githubusercontent.com/345668/Anker/main/extensions/linkedin/PRIVACY.md

---

## Notes on the "in-depth review" flag

CWS will flag the submission "Due to the Host Permission, your extension
may require an in-depth review which will delay publishing." This is
routine for any extension declaring a specific host and does not
indicate a problem with the submission. Because our host is scoped to
linkedin.com (not `<all_urls>` and not a wildcard), review usually
clears within 1–3 business days. Keep the answers above unchanged in
future updates — the fewer surprises for the reviewer, the shorter the
turnaround.
