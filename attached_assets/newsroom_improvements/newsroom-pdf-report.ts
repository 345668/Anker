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

const NEWSROOM_REPORT_STYLES = `
  @page {
    size: A4;
    margin: 0.75in;
    @bottom-center {
      content: element(footer);
    }
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: 'serif';
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a2e;
    background: #ffffff;
  }
  
  .cover-page {
    height: 10in;
    display: block;
    text-align: center;
    page-break-after: always;
    background: #0b1f3a;
    color: white;
    padding-top: 3in;
    margin: -0.75in;
  }
  
  .cover-logo {
    font-size: 36pt;
    font-weight: 700;
    margin-bottom: 0.5in;
    color: rgb(142,132,247);
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
  
  .section-break {
    page-break-before: always;
    margin-top: 0.5in;
  }
  
  .page-break {
    page-break-after: always;
  }
  
  .section-header {
    font-size: 20pt;
    font-weight: 700;
    color: #0b1f3a;
    margin-bottom: 0.2in;
    padding-bottom: 0.1in;
    border-bottom: 2px solid #0b1f3a;
  }
  
  .subsection-header {
    font-size: 16pt;
    font-weight: 600;
    color: #0b1f3a;
    margin-top: 0.3in;
    margin-bottom: 0.1in;
  }
  
  .executive-summary {
    background: #f4f7fa;
    padding: 0.25in;
    border-left: 5px solid rgb(142,132,247);
    margin-bottom: 0.3in;
    font-style: italic;
  }
  
  .columns {
    column-count: 2;
    column-gap: 0.4in;
    text-align: justify;
    orphans: 3;
    widows: 3;
  }
  
  .columns > * {
    break-inside: avoid;
    margin-bottom: 0.15in;
  }
  
  .bullet-points {
    margin: 0.2in 0;
    padding-left: 0.3in;
  }
  
  .bullet-points li {
    margin-bottom: 0.1in;
  }
  
  .footer {
    position: fixed;
    bottom: -0.5in;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 9pt;
    color: #666;
    padding: 0.1in 0;
    border-top: 1px solid #eee;
  }
  
  .bibliography {
    margin-top: 0.5in;
    padding-top: 0.2in;
    border-top: 1px solid #ccc;
  }
  
  .bib-item {
    margin-bottom: 0.15in;
    padding-left: 0.5in;
    text-indent: -0.5in;
    font-size: 10pt;
  }

  .content-p {
    margin-bottom: 0.15in;
  }
`;

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export interface NewsroomReportData {
  headline: string;
  executiveSummary: string;
  content: string;
  author?: string;
  publishedAt?: string;
  sources: Array<{
    title: string;
    publisher: string;
    date: string;
    citation: string;
    url?: string;
  }>;
}

export function generateNewsroomReportHTML(data: NewsroomReportData): string {
  const safeHeadline = escapeHtml(data.headline);
  const safeSummary = data.executiveSummary; // Already contains bullets usually
  const safeAuthor = escapeHtml(data.author || "Anker Intelligence");
  const safeDate = data.publishedAt ? new Date(data.publishedAt).toLocaleDateString() : formatDate();

  // Process content for columns and bullet points
  // Split content into paragraphs
  const paragraphs = data.content.split('\n\n').filter(p => p.trim());
  
  // Create sections for the content
  const contentHtml = paragraphs.map((p, idx) => {
    if (p.startsWith('- ') || p.startsWith('• ') || p.startsWith('* ')) {
      const items = p.split('\n').map(li => li.replace(/^[-•*]\s*/, '').trim());
      return `<ul class="bullet-points">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }
    if (p.startsWith('**') && p.endsWith('**')) {
      return `<h2 class="subsection-header">${escapeHtml(p.replace(/\*\*/g, ''))}</h2>`;
    }
    return `<p class="content-p">${escapeHtml(p)}</p>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${NEWSROOM_REPORT_STYLES}</style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-logo">ANKER NEWSROOM</div>
    <div class="cover-title">${safeHeadline}</div>
    <div class="cover-subtitle">Institutional Intelligence Report</div>
    <div class="cover-date">${safeDate}</div>
    <div style="margin-top: 0.5in; font-size: 12pt;">Author: ${safeAuthor}</div>
  </div>
  
  <div class="page">
    <h1 class="section-header">Executive Summary</h1>
    <div class="executive-summary">
      ${safeSummary.split('\n').map(line => line.trim() ? `<p>${escapeHtml(line.replace(/^[-•*]\s*/, ''))}</p>` : '').join('')}
    </div>
    
    <div class="columns">
      ${contentHtml}
    </div>
  </div>
  
  <div class="section-break">
    <h1 class="section-header">Bibliography</h1>
    <div class="bibliography">
      ${data.sources.map(source => `
        <div class="bib-item">
          ${escapeHtml(source.citation)}
          ${source.url ? `<br><span style="color: #666; font-size: 9pt;">Source: ${escapeHtml(source.url)}</span>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
  
  <div class="footer">
    Anker Intelligence Newsroom | Confidential | Page <span class="pageNumber"></span>
  </div>
</body>
</html>
  `;
}

export async function convertHTMLToPDF(html: string): Promise<Buffer> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsroom-report-'));
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

      convProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`LibreOffice conversion failed with code ${code}`));
      });

      convProcess.on('error', reject);
      
      setTimeout(() => {
        convProcess.kill();
        reject(new Error('PDF conversion timed out'));
      }, 60000);
    });

    return fs.readFileSync(pdfPath);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

export async function generateNewsroomReportPDF(data: NewsroomReportData): Promise<Buffer> {
  const html = generateNewsroomReportHTML(data);
  return convertHTMLToPDF(html);
}
