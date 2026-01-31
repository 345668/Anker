    
    <div class="two-column">
      <div>
        <h2 class="subsection-header">Strengths</h2>
        <ul class="insight-list">
          ${data.strengths.map(s => `<li class="insight-item">${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
      <div>
        <h2 class="subsection-header">Areas for Improvement</h2>
        <ul class="insight-list">
          ${data.weaknesses.map(w => `<li class="insight-item">${escapeHtml(w)}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>
  
  <div class="page">
    <h1 class="section-header">Strategic Recommendations</h1>
    ${data.recommendations.map((rec, i) => `
      <div class="recommendation-box">
        <strong>Recommendation ${i + 1}:</strong> ${escapeHtml(rec)}
      </div>
    `).join('')}
    
    ${data.risks && data.risks.length > 0 ? `
      <h2 class="subsection-header">Risk Assessment</h2>
      <table>
        <thead>
          <tr>
            <th>Risk</th>
            <th>Level</th>
            <th>Mitigation Strategy</th>
          </tr>
        </thead>
        <tbody>
          ${data.risks.map(r => `
            <tr>
              <td>${escapeHtml(r.risk)}</td>
              <td class="risk-level-${escapeHtml(r.level).toLowerCase()}">${escapeHtml(r.level)}</td>
              <td>${escapeHtml(r.mitigation)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  </div>
  
  <div class="footer">
    Anker Consulting | Confidential | Generated ${formatDate()}
  </div>
</body>
</html>
  `;
}

export function generateMatchesReportHTML(data: MatchesReportData): string {
  // Sanitize all user-supplied data to prevent XSS/injection
  const safeStartupName = escapeHtml(data.startupName);
  const safeStage = escapeHtml(data.stage);
  const safeIndustry = escapeHtml(data.industry);
  const safeFundingTarget = escapeHtml(data.fundingTarget);
  
  const topMatches = data.matches.slice(0, 10);
  const avgScore = data.matches.length > 0 
    ? Math.round(data.matches.reduce((acc, m) => acc + (Number(m.score) || 0), 0) / data.matches.length)
    : 0;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${CONSULTING_STYLES}</style>
</head>
<body>
  <div class="confidential-banner">CONFIDENTIAL - FOR INTERNAL USE ONLY</div>
  
  <div class="cover-page">
    <div class="cover-logo">Anker Consulting</div>
    <div class="cover-title">Investor Match Report</div>
    <div class="cover-subtitle">${safeStartupName}</div>
    <div class="cover-date">${formatDate()}</div>
  </div>
  
  <div class="page">
    <h1 class="section-header">Executive Summary</h1>
    <div class="executive-summary">
      <p>This report presents curated investor matches for <strong>${safeStartupName}</strong> based on our proprietary matching algorithm. Matches are scored based on industry alignment, investment stage preference, geographic fit, and historical investment patterns.</p>
    </div>
    
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${Math.max(0, Math.round(Number(data.totalMatches) || 0))}</div>
        <div class="metric-label">Total Matches</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${avgScore}%</div>
        <div class="metric-label">Average Match Score</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${Math.max(0, Math.min(100, Math.round(Number(data.enrichmentScore) || 0)))}%</div>
        <div class="metric-label">Profile Enrichment</div>
      </div>
    </div>
    
    <h2 class="subsection-header">Startup Profile</h2>
    <table>
      <tbody>
        <tr><td><strong>Company</strong></td><td>${safeStartupName}</td></tr>
        ${safeStage ? `<tr><td><strong>Stage</strong></td><td>${safeStage}</td></tr>` : ''}
        ${safeIndustry ? `<tr><td><strong>Industry</strong></td><td>${safeIndustry}</td></tr>` : ''}
        ${safeFundingTarget ? `<tr><td><strong>Funding Target</strong></td><td>${safeFundingTarget}</td></tr>` : ''}
        ${data.documentCount ? `<tr><td><strong>Documents Uploaded</strong></td><td>${Math.max(0, Math.round(Number(data.documentCount) || 0))}</td></tr>` : ''}
      </tbody>
    </table>
  </div>
  
  <div class="page">
    <h1 class="section-header">Top Investor Matches</h1>
    <p style="margin-bottom: 0.2in; color: #666;">The following investors represent the highest-scoring matches based on alignment with your startup profile.</p>
    
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Investor / Firm</th>
          <th>Type</th>
          <th>Location</th>
          <th>Match Score</th>
        </tr>
      </thead>
      <tbody>
        ${topMatches.map((match, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>
              <strong>${escapeHtml(match.investorName)}</strong>
              ${match.firmName ? `<br><span style="font-size: 9pt; color: #666;">${escapeHtml(match.firmName)}</span>` : ''}
            </td>
            <td>${escapeHtml(match.investorType) || 'N/A'}</td>
            <td>${escapeHtml(match.location) || 'N/A'}</td>
            <td><span class="score-badge ${getScoreClass(Number(match.score) || 0)}">${Math.max(0, Math.min(100, Math.round(Number(match.score) || 0)))}%</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  
  ${data.matches.length > 10 ? `
  <div class="page">
    <h1 class="section-header">Additional Matches</h1>
    <p style="margin-bottom: 0.2in; color: #666;">Extended list of investor matches for broader outreach consideration.</p>
    
    <table>
      <thead>
        <tr>
          <th>Investor / Firm</th>
          <th>Type</th>
          <th>Match Score</th>
        </tr>
      </thead>
      <tbody>
        ${data.matches.slice(10, 30).map(match => `
          <tr>
            <td>
              <strong>${escapeHtml(match.investorName)}</strong>
              ${match.firmName ? ` - ${escapeHtml(match.firmName)}` : ''}
            </td>
            <td>${escapeHtml(match.investorType) || 'N/A'}</td>
            <td><span class="score-badge ${getScoreClass(Number(match.score) || 0)}">${Math.max(0, Math.min(100, Math.round(Number(match.score) || 0)))}%</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  
  <div class="page">
    <h1 class="section-header">Recommended Next Steps</h1>
    
    <div class="recommendation-box">
      <strong>1. Prioritize Top 5 Matches:</strong> Focus initial outreach on the highest-scoring investors who demonstrate strong alignment with your stage and sector.
    </div>
    
    <div class="recommendation-box">
      <strong>2. Customize Your Approach:</strong> Tailor your pitch and messaging based on each investor's known focus areas and portfolio companies.
    </div>
    
    <div class="recommendation-box">
      <strong>3. Leverage Warm Introductions:</strong> Where possible, seek introductions through mutual connections or portfolio founders.
    </div>
    
    <div class="recommendation-box">
      <strong>4. Track Engagement:</strong> Monitor response rates and adjust your targeting strategy based on investor feedback patterns.
    </div>
  </div>
  
  <div class="footer">
    Anker Consulting | Confidential | Generated ${formatDate()}