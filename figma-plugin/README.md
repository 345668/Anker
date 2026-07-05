# Anker Decks — Figma plugin

Fills Anker fund/portfolio data into any Figma slide deck the user has
duplicated from the Anker template catalog.

## Install (unpacked)

1. Clone this folder somewhere Chrome/Figma can find it.
2. In Figma desktop → Menu → Plugins → Development → Import plugin from
   manifest → pick this folder's `manifest.json`.

## Use

1. Open a deck file duplicated from the Anker catalog.
2. Menu → Plugins → Anker Decks.
3. Setup tab: paste your Anker base URL + bearer token (mint one at
   `/dashboard/settings/extension-tokens`), save.
4. Scan tab: hit "Scan text nodes" — the plugin sends every text node
   to Anker so Qwen can propose a mapping. (For the first use of a
   template only.)
5. Fill tab: paste your deck id from `/dashboard/decks/<id>`, hit
   "Fill from Anker" — every mapped node gets its value.

## Architecture

- `code.js` runs in the Figma sandbox; handles clientStorage, scanning,
  and applying text via `node.characters`.
- `ui.html` runs in the iframe; talks to `code.js` via `postMessage` and
  to Anker via `fetch()`.
- Bearer token is stored in `figma.clientStorage`, never exposed to the
  UI iframe beyond the outbound request.

## Limits (v0.1)

- Multi-run styled text: first-run font only. If a title has mixed
  fonts, we load the first and reset the whole string in that font.
- Image nodes: not filled yet — coming in v0.2.
- Table row duplication: not automatic — coming in v0.2.
