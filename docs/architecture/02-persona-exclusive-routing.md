# 02 — Persona-exclusive routing

**Date:** 2026-09-21 · **Status:** design · **Depends on:** the scope key
(doc 00), and lands after doc 03 · **Spine:**
[00-persona-isolation.md](00-persona-isolation.md)

Requirement: each persona's pages are its own, and no persona is ever routed to
a page owned by another.

---

## 1. Today the URLs are literally shared

`lib/nav/work-areas.ts` maps persona → routes. Founder and VC both list:

```
/dashboard/crm
/dashboard/outreach
/dashboard/linkedin/{campaigns,leads,unibox,review,senders,analytics,suppression,extension}
/dashboard/discover   /dashboard/network   /dashboard/calls
/dashboard/decks      /dashboard/documents /dashboard/tools  /dashboard/analytics
/dashboard/assistant  /dashboard/anker-ai
```

Same URL, same file, persona decided inside the page. LP gets three areas —
Assistant, Capital activity (`/lp/distributions`), Documents (`/lp/documents`,
`/lp/calls`) — so LP is *partly* separated already, by the `/lp/` prefix, and
partly not, because it shares both assistant routes.

Roughly 25 routes are persona-gated by an in-page check
(`app/dashboard/pipeline/page.tsx`, `find-investors`, `fund-tax`,
`term-sheet`, `data-room`, …). The gate works; the URL does not distinguish.

### Why sharing the URL is a problem in practice

- **A bookmark is ambiguous.** `/dashboard/crm` means a different entity
  depending on which workspace happens to be active. Open it from a founder
  workspace and a VC workspace and you get different data at the same address.
- **Back/forward across a workspace switch** lands on a page that now shows
  someone else's entity, or an error — which is the 409 the assistant already
  has to throw.
- **In-page branching accumulates.** Every shared page grows a `persona ===`
  ladder, and the two halves drift until the page is two pages in a trench
  coat.
- **It makes the isolation invisible.** Nothing in the URL says which entity
  you are looking at, so nothing in a screenshot, a support ticket or a log
  line says it either.

---

## 2. The model: persona-prefixed routes

```
/founder/...     founder workspace surfaces
/vc/...          VC workspace surfaces
/lp/...          LP workspace surfaces   (prefix already exists)
/dashboard/...   persona-neutral: settings, billing, workspace switcher
```

`/lp/` is already this shape, which is the precedent.

### Route map

| Persona | Route | Replaces |
| --- | --- | --- |
| founder | `/founder/crm` | `/dashboard/crm` |
| founder | `/founder/outreach` | `/dashboard/outreach` |
| founder | `/founder/linkedin/*` | `/dashboard/linkedin/*` |
| founder | `/founder/assistant` | `/dashboard/assistant` |
| founder | `/founder/fundraising/*`, `/founder/cap-table`, … | `/dashboard/*` |
| vc | `/vc/crm` | `/dashboard/crm` |
| vc | `/vc/outreach`, `/vc/outreach/lp-campaign` | `/dashboard/outreach/*` |
| vc | `/vc/linkedin/*` | `/dashboard/linkedin/*` |
| vc | `/vc/assistant` | `/dashboard/assistant` |
| vc | `/vc/portfolio/*`, `/vc/fund/*`, … | `/dashboard/*` |
| lp | `/lp/crm`, `/lp/outreach`, `/lp/linkedin/*`, `/lp/assistant` | new (doc 03) |

Shared *infrastructure* pages stay on `/dashboard`: settings, billing, the
workspace switcher, account. These are properties of the user, not of a
persona, and duplicating them three times would be the same mistake in the
other direction.

### Implementation: one layout per persona

```
app/(personas)/founder/layout.tsx    → requirePersona("founder")
app/(personas)/vc/layout.tsx         → requirePersona("vc")
app/(personas)/lp/layout.tsx         → requirePersona("lp")
```

`requirePersona()` resolves the active workspace, and:

- **persona matches** → render;
- **user has a workspace of the requested persona but it is not active** →
  switch the active workspace to it and render. This is the one automatic
  action worth taking, because the user's intent is unambiguous: they asked for
  a founder page and they have a founder workspace;
- **user has no workspace of that persona** → **404**, not a redirect.

### Why 404 and not a redirect

The requirement is no rerouting to another persona's pages, and a redirect is
exactly that. A VC who follows a stale link to `/founder/crm` should be told
the page does not exist for them, not silently deposited in `/vc/crm` — which
would leave them looking at a different entity than the one they asked for,
with the URL quietly rewritten.

404 with a short body ("this page belongs to a founder workspace; you are in
<name>, a VC workspace") and a link to the workspace switcher. The switcher is
a deliberate act by the user, which a redirect is not.

---

## 3. Migration without breaking links

Old `/dashboard/*` URLs exist in bookmarks, emails and — importantly — in
outreach messages already sent. They cannot simply 404.

**A single compatibility layer, with a deadline.**

`middleware.ts` maps a legacy path to the persona-prefixed one **using the
active workspace's persona**, and 308s:

```
/dashboard/crm  +  active workspace is a fund  →  308  /vc/crm
```

This is a redirect *to the user's own persona*, which is not cross-persona
routing — it is resolving an ambiguous legacy URL into the unambiguous one. It
is allowed precisely because it can never land someone on another persona's
entity.

The table lives in one place, is generated from the route map above, and
carries a removal date in a comment. The nav stops emitting legacy paths on day
one, so the layer only serves external links and decays naturally.

### Order of operations

1. Add persona layouts and the new route tree; pages are moved, not copied —
   a copy is two files to fix the next time.
2. Point `lib/nav/work-areas.ts` at the new paths.
3. Add the middleware compatibility layer.
4. Update every internal `href`/`redirect()` — a grep for `"/dashboard/` with
   the route map as the checklist.
5. Update outreach templates and any stored deep links that reference
   `/dashboard/*`.

Step 5 is the one that is easy to forget and hard to notice: a template sent
last month contains a URL that must keep working, which is what the
compatibility layer is for.

---

## 4. Testing

The in-page persona gates are already tested in places; this adds:

- **Every route in the map resolves for its own persona** — a table-driven test
  over `WORK_AREAS`, so a route added to the nav without a page fails.
- **Every route 404s for the other two personas.** The important half.
- **No `/dashboard/*` link survives in the nav** after step 2.
- **The compatibility layer never crosses personas** — a legacy path resolved
  by a VC session produces a `/vc/*` target and never a `/founder/*` one.

## 5. Risks

- **The largest diff of the four implementations.** ~25 pages move. Nothing is
  conceptually hard; the risk is a missed internal link, which the grep in step
  4 and the nav test in step 4 are there to catch.
- **Two personas, one user, one browser.** Tabs open on `/founder/crm` and
  `/vc/crm` share a session and therefore an active workspace. The second tab
  to act will find the workspace switched under it. The assistant already
  handles this with a scope-key check and a 409; the same check belongs on any
  page that writes.
- **SEO and external links** are not a concern for authenticated surfaces, but
  the compatibility layer still matters for links inside sent email.

## 6. Out of scope

- Persona-specific *theming*. Separate routes make it possible; whether a VC
  workspace should look different is a product decision.
- Merging the two assistant routes (`/dashboard/assistant`,
  `/dashboard/anker-ai`) into one per persona. They are two different products
  today (tool loop vs model-picker chat); doc 03 scopes them, and consolidating
  them is the assistant architecture's business, not routing's.
