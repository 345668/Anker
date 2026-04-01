# Anker - Venture Capital Website

## Overview
Anker is a venture capital firm website with a React frontend and Express backend, showcasing portfolio companies, team, and news, alongside contact and newsletter features. It integrates Framer-exported UI and shadcn/ui for a premium aesthetic. The platform includes an admin console for data management, Folk CRM integration, and AI-driven deep research, data enrichment for investment firms (especially family offices), and an advanced investor-founder matchmaking engine. The project aims to optimize VC operations, improve data quality, and enhance deal sourcing and matching efficiency. Key features include AI-powered pitch deck analysis with stage-specific frameworks and the generation of MBB-style investment analysis reports.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter for routing, Tailwind CSS, shadcn/ui, Framer Motion for animations, TanStack React Query for state, React Hook Form with Zod for forms, built with Vite.
- **Backend**: Express.js with TypeScript, RESTful API with Zod schemas.
- **Database**: PostgreSQL with Drizzle ORM, shared schema for type safety.
- **Build System**: Vite for frontend, `esbuild` for server bundling.

### Data Model
- **Key Entities**: `users`, `investors`, `investmentFirms`, `deals`, `startups`, `messages`, `subscribers`, `activityLogs`, `systemSettings`, `dealRooms`, `dealRoomDocuments`.
- **Relationships**: Startups have a 1:1 relationship with deal rooms, which are auto-created.

### Admin Console
- **Access Control**: Admin-only via `isAdmin` middleware and email whitelist.
- **Functionality**: Data import (Folk CRM sync, CSV), user management, system settings, analytics, database entity management, and activity logs.

### AI/Data Enrichment & Matchmaking
- **Folk CRM Integration**: Bidirectional sync for investor records, bulk operations.
- **AI-Powered Enrichment**: Mistral Large for deep research and data enrichment of investment firms (e.g., family offices), including auto-seeding and niche industry alias matching.
- **Investor-Founder Matchmaking Engine**: Hybrid approach combining multi-factor scoring (Industry, Stage, Location, Check Size, Investor Type), semantic compatibility (Jaccard similarity), economic fit, geographic practicality, investor behavior, and contextual multipliers. Includes domain-specific scoring for Film/Movies and Real Estate.
    - Matches across the entire investor database, returning up to 200 matched investors.
    - **Bulk CRM Import**: Functionality to import matched investors to CRM contacts with scores.
    - **Match Insights**: Includes Champion Partner, Portfolio Synergies, Decision Speed, Value Add, and Probability Score.
    - **Document-Enhanced Matching**: Utilizes data room documents for industry keyword extraction.
    - **Deal Outcome Feedback Loop**: Adjusts matchmaking weights based on "won" or "lost" deals.
    - **Matching Session Logs**: Each match generation run creates a `match_session` record grouping all matched investors/firms. The Matching Logs page (`/app/matching-logs`) shows all past sessions with status breakdowns (pending/in CRM/passed). Clicking a session shows individual enriched match cards with "Add to CRM" and "Pass" actions.
- **MBB-Style Match Report**: 6-page report including overview, analytics dashboard, top matches, tier analysis, outreach strategy, and market intelligence with professional charts and strategic recommendations.
- **Profile Enrichment**: AI-powered extraction and generation of founder profiles, social media, and website crawling.
- **AI Chatbot**: Provides answers using platform documentation.
- **Stage-Aware Pitch Deck Analysis**: AI-powered evaluation using stage-specific frameworks (Early Stage, Late Stage) with gating rules and investment readiness classifications.
    - **MBB-Style Enhanced Pitch Deck Analysis**: Multi-document upload (pitch deck, data room, financials, FAQs) for comprehensive, bias-free scoring with critical standards. Generates professional charts and enhanced data models (e.g., DeckQuality, MarketOpportunity, UnitEconomics).
- **Professional PDF Report Generation**: MBB-style investment analysis reports with comprehensive sections including Executive Summary, Critical Assessment, Red Flags, Scoring Matrix, and Financial Analysis, with auto-generated content and recommendations (INVEST/CONSIDER/PASS).

### Design Patterns
- **Shared Types**: Centralized schema and route definitions for frontend and backend.
- **API Contract**: Defined routes with path, method, input, and response schemas.
- **Storage Abstraction**: Database operations encapsulated.

### RBAC (Role-Based Access Control)
- **Implementation**: `isAdmin` middleware, resource ownership checks, and `userType` for dashboard customization.

### Financial Tools Hub (`/app/tools`)
- **Route**: `/app/tools` (added to App.tsx)
- **Nav**: "Financial Tools" link added to founder, investor, and default nav in AppLayout.tsx
- **Architecture**: Single pure-frontend page (`client/src/pages/app/FinancialTools.tsx`) with 11 reactive calculators, no backend persistence. All calculations update live as inputs change.
- **Calculators**:
  1. SAFE Dilution Calculator (stacked SAFEs, pre/post-money, conversion price)
  2. Cap Table & Exit Waterfall (stakeholder table, liquidation preferences, downloadable CSV)
  3. VC Method Valuation (pre/post-money, MOIC, IRR across base/upside/downside scenarios with chart)
  4. IRR & MOIC Return Modeller (dilution-adjusted return curves with area chart)
  5. SAFE vs Convertible Note Comparison (side-by-side multi-instrument table)
  6. Unit Economics Health Check (LTV:CAC, Magic Number, payback, gross margin with traffic-light badges)
  7. CAC Payback Calculator (break-even timeline chart)
  8. Runway & Burn Calculator (real-time with what-if toggles for hiring/cuts/revenue)
  9. Scenario Fundraising Planner (raise size vs dilution vs runway comparison table + chart)
  10. QSBS Eligibility Calculator (Section 1202 eligibility checklist + tax exclusion amount)
  11. TAM/SAM/SOM Calculator (top-down & bottom-up modes, concentric circle SVG, pitch-ready summary)
- All calculators have "Copy results" buttons; charts use recharts.

## Forecasting Studio (`/app/forecasting`)
- **Route**: `/app/forecasting` (added to App.tsx)
- **Nav**: "Forecasting Studio" link added to founder, investor, and default nav in AppLayout.tsx
- **Architecture**: Single pure-frontend page (`client/src/pages/app/ForecastingStudio.tsx`) with 9 reactive models, no backend persistence.
- **Fund Models** section:
  1. VC Portfolio KPI Dashboard (manual portfolio entry table, auto-computed NAV, MOIC, TVPI, DPI, IRR, pacing bar, sector pie chart)
  2. Fund Forecast Scenarios (conservative/base/optimistic NAV curves over fund lifetime, area chart)
  3. Rolling Fund Model (quarterly LP subscription closes, cumulative capital, management fee projections)
  4. Fund of Funds Model (weighted aggregate NAV/MOIC/TVPI/DPI across underlying funds, horizontal bar chart)
- **Revenue Forecasting** section:
  5. SaaS ARR/MRR Forecast (new logos + expansion + churn → ARR/MRR waterfall, area chart)
  6. Enterprise SaaS Forecast (ACV deal pipeline, win rate, sales cycle, NDR → ARR bridge table)
  7. Ecommerce Forecast (GMV, AOV, repeat rate, CAC, gross margin → contribution margin chart)
  8. OpEx ProForma & Runway Budgeting (headcount planner with salary bands, monthly burn, cash runway chart)
- **Venture Studio** section:
  9. Venture Studio Model (annual incubation forecast, studio P&L with fee income vs opex, exit proceeds table)
- All models have "Copy results" buttons; FundManagement.tsx has an "Open Forecasting Studio" CTA button.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.

### UI/Styling
- **Google Fonts**: DM Sans, Outfit, Fira Code, Geist Mono, Architects Daughter.
- **Framer/Unframer**: For design components.
- **Radix UI**: Primitive component set.
- **Lucide React**: Icon library.

### Third-Party Libraries
- **date-fns**: Date utilities.
- **embla-carousel-react**: Carousel.
- **vaul**: Drawer component.
- **cmdk**: Command palette.
- **react-day-picker**: Calendar.

### Integrations
- **Mistral Large**: For AI-powered generation and analysis.
- **Resend**: For email sending, with webhook integration for tracking.
- **Svix**: For Resend webhook signature verification.