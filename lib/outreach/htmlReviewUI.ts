/**
 * Summit Venture Studio Fund II — HTML Review UI Generator
 *
 * Generates a fully self-contained single-file HTML page from a PipelineResult.
 *
 * Features:
 *   - Avatar initials, coloured by LP type
 *   - Type badge + Score badge (colour-coded: green ≥70, blue ≥55, amber ≥40, red <40)
 *   - Tier badge (T1 / T2 / T3)
 *   - Location + Channel chips
 *   - Multi-touch warning banner
 *   - Expandable panels: Firm Intel | Mandate | Hook
 *   - Email preview tab + LinkedIn DM tab with copy-to-clipboard
 *   - Filter pills by LP type (count badge updates on filter)
 *   - Search box (name / firm / sector / location)
 *   - Sort by score ↓ / score ↑ / name A→Z / tier / batch
 *   - Campaign stats bar at top
 *   - Zero external dependencies — all CSS + JS inline
 */

import type { PipelineResult, EnrichedProfile, DraftedEmail } from "./types"

// ─── Colour maps ─────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { bg: string; text: string; border: string; avatarBg: string }> = {
  "Angel Investor":       { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", avatarBg: "#C2410C" },
  "Angel Investor / HNW": { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", avatarBg: "#9A3412" },
  "Angel":                { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", avatarBg: "#EA580C" },
  "Family Office":        { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0", avatarBg: "#16A34A" },
  "Endowment":            { bg: "#F0FDFA", text: "#065F46", border: "#99F6E4", avatarBg: "#0D9488" },
  "Institutional":        { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", avatarBg: "#2563EB" },
  "Fund of Funds":        { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A", avatarBg: "#D97706" },
  "Sovereign Wealth Fund":{ bg: "#FAF5FF", text: "#7E22CE", border: "#E9D5FF", avatarBg: "#9333EA" },
  "Corporate VC":         { bg: "#FFF1F2", text: "#BE123C", border: "#FECDD3", avatarBg: "#E11D48" },
  "Pension":              { bg: "#F8FAFC", text: "#334155", border: "#CBD5E1", avatarBg: "#475569" },
}

const DEFAULT_STYLE = { bg: "#F1F5F9", text: "#1E293B", border: "#CBD5E1", avatarBg: "#1B3A5C" }

function typeStyle(lpType: string) {
  return TYPE_STYLE[lpType] ?? DEFAULT_STYLE
}

function scoreBadge(score: number): { bg: string; text: string } {
  if (score >= 70) return { bg: "#DCFCE7", text: "#166534" }
  if (score >= 55) return { bg: "#DBEAFE", text: "#1D4ED8" }
  if (score >= 40) return { bg: "#FEF3C7", text: "#92400E" }
  return { bg: "#FFE4E6", text: "#9F1239" }
}

function tierLabel(tier: number): string {
  return tier === 1 ? "T1" : tier === 2 ? "T2" : "T3"
}

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
}

// ─── Card renderer ────────────────────────────────────────────────────────────

function renderCard(p: EnrichedProfile, draft: DraftedEmail | undefined): string {
  const ts = typeStyle(p.lpType)
  const sb = scoreBadge(p.score)
  const av = initials(p.name)
  const id = `c${p.id}`

  const emailBody = draft?.body ?? ""
  const emailSubject = draft?.subject ?? ""
  const dm = draft?.linkedInDM ?? ""
  const channel = draft?.primaryChannel ?? "email"

  return `
<div class="card" id="${id}"
     data-lptype="${esc(p.lpType)}"
     data-score="${p.score}"
     data-tier="${p.tier}"
     data-batch="${p.batch}"
     data-search="${esc([p.name, p.titleRole, p.sectors, p.location, p.lpType].join(" ")).toLowerCase()}">

  ${p.isMultiTouch ? `<div class="mt-banner">⚡ Multi-touch — prior contact at this firm: <strong>${esc(p.multiTouchPriorContact)}</strong></div>` : ""}

  <div class="card-hdr" onclick="toggleCard('${id}')">
    <div class="avatar" style="background:${ts.avatarBg}">${esc(av)}</div>
    <div class="card-info">
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-role">${esc(p.titleRole)}</div>
      <div class="chips">
        <span class="chip-type" style="background:${ts.bg};color:${ts.text};border-color:${ts.border}">${esc(p.lpType)}</span>
        <span class="chip-score" style="background:${sb.bg};color:${sb.text}">Score ${p.score}</span>
        <span class="chip-tier" data-tier="${p.tier}">${tierLabel(p.tier)}</span>
        ${p.location ? `<span class="chip">📍 ${esc(p.location)}</span>` : ""}
        <span class="chip chip-ch">${channel === "linkedin" ? "🔗 LinkedIn-first" : channel === "dual" ? "⚡ Dual" : "✉️ Email"}</span>
        <span class="chip">Batch ${p.batch}</span>
      </div>
    </div>
    <div class="toggle-btn" id="tog-${id}">▼</div>
  </div>

  <div class="card-body" id="body-${id}" style="display:none">
    <div class="panels">
      <div class="panel">
        <div class="panel-ttl">🏢 Firm Intelligence</div>
        <div class="panel-txt">${esc(p.firmIntelligence)}</div>
      </div>
      <div class="panel">
        <div class="panel-ttl">🎯 Investment Mandate</div>
        <div class="panel-txt">${esc(p.investmentMandate)}</div>
      </div>
      <div class="panel panel-hook">
        <div class="panel-ttl">⚡ Personalisation Hook</div>
        <div class="panel-txt">${esc(p.personalisationHook)}</div>
      </div>
    </div>

    <div class="msg-block">
      <div class="tab-bar">
        <button class="tab active" onclick="switchTab('${id}','email',this)">✉️ Email</button>
        ${dm ? `<button class="tab" onclick="switchTab('${id}','dm',this)">🔗 LinkedIn DM</button>` : ""}
        <div style="flex:1"></div>
        <button class="btn-copy" onclick="copyElem('subj-${id}',this)">Copy Subject</button>
        <button class="btn-copy btn-primary" id="copy-main-${id}" onclick="copyActive('${id}',this)">Copy</button>
      </div>

      <div id="tab-email-${id}">
        <div class="subj-row">
          <span class="subj-lbl">Subject:</span>
          <span id="subj-${id}">${esc(emailSubject)}</span>
        </div>
        <div class="msg-body" id="email-${id}">${esc(emailBody)}</div>
        <div class="msg-meta">To: <strong>${esc(p.email)}</strong></div>
      </div>

      ${dm ? `<div id="tab-dm-${id}" style="display:none">
        <div class="dm-box" id="dm-${id}">${esc(dm)}</div>
        <div class="msg-meta">
          ${dm.length} / ${dm.length <= 300 ? "300" : "300+"} chars
          ${p.linkedin ? `· <a href="${esc(p.linkedin)}" target="_blank" rel="noopener">Open LinkedIn ↗</a>` : ""}
        </div>
      </div>` : ""}
    </div>
  </div>
</div>`
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function renderStats(result: PipelineResult): string {
  const { stats } = result
  const pills = Object.entries(stats.byLPType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => {
      const ts = typeStyle(t)
      return `<span class="stat-pill" style="background:${ts.bg};color:${ts.text};border-color:${ts.border}">${esc(t)} <strong>${c}</strong></span>`
    }).join("")

  return `<div class="stats-bar">
  <div class="stats-hd">Summit Venture Studio Fund II — LP Outreach Review</div>
  <div class="stats-row">
    <div class="stat"><span class="stat-n">${stats.total}</span><span class="stat-l">Total LPs</span></div>
    <div class="stat"><span class="stat-n">${stats.batches}</span><span class="stat-l">Batches</span></div>
    <div class="stat"><span class="stat-n">${stats.multiTouchCount}</span><span class="stat-l">Multi-Touch</span></div>
    <div class="stat"><span class="stat-n">${stats.avgScore}</span><span class="stat-l">Avg Score</span></div>
    <div class="stat"><span class="stat-n">${stats.tier1Count}</span><span class="stat-l">Tier 1</span></div>
  </div>
  <div class="pills-row">${pills}</div>
</div>`
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function renderControls(result: PipelineResult): string {
  const types = [...new Set(result.enriched.map((p) => p.lpType))]
  const filterPills = types.map((t) => {
    const ts = typeStyle(t)
    return `<button class="fpill" data-f="${esc(t)}" onclick="setFilter('${esc(t)}')" style="background:${ts.bg};color:${ts.text};border-color:${ts.border}">${esc(t)}</button>`
  }).join("")

  return `<div class="controls">
  <div class="filter-row">
    <button class="fpill active" data-f="all" onclick="setFilter('all')">All <span class="cbadge" id="allCount">${result.enriched.length}</span></button>
    ${filterPills}
  </div>
  <div class="sort-row">
    <label>Sort:</label>
    <select id="sortSel" onchange="applySort()">
      <option value="score-d">Score ↓</option>
      <option value="score-a">Score ↑</option>
      <option value="name-a">Name A→Z</option>
      <option value="tier-a">Tier</option>
      <option value="batch-a">Batch</option>
    </select>
    <input id="srch" type="search" placeholder="Search name, firm, sector…" oninput="applySearch()" />
    <label style="margin-left:10px;font-size:11px">
      <input type="checkbox" id="mt-only" onchange="applySearch()"> Multi-touch only
    </label>
  </div>
</div>`
}

// ─── Full page ────────────────────────────────────────────────────────────────

export function buildHtmlReviewUI(result: PipelineResult): string {
  const draftMap = new Map(result.drafts.map((d) => [d.investorId, d]))
  const cards = result.enriched.map((p) => renderCard(p, draftMap.get(p.id))).join("\n")
  const date = new Date(result.generatedAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SVS Fund II — LP Review</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#F1F5F9;color:#1E293B;min-height:100vh}

/* Header */
.page-hdr{background:linear-gradient(135deg,#1A3A5C 0%,#185FA5 100%);color:#fff;padding:20px 32px 14px;position:sticky;top:0;z-index:200;box-shadow:0 2px 12px rgba(0,0,0,.2)}
.page-hdr h1{font-size:18px;font-weight:700;letter-spacing:-.3px}
.page-hdr .sub{font-size:12px;opacity:.72;margin-top:3px}

/* Stats */
.stats-bar{background:#fff;border-bottom:1px solid #E2E8F0;padding:14px 32px}
.stats-hd{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
.stats-row{display:flex;gap:28px;margin-bottom:10px}
.stat{display:flex;flex-direction:column}
.stat-n{font-size:22px;font-weight:700;color:#1A3A5C;line-height:1}
.stat-l{font-size:11px;color:#94A3B8;margin-top:2px}
.pills-row{display:flex;flex-wrap:wrap;gap:5px}
.stat-pill{font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid;font-weight:500}

/* Controls */
.controls{background:#fff;border-bottom:1px solid #E2E8F0;padding:10px 32px;display:flex;flex-direction:column;gap:8px;position:sticky;top:68px;z-index:190}
.filter-row{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.fpill{font-size:11px;padding:3px 11px;border-radius:999px;border:1px solid #CBD5E1;background:#F8FAFC;color:#475569;cursor:pointer;font-weight:500;transition:all .15s}
.fpill.active{background:#1A3A5C;color:#fff;border-color:#1A3A5C}
.cbadge{display:inline-block;background:rgba(255,255,255,.2);border-radius:999px;padding:0 5px;font-size:10px;margin-left:2px}
.sort-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sort-row label{font-size:11px;color:#64748B}
.sort-row select,.sort-row input{font-size:11px;padding:3px 8px;border:1px solid #CBD5E1;border-radius:6px;background:#F8FAFC}
#srch{width:200px}

/* Cards */
.cards{padding:16px 32px;display:flex;flex-direction:column;gap:10px;max-width:980px;margin:0 auto}

.card{background:#fff;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;transition:box-shadow .2s}
.card:hover{box-shadow:0 4px 18px rgba(26,58,92,.1)}

.mt-banner{background:#FFF7ED;border-bottom:1px solid #FED7AA;padding:5px 16px;font-size:11px;color:#C2410C;font-weight:500}

.card-hdr{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;cursor:pointer;user-select:none}
.card-hdr:hover{background:#F8FAFC}
.avatar{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0}
.card-info{flex:1}
.card-name{font-size:14px;font-weight:600;color:#1E293B}
.card-role{font-size:11px;color:#64748B;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.chip-type,.chip-score{font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid;font-weight:600}
.chip-tier{font-size:10px;padding:2px 7px;border-radius:999px;font-weight:700;border:1px solid}
.chip-tier[data-tier="1"]{background:#DCFCE7;color:#166534;border-color:#BBF7D0}
.chip-tier[data-tier="2"]{background:#DBEAFE;color:#1D4ED8;border-color:#BFDBFE}
.chip-tier[data-tier="3"]{background:#F1F5F9;color:#64748B;border-color:#CBD5E1}
.chip,.chip-ch{font-size:10px;padding:2px 8px;border-radius:999px;background:#F1F5F9;color:#64748B;border:1px solid #E2E8F0}
.toggle-btn{font-size:11px;color:#94A3B8;flex-shrink:0;margin-top:10px;transition:transform .2s}
.toggle-btn.open{transform:rotate(180deg)}

/* Card body */
.card-body{padding:0 16px 16px;border-top:1px solid #F1F5F9}
.panels{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px}
@media(max-width:720px){.panels{grid-template-columns:1fr}}
.panel{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px}
.panel-hook{background:#FFFBEB;border-color:#FDE68A}
.panel-ttl{font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px}
.panel-txt{font-size:12px;color:#334155;line-height:1.55}

/* Message block */
.msg-block{margin-top:12px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden}
.tab-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#EFF6FF;border-bottom:1px solid #BFDBFE}
.tab{font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #BFDBFE;background:#fff;color:#1E293B;cursor:pointer;font-weight:500}
.tab.active{background:#1A3A5C;color:#fff;border-color:#1A3A5C}
.btn-copy{font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid #CBD5E1;background:#fff;color:#1E293B;cursor:pointer;font-weight:500;transition:all .15s}
.btn-copy:hover{background:#F1F5F9}
.btn-primary{background:#1A3A5C;color:#fff;border-color:#1A3A5C}
.btn-primary:hover{opacity:.85}
.btn-copy.copied{background:#DCFCE7;color:#166534;border-color:#BBF7D0}
.subj-row{padding:7px 12px;background:#FAFAFA;border-bottom:1px solid #E2E8F0;font-size:12px}
.subj-lbl{color:#94A3B8;margin-right:5px}
.msg-body{padding:10px 12px;font-size:12px;line-height:1.6;color:#1E293B;white-space:pre-wrap;max-height:240px;overflow-y:auto}
.dm-box{padding:10px 12px;font-size:12px;line-height:1.6;color:#1E293B;white-space:pre-wrap;background:#F0F7FF}
.msg-meta{padding:5px 12px;font-size:11px;color:#94A3B8;border-top:1px solid #E2E8F0;background:#FAFAFA}
.msg-meta a{color:#1D4ED8;text-decoration:none}

/* Empty + footer */
#empty{display:none;text-align:center;padding:60px;color:#94A3B8;font-size:14px}
.footer{text-align:center;padding:20px;font-size:11px;color:#CBD5E1}
</style>
</head>
<body>
<div class="page-hdr">
  <h1>Summit Venture Studio Fund II — LP Outreach Review</h1>
  <div class="sub">Generated ${date} · ${result.enriched.length} profiles · Philippe M. Masindet, VP Summit Venture Studio</div>
</div>
${renderStats(result)}
${renderControls(result)}
<div class="cards" id="ctn">
${cards}
  <div id="empty">No profiles match your filters.</div>
</div>
<div class="footer">Summit Venture Studio Fund II · Confidential · invest@svsfund.vc</div>
<script>
var _filter='all',_search='',_mtOnly=false;

function toggleCard(id){
  var b=document.getElementById('body-'+id);
  var t=document.getElementById('tog-'+id);
  var open=b.style.display!=='none';
  b.style.display=open?'none':'block';
  t&&t.classList.toggle('open',!open);
}

function switchTab(id,tab,btn){
  var email=document.getElementById('tab-email-'+id);
  var dm=document.getElementById('tab-dm-'+id);
  if(email) email.style.display=tab==='email'?'':'none';
  if(dm) dm.style.display=tab==='dm'?'':'none';
  document.querySelectorAll('#body-'+id+' .tab').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  // Update copy button target
  var cpBtn=document.getElementById('copy-main-'+id);
  if(cpBtn) cpBtn.dataset.tab=tab;
}

function copyActive(id,btn){
  var tab=(document.getElementById('copy-main-'+id)||{}).dataset&&document.getElementById('copy-main-'+id).dataset.tab||'email';
  var el=document.getElementById(tab==='dm'?'dm-'+id:'email-'+id);
  if(!el) return;
  navigator.clipboard.writeText(el.innerText||'').then(function(){flash(btn,'✓ Copied')});
}

function copyElem(elemId,btn){
  var el=document.getElementById(elemId);
  if(!el) return;
  navigator.clipboard.writeText(el.innerText||'').then(function(){flash(btn,'✓ Copied')});
}

function flash(btn,msg){
  var orig=btn.textContent;
  btn.textContent=msg;btn.classList.add('copied');
  setTimeout(function(){btn.textContent=orig;btn.classList.remove('copied')},1800);
}

function setFilter(f){
  _filter=f;
  document.querySelectorAll('.fpill').forEach(function(p){p.classList.toggle('active',p.dataset.f===f)});
  applyVis();
}

function applySort(){
  var v=document.getElementById('sortSel').value;
  var ctn=document.getElementById('ctn');
  var cards=Array.from(ctn.querySelectorAll('.card'));
  cards.sort(function(a,b){
    if(v==='score-d') return +b.dataset.score - +a.dataset.score;
    if(v==='score-a') return +a.dataset.score - +b.dataset.score;
    if(v==='name-a')  return (a.dataset.search||'').localeCompare(b.dataset.search||'');
    if(v==='tier-a')  return +a.dataset.tier - +b.dataset.tier;
    if(v==='batch-a') return +a.dataset.batch - +b.dataset.batch;
    return 0;
  });
  cards.forEach(function(c){ctn.appendChild(c)});
  applyVis();
}

function applySearch(){
  _search=document.getElementById('srch').value.toLowerCase();
  _mtOnly=document.getElementById('mt-only').checked;
  applyVis();
}

function applyVis(){
  var cards=document.querySelectorAll('.card');
  var vis=0;
  cards.forEach(function(c){
    var typeOk=_filter==='all'||c.dataset.lptype===_filter;
    var srchOk=!_search||c.dataset.search.includes(_search);
    var mtOk=!_mtOnly||c.querySelector('.mt-banner');
    var show=typeOk&&srchOk&&mtOk;
    c.style.display=show?'':'none';
    if(show) vis++;
  });
  var el=document.getElementById('empty');
  if(el) el.style.display=vis===0?'block':'none';
  var badge=document.getElementById('allCount');
  if(badge) badge.textContent=vis;
}
</script>
</body>
</html>`
}
