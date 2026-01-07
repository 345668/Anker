import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// HTML sanitization to prevent XSS/injection attacks
function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

const CONSULTING_STYLES = `
  @page {
    size: A4;
    margin: 1in;
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: 'Source Sans Pro', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a2e;
    background: #ffffff;
  }
  
  .cover-page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    page-break-after: always;
    background: linear-gradient(135deg, #0b1f3a 0%, #1a1a2e 100%);
    color: white;
    padding: 2in;
  }
  
  .cover-logo {
    font-size: 48pt;
    font-weight: 700;
    letter-spacing: -2px;
    margin-bottom: 0.5in;
    background: linear-gradient(135deg, rgb(142,132,247), rgb(251,194,213));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .cover-title {
    font-size: 28pt;
    font-weight: 600;
    margin-bottom: 0.3in;
  }
  
  .cover-subtitle {
    font-size: 14pt;
    opacity: 0.8;
    margin-bottom: 1in;
  }
  
  .cover-date {
    font-size: 12pt;
    opacity: 0.6;
  }
  
  .page {
    padding: 0.5in 0;
    page-break-after: always;
  }
  
  .page:last-child {
    page-break-after: avoid;
  }
  
  .section-header {
    font-size: 18pt;
    font-weight: 700;
    color: #0b1f3a;
    margin-bottom: 0.3in;
    padding-bottom: 0.15in;
    border-bottom: 3px solid rgb(142,132,247);
  }
  
  .subsection-header {
    font-size: 14pt;
    font-weight: 600;
    color: #1a1a2e;
    margin-top: 0.3in;
    margin-bottom: 0.15in;
  }
  
  .executive-summary {
    background: #f8f9fa;
    padding: 0.3in;
    border-left: 4px solid rgb(142,132,247);
    margin-bottom: 0.3in;
  }
  
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.2in;
    margin: 0.3in 0;
  }
  
  .metric-card {
    background: linear-gradient(135deg, #0b1f3a 0%, #1a1a2e 100%);
    color: white;
    padding: 0.25in;
    border-radius: 8px;
    text-align: center;
  }
  
  .metric-value {
    font-size: 28pt;
    font-weight: 700;
    background: linear-gradient(135deg, rgb(142,132,247), rgb(251,194,213));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .metric-label {
    font-size: 10pt;
    opacity: 0.8;
    margin-top: 0.1in;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.2in 0;
    font-size: 10pt;
  }
  
  th {
    background: #0b1f3a;
    color: white;
    padding: 0.15in;
    text-align: left;
    font-weight: 600;
  }
  
  td {
    padding: 0.12in 0.15in;
    border-bottom: 1px solid #e0e0e0;
  }
  
  tr:nth-child(even) {
    background: #f8f9fa;
  }
  
  .score-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 10pt;
  }
  
  .score-high { background: #d4edda; color: #155724; }
  .score-medium { background: #fff3cd; color: #856404; }
  .score-low { background: #f8d7da; color: #721c24; }
  
  .insight-list {
    list-style: none;
    padding: 0;
  }
  
  .insight-item {
    padding: 0.15in 0 0.15in 0.3in;
    position: relative;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .insight-item::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: rgb(142,132,247);
    font-weight: bold;
  }
  
  .recommendation-box {
    background: linear-gradient(135deg, rgba(142,132,247,0.1), rgba(251,194,213,0.1));
    border: 1px solid rgba(142,132,247,0.3);
    padding: 0.25in;
    border-radius: 8px;
    margin: 0.2in 0;
  }
  
  .footer {
    position: fixed;
    bottom: 0.5in;
    left: 1in;
    right: 1in;
    text-align: center;
    font-size: 9pt;
    color: #666;
    border-top: 1px solid #e0e0e0;
    padding-top: 0.1in;
  }
  
  .two-column {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3in;
  }
  
  .risk-matrix {
    margin: 0.2in 0;
  }
  
  .risk-item {
    display: flex;
    justify-content: space-between;
    padding: 0.1in 0;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .risk-level-high { color: #dc3545; font-weight: 600; }
  .risk-level-medium { color: #ffc107; font-weight: 600; }
  .risk-level-low { color: #28a745; font-weight: 600; }
  
  .match-card {
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 0.2in;
    margin-bottom: 0.15in;
  }
  
  .match-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.1in;
  }
  
  .match-name {
    font-weight: 600;
    font-size: 12pt;
    color: #0b1f3a;
  }
  
  .match-score {
    font-size: 14pt;
    font-weight: 700;
    color: rgb(142,132,247);
  }
  
  .match-details {
    font-size: 10pt;
    color: #666;
  }
  
  .confidential-banner {
    background: #0b1f3a;
    color: white;
    text-align: center;
    padding: 0.1in;
    font-size: 9pt;
    letter-spacing: 2px;
  }
`;

function getScoreClass(score: number): string {
  if (score >= 70) return 'score-high';
  if (score >= 40) return 'score-medium';
  return 'score-low';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export interface PitchAnalysisReportData {
  startupName: string;
  tagline?: string;
  overallScore: number;
  sections: Array<{
    name: string;
    score: number;
    feedback: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  risks?: Array<{ risk: string; level: string; mitigation: string }>;
}

export interface MatchesReportData {
  startupName: string;
  stage?: string;
  industry?: string;
  fundingTarget?: string;
  totalMatches: number;
  matches: Array<{
    investorName: string;
    firmName?: string;
    score: number;
    investorType?: string;
    location?: string;
    focusAreas?: string[];
    rationale?: string;
  }>;
  documentCount?: number;
  enrichmentScore?: number;
}

export function generatePitchAnalysisHTML(data: PitchAnalysisReportData): string {
  // Sanitize all user-supplied data to prevent XSS/injection
  const safeStartupName = escapeHtml(data.startupName);
  const safeTagline = escapeHtml(data.tagline);
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(data.overallScore) || 0)));
  
  const avgSectionScore = data.sections.length > 0 
    ? Math.round(data.sections.reduce((acc, s) => acc + (Number(s.score) || 0), 0) / data.sections.length)
    : safeScore;

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
    <div class="cover-title">Pitch Deck Analysis Report</div>
    <div class="cover-subtitle">${safeStartupName}</div>
    <div class="cover-date">${formatDate()}</div>
  </div>
  
  <div class="page">
    <h1 class="section-header">Executive Summary</h1>
    <div class="executive-summary">
      <p>This report presents a comprehensive analysis of the pitch deck for <strong>${safeStartupName}</strong>${safeTagline ? ` - ${safeTagline}` : ''}. Our AI-powered evaluation system has assessed the deck across multiple dimensions to provide actionable insights for investor readiness.</p>
    </div>
    
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-value">${safeScore}%</div>
        <div class="metric-label">Overall Score</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${data.sections.length}</div>
        <div class="metric-label">Sections Analyzed</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${avgSectionScore}%</div>
        <div class="metric-label">Avg Section Score</div>
      </div>
    </div>
  </div>
  
  <div class="page">
    <h1 class="section-header">Detailed Scoring Breakdown</h1>
    <table>
      <thead>
        <tr>
          <th>Section</th>
          <th>Score</th>
          <th>Assessment</th>
        </tr>
      </thead>
      <tbody>
        ${data.sections.map(section => `
          <tr>
            <td><strong>${escapeHtml(section.name)}</strong></td>
            <td><span class="score-badge ${getScoreClass(Number(section.score) || 0)}">${Math.max(0, Math.min(100, Math.round(Number(section.score) || 0)))}%</span></td>
            <td>${escapeHtml(section.feedback)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  
  <div class="page">
    <h1 class="section-header">Key Insights</h1>
    
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
  </div>
</body>
</html>
  `;
}

export async function convertHTMLToPDF(html: string): Promise<Buffer> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  const htmlPath = path.join(tempDir, 'report.html');
  const pdfPath = path.join(tempDir, 'report.pdf');

  try {
    fs.writeFileSync(htmlPath, html, 'utf8');

    await new Promise<void>((resolve, reject) => {
      const convProcess = spawn('soffice', [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', tempDir,
        htmlPath
      ]);

      let stderr = '';
      let stdout = '';
      
      convProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      convProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      convProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error('LibreOffice stderr:', stderr);
          console.error('LibreOffice stdout:', stdout);
          reject(new Error(`LibreOffice conversion failed with code ${code}: ${stderr || stdout}`));
        }
      });

      convProcess.on('error', (err) => {
        if ((err as any).code === 'ENOENT') {
          reject(new Error('LibreOffice not found. Please ensure LibreOffice is installed.'));
        } else {
          reject(err);
        }
      });

      setTimeout(() => {
        convProcess.kill();
        reject(new Error('PDF conversion timed out after 60 seconds'));
      }, 60000);
    });

    if (!fs.existsSync(pdfPath)) {
      // Check if a file with different extension was created
      const files = fs.readdirSync(tempDir);
      console.error('Temp directory contents:', files);
      throw new Error(`PDF file was not created. Files in temp: ${files.join(', ')}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    
    if (pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    return pdfBuffer;

  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to cleanup temp directory:', e);
    }
  }
}

export async function generatePitchAnalysisPDF(data: PitchAnalysisReportData): Promise<Buffer> {
  const html = generatePitchAnalysisHTML(data);
  return convertHTMLToPDF(html);
}

export async function generateMatchesReportPDF(data: MatchesReportData): Promise<Buffer> {
  const html = generateMatchesReportHTML(data);
  return convertHTMLToPDF(html);
}
