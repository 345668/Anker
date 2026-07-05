# Chrome Web Store — Preflight Checklist

Everything to check before hitting **Submit for review** in the Chrome
Web Store developer dashboard.

## Once, when you register

1. Create a Chrome Web Store developer account.
   - $5 one-time fee, Google account.
   - <https://chrome.google.com/webstore/devconsole/register>.
2. Verify contact email.
3. If publishing under a brand ("Anker"), verify the domain
   (`anker.de`) via the store's DNS/HTML challenge — the store then
   shows a verified publisher badge.

## Every release — before you upload

- [ ] **Test in production first.** Build `pnpm build --target=chrome-mv3`,
      `chrome://extensions → Load unpacked`, exercise all four flows:
      profile capture, connections sync, messaging assist, popup token
      test. Anything broken now will be a bad review later.
- [ ] **Increment the version.** Both `package.json.version` AND
      `package.json.manifest.version` (Plasmo mirrors from `manifest.*`).
      Semver only, monotonically increasing. Every submitted zip must have
      a higher version than the last one accepted by the store.
- [ ] **Manifest fields present.** The store rejects submissions
      missing any of these:
      - [x] `name` — set to `"Anker LinkedIn"`
      - [x] `short_name` — set to `"Anker"` (≤12 chars)
      - [x] `version` — set from `package.json`
      - [x] `description` — ≤132 chars, set in `manifest.description`
      - [x] `icons` — 16 / 32 / 48 / 128 all point at `assets/icon.png`
      - [x] `homepage_url` — set to `https://anker.de`
      - [x] `author` — set to `"Anker"`
- [ ] **No comments in the emitted `manifest.json`.** JSON strict-parse.
      Plasmo doesn't add any; nothing to do unless you hand-edited the
      generated file.
- [ ] **Zip is flat.** After `pnpm package --target=chrome-mv3`, unzip
      the artifact and verify `manifest.json` sits at the root — not
      inside a subfolder. The default Plasmo output is flat; the GitHub
      Actions workflow renames but doesn't rewrap.
- [ ] **All permissions are justified.** For each item in `permissions`
      and `host_permissions`, the store's submission form asks *why*.
      Copy-paste from `CHROME-STORE-LISTING.md → Permission justifications`.
- [ ] **Icon renders at 128px.** Open `assets/icon.png` and eyeball the
      antialiased edges of the anchor mark. If it looks fuzzy, replace
      with a higher-res source and rebuild.

## Store listing assets (once, then reused)

- [ ] **Screenshots — 5 slots, 1280×800 PNG each.**
      1. Popup **Setup** tab, connected state ("Connected as …").
      2. LinkedIn profile page with the floating **Send to Anker**
         button + the green "Saved to Anker" toast.
      3. Connections list page with the floating **Sync network to
         Anker** button and its progress panel.
      4. Anker `/dashboard/network` constellation graph (dark canvas
         with stars) — the payoff shot.
      5. Popup **Bulk capture** tab mid-run.
- [ ] **Small tile — 440×280 PNG.** Rounded Anker anchor on LinkedIn
      blue, tagline "LinkedIn → CRM, one click."
- [ ] **Marquee — 1400×560 PNG (optional, but recommended).**
      Side-by-side: LinkedIn profile with the button on the left, the
      Anker CRM record it created on the right.
- [ ] **Short summary — ≤132 chars.** Copy from
      `CHROME-STORE-LISTING.md → Summary`.
- [ ] **Detailed description.** Copy from `CHROME-STORE-LISTING.md →
      Detailed description`.
- [ ] **Category:** Productivity → Workflow & Planning.
- [ ] **Language:** English.
- [ ] **Support URL:** `https://github.com/345668/Anker/issues`.
- [ ] **Privacy policy URL:** raw GitHub link to
      `extensions/linkedin/PRIVACY.md` on `main`.

## Publish

1. Run `pnpm build --target=chrome-mv3 && pnpm package --target=chrome-mv3`
   from `extensions/linkedin/`.
2. Or push an `extension-v0.X.Y` tag and let
   `.github/workflows/extension-release.yml` build both zips.
3. Upload the `chrome-mv3-prod` zip to the developer dashboard.
4. Fill in every field on the store listing tab — the "Save draft"
   button reminds you of anything missing.
5. Submit for review. First submission usually takes 1–3 business days.
6. Once approved, the extension's public URL becomes
   `https://chromewebstore.google.com/detail/<random-id>`.
   Add that URL to `app/dashboard/settings/extension-tokens/page.tsx`
   as an "install from Chrome Web Store" button (alongside the
   Load unpacked flow, which stays as a dev-mode alternative).

## After publish

- [ ] Update `README.md` with the Chrome Web Store install button.
- [ ] Bump the "Latest release" URL in the client component if the
      release cadence changes.
- [ ] Watch the review status email — if the store rejects for a
      permission or copy issue, the resubmission clock is fast (usually
      hours, not days).

## Common rejection causes and how to avoid them

| Cause | Prevention |
|---|---|
| "Purpose not clear" | The single-purpose statement in `CHROME-STORE-LISTING.md` is explicit — one workflow, LinkedIn → Anker CRM. Copy it exactly. |
| "Broad host permissions unjustified" | We only request `linkedin.com`, not `<all_urls>`. |
| "Unclear permission use" | Every permission has a one-line justification in the listing copy. |
| "Data disclosure incomplete" | `PRIVACY.md` covers every field captured. Link it as the privacy policy URL. |
| "Remote code" | We bundle everything — no CDN loads, no `eval`, no dynamic `<script>` injection. Explicit in the store listing. |
| "Screenshot doesn't match extension" | Take screenshots from the actual current release, not from an older mock. |
