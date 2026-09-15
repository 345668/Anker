# Anker platform workspace redesign

The authenticated product now uses the same deep-blue editorial system as the public site while keeping the platform practical for daily venture work. The redesign applies to both navigation modes and the LP portal.

## Direction

- Deep blue is the primary workspace surface in dark mode; light mode uses a cool, low-contrast canvas with white working panels.
- Georgia headings create a clear editorial hierarchy. Body copy, numbers, metadata, and controls stay in the existing sans and mono system.
- Panels use borders and spacing instead of decorative shadows. Links, active routes, focus rings, and status colors are tokenized in `app/platform.css`.
- No new investor or fund imagery is introduced into working screens. Dense records remain scannable and data stays the visual focus.

## Shared shell

`NavModeShell` keeps the existing sidebar and top-nav modes, auth checks, persona filtering, and admin gating. Both modes now share:

- A skip link and `workspace-content` landmark.
- Minimum 44px touch targets and visible focus rings.
- A responsive mobile sheet with grouped persona navigation, account links, tasks, notifications, and downloads.
- A Radix dialog command palette with search semantics, keyboard selection, and focus restoration.
- Tokenized light/dark colors that also apply to Radix portals.

Fund and LP section navigation uses the same route-current treatment. The fund overflow menu is a portal-backed menu so it is not clipped by horizontal scrolling.

## Working surfaces

The dashboard home leads with four loaded-record metrics, a short scope note, persona-aware quick actions, needs-attention items, tasks, and recent deals. It explicitly distinguishes zero values from missing amounts and labels dates that cannot be parsed.

CRM, discovery, and outreach headers now wrap at narrow widths, use clearer purpose copy, expose view/filter state to assistive technology, and retain all existing data operations. Data tables expose real sort state, searchable empty states, column controls, and mobile-friendly controls. Tool and admin shells inherit the same panel and header treatment.

## Data scope

The dashboard loads a bounded set of records (500 firms, 100 deals, 100 contacts, 100 investors). Its scope note describes those limits so the UI does not imply a complete database total. The previous hard-coded fund spotlight query was removed; the remaining spotlight is scoped to the signed-in user's overdue tasks.

## Validation

- `pnpm typecheck`
- `pnpm exec vitest run lib/platform lib/marketing lib/newsroom`
- Production build through `build-site.mjs` using the repository's existing local font fixture because external Google Fonts are unavailable in the build sandbox.

The build and 32 interaction/regression tests pass. The existing Next.js app does not expose a supervised local preview through the Sites Vite runner, so visual verification is based on the shared responsive styles and component tests.
