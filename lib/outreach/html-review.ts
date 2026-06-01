/**
 * SVS Fund II — Interactive HTML Review UI Generator
 *
 * Generates a fully self-contained single-file HTML page that renders
 * all enriched LP profiles as expandable cards.
 *
 * Features:
 *   - Avatar initials (coloured by LP type)
 *   - Type badge + Fit Score badge (colour-coded)
 *   - Location chip
 *   - Expandable panels: Firm Intel | Mandate | Hook | Email Preview
 *   - Copy-to-clipboard button on email + subject
 *   - Filter pills by LP type (+ All)
 *   - Sort by fit score / name / batch
 *   - Multi-touch warning banner on affected cards
 *   - Campaign stats bar at top
 *   - Zero external dependencies — all CSS + JS inline
 */

import type { EnrichedProfile, CampaignResult } from "./svs-campaign"
import { LP_TONE } from "./svs-campaign"

// ─── Type colour map ─────────────────────────────────────────────────────────

const TYPE_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  angel:          { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  "family-office":{ bg: "#F0FDF4", text: "#166534", border: "#BBF7D0" },
  institutional:  { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  sovereign:      { bg: "#FAF5FF", text: "#7E22CE", border: "#E9D5FF" },
  "fund-of-funds":{ bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  endowment:      { bg: "#F0FDFA", text: "#065F46", border: "#99F6E4" },
  "corporate-vc": { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3" },
}

function scoreColour(score: number): string {
  if (score >= 85) return "#166534" // dark green
  if (score >= 70) return "#1D4ED8" // blue
  if (score >= 50) return "#92400E" // amber
  return "#9F1239"                  // red
}

function scoreBg(score: number): string {
  if (score >= 85) return "#DCFCE7"
  if (score >= 70) return "#DBEAFE"
  if (score >= 50) return "#FEF3C7"
  return "#FFE4E6"
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

function avatarBg(lpType: string): string {
  const map: Record<string, string> = {
    angel: "#C2410C",
    "family-office": "#166534",
    institutional: "#1D4ED8",
    sovereign: "#7E22CE",
    "fund-of-funds": "#92400E",
    endowment: "#065F46",
    "corporate-vc": "#BE123C",
  }
  return map[lpType] ?? "#1B3A6B"
}

// ─── Escape HTML ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
}

function escAttr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$")
}

// ─── Card HTML ───────────────────────────────────────────────────────────────

function renderCard(p: EnrichedProfile, idx: number): string {
  const typeInfo = TYPE_COLOURS[p.lpType] ?? TYPE_COLOURS["institutional"]!
  const typeLabel = LP_TONE[p.lpType]?.label ?? p.lpType
  const av = initials(p.name)
  const avBg = avatarBg(p.lpType)
  const sc = p.fitScore
  const scColor = scoreColour(sc)
  const scBg = scoreBg(sc)
  const hasMultiTouch = Boolean(p.multiTouchNote)
  const cardId = `card-${p.id}`

  return `
  <div class="card" id="${cardId}"
       data-lptype="${esc(p.lpType)}"
       data-score="${sc}"
       data-name="${esc(p.name)}"
       data-batch="${p.batch}">

    ${hasMultiTouch ? `<div class="multi-touch-banner">⚡ Multi-touch — ${esc(p.multiTouchNote.slice(0, 100))}${p.multiTouchNote.length > 100 ? "…" : ""}</div>` : ""}

    <div class="card-header" onclick="toggleCard('${cardId}')">
      <div class="avatar" style="background:${avBg}">${esc(av)}</div>
      <div class="card-meta">
        <div class="card-name">${esc(p.name)}</div>
        <div class="card-sub">${esc(p.role)} · ${esc(p.firm)}</div>
        <div class="card-chips">
          <span class="badge-type" style="background:${typeInfo.bg};color:${typeInfo.text};border-color:${typeInfo.border}">${esc(typeLabel)}</span>
          <span class="badge-score" style="background:${scBg};color:${scColor}">Score ${sc}</span>
          ${p.location ? `<span class="chip-loc">📍 ${esc(p.location)}</span>` : ""}
          <span class="chip-batch">Batch ${p.batch}</span>
        </div>
      </div>
      <div class="card-toggle" id="toggle-${cardId}">▼</div>
    </div>

    <div class="card-body" id="body-${cardId}" style="display:none">

      <div class="panels">

        <div class="panel">
          <div class="panel-title">🏢 Firm Intelligence</div>
          <div class="panel-text">${esc(p.firmIntelligence)}</div>
        </div>

        <div class="panel">
          <div class="panel-title">🎯 Investment Mandate</div>
          <div class="panel-text">${esc(p.investmentMandate)}</div>
        </div>

        <div class="panel panel-hook">
          <div class="panel-title">⚡ Personalisation Hook</div>
          <div class="panel-text">${esc(p.personalisationHook)}</div>
        </div>

      </div>

      <div class="email-preview">
        <div class="email-header-row">
          <span class="panel-title">✉️ Outreach Email</span>
          <div class="email-actions">
            <button class="btn-copy" onclick="copyText('subject-${p.id}', this)">Copy Subject</button>
            <button class="btn-copy btn-primary" onclick="copyText('body-${p.id}', this)">Copy Email</button>
          </div>
        </div>
        <div class="email-subject">
          <span class="subject-label">Subject:</span>
          <span id="subject-${p.id}">${esc(p.emailDraft.subject)}</span>
        </div>
        <div class="email-body" id="body-${p.id}">${esc(p.emailDraft.body)}</div>
        <div class="email-meta">To: <strong>${esc(p.email)}</strong></div>
      </div>

    </div>
  </div>`
}

// ─── Stats bar ───────────────────────────────────────────────────────────────

function renderStatsBar(result: CampaignResult): string {
  const { stats } = result
  const typeBreakdown = Object.entries(stats.byLPType)
    .map(([type, count]) => {
      const label = LP_TONE[type as keyof typeof LP_TONE]?.label ?? type
      const col = TYPE_COLOURS[type]
      const style = col
        ? `background:${col.bg};color:${col.text};border-color:${col.border}`
        : ""
      return `<span class="stat-pill" style="${style}">${esc(label)} <strong>${count}</strong></span>`
    })
    .join("")

  return `
  <div class="stats-bar">
    <div class="stats-title">SVS Fund II — LP Campaign</div>
    <div class="stats-row">
      <div class="stat"><span class="stat-num">${stats.total}</span><span class="stat-lbl">Total LPs</span></div>
      <div class="stat"><span class="stat-num">${stats.batches}</span><span class="stat-lbl">Batches</span></div>
      <div class="stat"><span class="stat-num">${stats.multiTouchPairs}</span><span class="stat-lbl">Multi-Touch</span></div>
      <div class="stat"><span class="stat-num">${stats.avgFitScore}</span><span class="stat-lbl">Avg Score</span></div>
    </div>
    <div class="type-breakdown">${typeBreakdown}</div>
  </div>`
}

// ─── Filter + sort bar ───────────────────────────────────────────────────────

function renderControls(profiles: EnrichedProfile[]): string {
  const types = [...new Set(profiles.map((p) => p.lpType))]
  const pills = types
    .map((t) => {
      const label = LP_TONE[t]?.label ?? t
      const col = TYPE_COLOURS[t]
      const style = col
        ? `background:${col.bg};color:${col.text};border-color:${col.border}`
        : ""
      return `<button class="filter-pill" data-filter="${esc(t)}" onclick="setFilter('${esc(t)}')" style="${style}">${esc(label)}</button>`
    })
    .join("")

  return `
  <div class="controls">
    <div class="filter-row">
      <button class="filter-pill active" data-filter="all" onclick="setFilter('all')">All <span class="count-badge">${profiles.length}</span></button>
      ${pills}
    </div>
    <div class="sort-row">
      <label>Sort by:</label>
      <select id="sortSelect" onchange="applySort()">
        <option value="score-desc">Fit Score ↓</option>
        <option value="score-asc">Fit Score ↑</option>
        <option value="name-asc">Name A→Z</option>
        <option value="batch-asc">Batch</option>
      </select>
      <input id="searchBox" type="text" placeholder="Search name, firm, sector…" oninput="applySearch()" />
    </div>
  </div>`
}

// ─── Full HTML page ──────────────────────────────────────────────────────────

export function buildHtmlReview(result: CampaignResult): string {
  const { enriched } = result
  const generatedDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  })

  const cardsHtml = enriched.map((p, i) => renderCard(p, i)).join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SVS Fund II — LP Outreach Review</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #F1F5F9;
    color: #1E293B;
    min-height: 100vh;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .page-header {
    background: linear-gradient(135deg, #1B3A6B 0%, #2E6DB4 100%);
    color: #fff;
    padding: 24px 32px 16px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 12px rgba(0,0,0,0.18);
  }
  .page-header h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .page-header .sub { font-size: 13px; opacity: 0.7; margin-top: 2px; }

  /* ── Stats bar ───────────────────────────────────────────── */
  .stats-bar {
    background: #fff;
    border-bottom: 1px solid #E2E8F0;
    padding: 16px 32px;
  }
  .stats-title { font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; }
  .stats-row { display: flex; gap: 32px; margin-bottom: 12px; }
  .stat { display: flex; flex-direction: column; }
  .stat-num { font-size: 22px; font-weight: 700; color: #1B3A6B; line-height: 1; }
  .stat-lbl { font-size: 11px; color: #94A3B8; margin-top: 2px; }
  .type-breakdown { display: flex; flex-wrap: wrap; gap: 6px; }
  .stat-pill {
    font-size: 12px; padding: 3px 10px; border-radius: 999px;
    border: 1px solid currentColor; font-weight: 500;
  }

  /* ── Controls ────────────────────────────────────────────── */
  .controls {
    background: #fff;
    border-bottom: 1px solid #E2E8F0;
    padding: 12px 32px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: sticky;
    top: 73px;
    z-index: 99;
  }
  .filter-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .filter-pill {
    font-size: 12px; padding: 4px 12px; border-radius: 999px;
    border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569;
    cursor: pointer; font-weight: 500; transition: all 0.15s;
  }
  .filter-pill.active {
    background: #1B3A6B; color: #fff; border-color: #1B3A6B;
  }
  .filter-pill:hover { opacity: 0.85; }
  .count-badge {
    display: inline-block; background: rgba(255,255,255,0.2);
    border-radius: 999px; padding: 0 5px; font-size: 11px; margin-left: 2px;
  }
  .sort-row { display: flex; align-items: center; gap: 10px; }
  .sort-row label { font-size: 12px; color: #64748B; }
  .sort-row select {
    font-size: 12px; padding: 4px 8px; border: 1px solid #CBD5E1;
    border-radius: 6px; background: #F8FAFC; color: #1E293B;
  }
  #searchBox {
    font-size: 12px; padding: 4px 10px; border: 1px solid #CBD5E1;
    border-radius: 6px; width: 220px; background: #F8FAFC;
  }

  /* ── Cards container ─────────────────────────────────────── */
  .cards { padding: 20px 32px; display: flex; flex-direction: column; gap: 12px; max-width: 960px; margin: 0 auto; }

  /* ── Card ────────────────────────────────────────────────── */
  .card {
    background: #fff;
    border-radius: 12px;
    border: 1px solid #E2E8F0;
    overflow: hidden;
    transition: box-shadow 0.2s;
  }
  .card:hover { box-shadow: 0 4px 16px rgba(27,58,107,0.1); }
  .card[data-hidden="true"] { display: none; }

  .multi-touch-banner {
    background: #FFF7ED;
    border-bottom: 1px solid #FED7AA;
    padding: 6px 16px;
    font-size: 11px;
    color: #C2410C;
    font-weight: 500;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px;
    cursor: pointer;
    user-select: none;
  }
  .card-header:hover { background: #F8FAFC; }

  .avatar {
    width: 44px; height: 44px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 15px; flex-shrink: 0;
  }

  .card-meta { flex: 1; }
  .card-name { font-size: 15px; font-weight: 600; color: #1E293B; }
  .card-sub { font-size: 12px; color: #64748B; margin-top: 2px; }
  .card-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }

  .badge-type, .badge-score {
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    border: 1px solid; font-weight: 600;
  }
  .chip-loc, .chip-batch {
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    background: #F1F5F9; color: #64748B; border: 1px solid #E2E8F0;
  }

  .card-toggle { font-size: 12px; color: #94A3B8; flex-shrink: 0; margin-top: 12px; transition: transform 0.2s; }
  .card-toggle.open { transform: rotate(180deg); }

  /* ── Card body ───────────────────────────────────────────── */
  .card-body { padding: 0 16px 16px; border-top: 1px solid #F1F5F9; }

  .panels { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 16px; }
  @media (max-width: 700px) { .panels { grid-template-columns: 1fr; } }

  .panel {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 12px;
  }
  .panel-hook { background: #FFFBEB; border-color: #FDE68A; }
  .panel-title { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
  .panel-text { font-size: 13px; color: #334155; line-height: 1.55; }

  /* ── Email preview ───────────────────────────────────────── */
  .email-preview {
    margin-top: 14px;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    overflow: hidden;
  }
  .email-header-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: #EFF6FF;
    border-bottom: 1px solid #BFDBFE;
  }
  .email-actions { display: flex; gap: 6px; }
  .btn-copy {
    font-size: 11px; padding: 4px 10px; border-radius: 6px;
    border: 1px solid #CBD5E1; background: #fff; color: #1E293B;
    cursor: pointer; font-weight: 500; transition: all 0.15s;
  }
  .btn-copy:hover { background: #F1F5F9; }
  .btn-primary { background: #1B3A6B !important; color: #fff !important; border-color: #1B3A6B !important; }
  .btn-primary:hover { opacity: 0.88; }
  .btn-copy.copied { background: #DCFCE7 !important; color: #166534 !important; border-color: #BBF7D0 !important; }

  .email-subject {
    padding: 8px 14px;
    background: #FAFAFA;
    border-bottom: 1px solid #E2E8F0;
    font-size: 13px;
  }
  .subject-label { color: #94A3B8; margin-right: 6px; }

  .email-body {
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.6;
    color: #1E293B;
    white-space: pre-wrap;
    max-height: 260px;
    overflow-y: auto;
    font-family: "Helvetica Neue", sans-serif;
  }

  .email-meta {
    padding: 6px 14px;
    font-size: 11px;
    color: #94A3B8;
    border-top: 1px solid #E2E8F0;
    background: #FAFAFA;
  }

  /* ── Empty state ─────────────────────────────────────────── */
  #emptyState {
    display: none;
    text-align: center;
    padding: 60px 20px;
    color: #94A3B8;
    font-size: 15px;
  }

  /* ── Footer ──────────────────────────────────────────────── */
  .footer {
    text-align: center;
    padding: 24px;
    font-size: 11px;
    color: #CBD5E1;
  }
</style>
</head>
<body>

<div class="page-header">
  <h1>SVS Fund II — LP Outreach Review</h1>
  <div class="sub">Generated ${generatedDate} · ${enriched.length} profiles · ${result.stats.batches} enrichment batch${result.stats.batches !== 1 ? "es" : ""}</div>
</div>

${renderStatsBar(result)}
${renderControls(enriched)}

<div class="cards" id="cardContainer">
${cardsHtml}
  <div id="emptyState">No profiles match your filters.</div>
</div>

<div class="footer">SVS Fund II Outreach Campaign · Confidential · invest@svsfund.vc</div>

<script>
  // ── State ────────────────────────────────────────────────────
  var currentFilter = 'all';
  var currentSort = 'score-desc';
  var currentSearch = '';

  // ── Toggle card open/close ───────────────────────────────────
  function toggleCard(cardId) {
    var body = document.getElementById('body-' + cardId);
    var toggle = document.getElementById('toggle-' + cardId);
    if (!body) return;
    var isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (toggle) toggle.classList.toggle('open', !isOpen);
  }

  // ── Copy to clipboard ────────────────────────────────────────
  function copyText(elemId, btn) {
    var el = document.getElementById(elemId);
    if (!el) return;
    var text = el.innerText || el.textContent || '';
    navigator.clipboard.writeText(text).then(function() {
      var orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(function() {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }, 1800);
    });
  }

  // ── Filter ───────────────────────────────────────────────────
  function setFilter(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.classList.toggle('active', pill.dataset.filter === type);
    });
    applyVisibility();
  }

  // ── Sort ─────────────────────────────────────────────────────
  function applySort() {
    currentSort = document.getElementById('sortSelect').value;
    var container = document.getElementById('cardContainer');
    var cards = Array.from(container.querySelectorAll('.card'));
    cards.sort(function(a, b) {
      switch (currentSort) {
        case 'score-desc': return Number(b.dataset.score) - Number(a.dataset.score);
        case 'score-asc':  return Number(a.dataset.score) - Number(b.dataset.score);
        case 'name-asc':   return (a.dataset.name || '').localeCompare(b.dataset.name || '');
        case 'batch-asc':  return Number(a.dataset.batch) - Number(b.dataset.batch);
        default: return 0;
      }
    });
    cards.forEach(function(c) { container.appendChild(c); });
    applyVisibility();
  }

  // ── Search ───────────────────────────────────────────────────
  function applySearch() {
    currentSearch = document.getElementById('searchBox').value.toLowerCase();
    applyVisibility();
  }

  // ── Combined visibility logic ────────────────────────────────
  function applyVisibility() {
    var cards = document.querySelectorAll('.card');
    var visible = 0;
    cards.forEach(function(card) {
      var typeMatch = currentFilter === 'all' || card.dataset.lptype === currentFilter;
      var searchMatch = true;
      if (currentSearch) {
        var text = card.textContent.toLowerCase();
        searchMatch = text.includes(currentSearch);
      }
      var show = typeMatch && searchMatch;
      card.dataset.hidden = show ? 'false' : 'true';
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    var empty = document.getElementById('emptyState');
    if (empty) empty.style.display = visible === 0 ? 'block' : 'none';

    // Update count badge on "All" pill
    var allPill = document.querySelector('.filter-pill[data-filter="all"]');
    if (allPill) {
      var badge = allPill.querySelector('.count-badge');
      if (badge) badge.textContent = visible;
    }
  }
</script>
</body>
</html>`
}
