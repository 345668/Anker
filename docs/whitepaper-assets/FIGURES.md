# White-paper figures — capture guide

Save each screenshot to this folder under the exact filename below; the paper
(`docs/anker-whitepaper.md`) already references these paths. Capture at ~1440px
width. Light or dark mode per note; keep the cookie banner dismissed.

| # | Filename | Where to capture | Mode |
|---|---|---|---|
| 1 | `fig01-home-light.png` | `/` (marketing home, hero) | light |
| 2 | `fig02-products-megamenu.png` | `/` — hover the **Products** nav item to open the mega-menu | dark |
| 3 | `fig03-investor-database.png` | `/investor-database` (top: headline + stat row) | light |
| 4 | `fig04-app-shell.png` | `/dashboard?nav=top` signed in as a VC/owner (top bar + left rail) | dark |
| 5 | `fig05-409a-detail.png` | a `/dashboard/valuations-409a/<id>` grant detail (FMV + breakpoint table) | dark |
| 6 | `fig06-loan-detail.png` | a `/dashboard/loan-operations/<id>` loan detail (tiles + schedule + ledger) | dark |
| 7 | `fig07-share-plans-detail.png` | a `/dashboard/share-plans/<id>` grant detail (vesting schedule) | dark |
| 8 | `fig08-fund-os.png` | `/dashboard/portfolio/fund` (fund profile + workspace grid) | dark |
| 9 | `fig09-assistant.png` | `/dashboard/assistant` (Fund Copilot empty state) | dark |
| 10 | `fig10-lp-portal.png` | `/lp` (Investor Room capital account) | light |

Notes
- Figures 4–10 are behind auth and need a signed-in session (and a live DB), so
  they can't be captured from an anonymous browser. Capture them from your
  logged-in session.
- To open the redesigned top-nav shell for Figure 4, append `?nav=top` to any
  dashboard URL.
- Replace the `*[FIGURE n — asset: …]*` placeholder blocks in the paper with a
  standard Markdown image once the PNG is in place, e.g.
  `![Figure 1 — Anker home](whitepaper-assets/fig01-home-light.png)`.
