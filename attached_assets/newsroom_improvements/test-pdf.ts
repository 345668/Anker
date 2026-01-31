import { generateNewsroomReportPDF } from './services/newsroom-pdf-report';
import * as fs from 'fs';

async function test() {
  const data = {
    headline: "The Future of Private Capital in 2026",
    executiveSummary: "• Market growth expected to continue at 15% CAGR\n• AI integration becomes the primary differentiator for top-tier firms\n• Sustainable investing reaches 40% of total AUM",
    content: `**Introduction**\n\nThe private capital landscape is undergoing a significant transformation. As we move into 2026, several key trends are emerging that will define the next decade of investing.\n\n**Market Dynamics**\n\n- Global AUM is projected to reach $15 trillion by the end of the year.\n- Secondary markets are providing much-needed liquidity in a high-interest-rate environment.\n- Cross-border deals are increasing despite geopolitical tensions.\n\n**Technological Impact**\n\nAI is no longer just a buzzword; it's a fundamental tool for deal sourcing and due diligence. Firms that fail to integrate advanced analytics into their workflow are finding it increasingly difficult to compete for high-quality deals.\n\n**Conclusion**\n\nThe outlook remains positive for those who can adapt to the new digital reality of private capital markets.`,
    author: "Anker Intelligence Analyst",
    publishedAt: new Date().toISOString(),
    sources: [
      {
        title: "Global Private Capital Report 2025",
        publisher: "Anker Research Institute",
        date: "2025-11-20",
        citation: "Anker Research Institute. (2025). Global Private Capital Report 2025. Anker Publications.",
        url: "https://an-ker.de/reports/global-2025"
      }
    ]
  };

  try {
    console.log("Generating PDF...");
    const buffer = await generateNewsroomReportPDF(data);
    fs.writeFileSync('test-report.pdf', buffer);
    console.log("PDF generated successfully: test-report.pdf");
  } catch (err) {
    console.error("Error generating PDF:", err);
  }
}

test();
