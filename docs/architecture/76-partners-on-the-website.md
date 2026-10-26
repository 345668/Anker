# 76. Partners on the website, and the Residency interview

Status: **spec and first build, 2026-10-26.** The founder asked for the partners they have worked with to appear on the website, each with a short description, the pilot partners included, and for an interview of The Residency's founder with Sam Altman to be added.

## 1. What goes on the site
- **A "Partners" section on the homepage** (names only, grouped, linking to the full page) and a **`/partners` page** with one card per partner: name, one-sentence description, an optional link to the partner's own site. Linked from the footer (Company column) and from the About page.
- **Groups** (the order they are shown): *Design partners and pilots* (Summit Venture Studio, Winner Capital, ThirdWorldVC); *Programmes and communities* (Decile Group and Decile Capital, The Residency, The Delta, Makershome, Pioneerclub, TBDC); *Public programmes* (Women TechEU, Innovate UK); *Investors and capital* (LvlUp Ventures, Clearco).
- **The interview** (The Residency's founder with Sam Altman) as an "In conversation" block on `/partners`, directly under The Residency's group, with the video, the transcript and a link out. **Hidden until a source exists**: no link, file or transcript was supplied, and none could be found.

## 2. One source of truth
`lib/marketing/partners.ts` holds every partner as typed data: `slug`, `name`, `group`, `description` (or `null`), `url` (or `null`), `listed` (a one-line switch to hide a partner), `kind` (`pilot` | `partner`) and `checked` (whether the description has been confirmed by the founder). The homepage section, the page and the tests all read it; nothing is typed into a component. Adding a partner is one entry.

## 3. Rules the data must keep (tested)
1. **No invented facts.** A description is one sentence, at most 160 characters, and says only what the partner publicly says about itself, or, for a pilot, what the pilot is. No numbers (fund sizes, portfolio counts, cheque sizes), no claims about what the partner did *with* Anker beyond "piloting Anker" for pilots.
2. **Pilots are described only by their role.** Pilot partners are fund managers whose decks and details are confidential: no fund size, strategy, stage or location, no link, no logo.
3. **A link is shown only if it was verified** (the partner's own domain, found on a public source). Unverified: `null`, and the card has no link.
4. **A partner whose identity could not be confirmed online has no description**, and the card shows the name and group only. The founder supplies one sentence; setting `description` and `checked: true` publishes it.
5. **Names and wordmarks only.** No logos until each partner has agreed to their use (a logo needs permission and the partner's own asset); the card uses a typeset wordmark. A `logo` field is reserved for later.
6. **Permission.** Putting a partner's name on a public site implies they agree to be named. The founder confirms this per partner; `listed: false` removes one at once. The pilots (Summit Venture Studio, Winner Capital, ThirdWorldVC) were fund-manager design partners under confidentiality, so their listing is the founder's explicit decision, recorded here.

## 4. The repository's redaction rule
`scripts/redactions.json` stores hashes of terms that must not appear in the repository (confidential deck contents; the docs use descriptors, not names, for the pilot partners and founders). Checked 2026-10-26: **none of the partner names is on the list**, so `pnpm redaction:check` is unaffected and nothing is removed from it. What stays out of the repository regardless: deck contents, fund sizes, strategies, the founders' deck names. The pilots' names appear only in `lib/marketing/partners.ts`, by the founder's decision to list them.

## 5. The interview block
`components/landing/interview-embed.tsx`: shows a poster and a "Play" button; the video loads **only after the click** and only from the privacy-friendly embed address, so no third-party request happens on page load (the site's cookie consent rules apply). Under it: the speakers and date, a link to the original, and the transcript in a collapsible section. Inputs: `url`, `title`, `speakers`, `date`, `transcript` (optional). With no `url` the block renders nothing. **Needed from the founder:** the link (or file), the right to publish it, and the date.

## 6. Design
Uses the existing editorial styles (`editorial.module.css`): a grid of cards on `/partners`; on the homepage a quiet strip of typeset names between the audiences and "Our perspective" sections. Heading: "Partners we have worked with." Accessible: the page has one `h1`, groups are `h2`, links name their destination ("Visit <partner>"), external links open in the same tab with `rel="noopener noreferrer"`.

## 7. SEO and structure
`/partners` has its own title and description and an `Organization` JSON-LD with `partner` entries only for listed partners that have a link. No sitemap file exists in the repository; none is added.

## 8. Tests
Every listed partner has a name, a group in the defined order, a description of at most 160 characters or `null`; unchecked partners never carry a description that mentions a number; pilots have no link; every link is `https` and on a partner-owned domain; slugs are unique; `listed: false` hides a partner everywhere; the page renders every listed partner once, grouped; the interview block renders nothing without a URL, loads no embed before the click, and uses the privacy-friendly address after it; the homepage section links to the page; the footer links to it; the redaction check still passes with the names present.

## 9. Not in scope
Logos; partner testimonials; per-partner pages; a partner admin screen (the data file is the admin until there are many partners).
