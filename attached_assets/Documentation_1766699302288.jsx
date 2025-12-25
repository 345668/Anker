import React from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Documentation() {
  const [copied, setCopied] = React.useState(false);

  const readmeContent = `# SynergyAI - AI-Powered Investor-Startup Matchmaking Platform

![SynergyAI](https://img.shields.io/badge/Built%20with-Base44-purple)
![React](https://img.shields.io/badge/React-18.2.0-blue)

SynergyAI is an intelligent platform that connects startups with investors through AI-powered matching, comprehensive CRM features, and automated outreach tools.

## ✨ Key Features

### For Founders
- **AI-Powered Investor Matching**: Smart algorithm analyzes your startup profile and investor preferences
- **Pitch Deck Analysis**: Upload your deck for AI-driven insights and improvement suggestions
- **Deal Room Management**: Track conversations, documents, and milestones with investors
- **Outreach Automation**: Create and manage email sequences with engagement tracking
- **Fundraising Analytics**: Real-time metrics on pitch performance and deal velocity

### For Investors
- **Curated Deal Flow**: AI-filtered startups matching your investment thesis
- **Due Diligence Tools**: Automated research, sentiment analysis, and conflict detection
- **Portfolio Insights**: Track investments, co-investor networks, and portfolio performance
- **Contact Management**: Rich CRM with Folk integration for seamless contact sync
- **Team Collaboration**: Shared notes, deal scoring, and team-wide analytics

## 🚀 Quick Start

### Local Installation

\`\`\`bash
# Clone the repository
git clone <your-repo-url>
cd synergyai

# Install dependencies
npm install

# Set up environment variables
# Create .env file with:
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_PUBLIC_KEY=your_public_key
MISTRAL_API_KEY=your_mistral_key
CORESIGNAL_API_KEY=your_coresignal_key
FOLK_API_KEY=your_folk_api_key

# Start development server
npm run dev

# Access at http://localhost:5173
\`\`\`

## ☁️ Cloud Deployment (Base44)

\`\`\`bash
# Install Base44 CLI
npm install -g @base44/cli

# Login to Base44
base44 login

# Deploy
base44 deploy
\`\`\`

Configure secrets in Base44 Dashboard → Settings → Environment Variables:
- \`MISTRAL_API_KEY\` (for AI features)
- \`CORESIGNAL_API_KEY\` (for company enrichment)
- \`FOLK_API_KEY\` (for CRM sync)

### OAuth App Connectors

Configure in Base44 Dashboard → Integrations:
- **Google Calendar**: For meeting scheduling (\`calendar.events\`, \`calendar.readonly\`)

## 📁 Project Structure

\`\`\`
synergyai/
├── pages/              # Main application pages
│   ├── Landing.js     # Landing page
│   ├── Dashboard.js   # User dashboard
│   ├── Onboarding.js  # User onboarding
│   ├── Matches.js     # Investor matching
│   ├── Investors.js   # Investor CRM
│   └── ...
├── components/         # Reusable components
│   ├── ui/            # UI primitives
│   ├── crm/           # CRM components
│   └── ...
├── entities/          # Data schemas
│   ├── Startup.json
│   ├── InvestorFirm.json
│   └── ...
├── functions/         # Backend functions
└── Layout.js          # Main layout
\`\`\`

## 🔧 Configuration

### API Keys & Integrations

**Mistral AI** (Required for AI features)
- Sign up at [mistral.ai](https://mistral.ai)
- Add API key to Base44 secrets

**Coresignal** (Optional - Company enrichment)
- Sign up at [coresignal.com](https://coresignal.com)
- Add API key to Base44 secrets

**Folk CRM** (Optional - Contact sync)
- Sign up at [folk.app](https://folk.app)
- Add API key to Base44 secrets

**Google Calendar** (Optional - Meeting sync)
- Configure OAuth in Base44 Dashboard

### User Roles

- **Founder**: Startup management, investor matching, outreach
- **Investor**: Deal flow, startup discovery, due diligence
- **Lead**: Sales/BD role with pipeline and CRM access
- **Admin**: Full platform access, user management, data import

## 🧩 Core Technologies

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **UI Library**: Radix UI, shadcn/ui
- **State Management**: TanStack Query
- **Animations**: Framer Motion
- **Backend**: Base44 platform (Deno runtime)
- **AI**: Mistral AI
- **CRM**: Folk API
- **Calendar**: Google Calendar API

## 📊 Data Management

### CSV/Excel Import
1. Navigate to Data Import (Admin only)
2. Select "CSV Import" tab
3. Upload file (.csv, .xlsx)
4. Map columns to fields
5. Preview and import

### Folk CRM Sync
1. Navigate to Data Import
2. Select "Folk CRM" tab
3. Configure API key
4. Choose groups to sync
5. Enable auto-sync

## 🎨 Customization

- Update branding in \`Layout.js\` and \`pages/Landing.js\`
- Modify \`globals.css\` for global styles
- Create email templates in Templates page

## 🔐 Security

- Base44 OAuth 2.0 authentication
- Row-level security on all entities
- Encrypted API keys and OAuth tokens
- GDPR compliant

## 📈 Analytics

Built-in analytics for:
- Outreach performance (open/click/response rates)
- Pipeline metrics (deal velocity, conversion)
- Matching quality (feedback, engagement)
- Fundraising progress (capital raised)

## 🐛 Troubleshooting

**OAuth not working**: Re-authorize in Base44 Dashboard
**Folk sync failing**: Verify API key and permissions
**AI features broken**: Check \`MISTRAL_API_KEY\` in secrets
**Slow matching**: Algorithm processes in background

## 📝 License

Proprietary software. All rights reserved.

## 🆘 Support

- **Docs**: [base44.com/docs](https://base44.com/docs)
- **Email**: support@base44.com

## 🙏 Acknowledgments

Built with:
- [Base44](https://base44.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Mistral AI](https://mistral.ai)
- [Folk](https://folk.app)
- [Radix UI](https://radix-ui.com)

---

**Strategic Partners**: Costa Norte & Company, SaaSXperts, DigiCorp
**Trusted by**: Finetaste, Kinu Health, PERFI, Mint Town, CAPSERO, Alga Biologics, and more.
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(readmeContent);
    setCopied(true);
    toast.success('README content copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">README Documentation</h1>
              <p className="text-slate-600 mt-2">Copy this content to create your README.md file</p>
            </div>
            <Button onClick={copyToClipboard} className="gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy README'}
            </Button>
          </div>

          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-slate-800 whitespace-pre-wrap font-mono">
              {readmeContent}
            </pre>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl border border-purple-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2">📝 Next Steps</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-700">
            <li>Copy the README content using the button above</li>
            <li>Create a <code className="bg-white px-2 py-1 rounded">README.md</code> file in your repository root</li>
            <li>Paste the content and customize as needed</li>
            <li>Commit and push to your repository</li>
          </ol>
        </div>
      </div>
    </div>
  );
}