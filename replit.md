# Anker - Venture Capital Website

## Overview
Anker is a venture capital firm website with a React frontend and Express backend, showcasing portfolio companies, team, and news, alongside contact and newsletter features. It aims to optimize VC operations, improve data quality, and enhance deal sourcing and matching efficiency. Key capabilities include AI-driven deep research, data enrichment for investment firms, an advanced investor-founder matchmaking engine, AI-powered pitch deck analysis with stage-specific frameworks, and the generation of MBB-style investment analysis reports. The platform also features an admin console for data management and integration with Folk CRM.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18 with TypeScript, Wouter, Tailwind CSS, shadcn/ui, Framer Motion, TanStack React Query, React Hook Form with Zod, built with Vite.
- **Backend**: Express.js with TypeScript, RESTful API with Zod schemas.
- **Database**: PostgreSQL with Drizzle ORM.
- **Build System**: Vite for frontend, `esbuild` for server bundling.

### Data Model
- **Key Entities**: `users`, `investors`, `investmentFirms`, `deals`, `startups`, `messages`, `subscribers`, `activityLogs`, `systemSettings`, `dealRooms`, `dealRoomDocuments`.
- **Relationships**: Startups have a 1:1 relationship with auto-created deal rooms.

### Admin Console
- **Access Control**: Admin-only via `isAdmin` middleware and email whitelist.
- **Functionality**: Data import (Folk CRM sync, CSV), user management, system settings, analytics, database entity management, and activity logs.

### AI/Data Enrichment & Matchmaking
- **Folk CRM Integration**: Bidirectional sync for investor records.
- **AI-Powered Enrichment**: Uses Mistral Large for deep research and data enrichment of investment firms.
- **Investor-Founder Matchmaking Engine V2**: A deterministic, rule-based engine scoring 10,000+ investors in seconds using 6 weighted factors (Industry, Stage, Geography, Check Size, Investor Type, Team Signal) and 5 bonus scores. Includes a feedback loop for deal outcomes and generates up to 200 matches per session categorized into tiers.
- **MBB-Style Match Report**: A 6-page report with overview, analytics, top matches, tier analysis, outreach strategy, and market intelligence.
- **Profile Enrichment**: AI-powered extraction and generation of founder profiles.
- **AI Chatbot**: Provides answers using platform documentation.
- **MBB-Style Enhanced Pitch Deck Analysis**: Multi-document upload (pitch deck, data room, financials, FAQs) for comprehensive, bias-free scoring with critical standards.
- **Professional PDF Report Generation**: MBB-style investment analysis reports with auto-generated content and recommendations.

### Design Patterns
- **Shared Types**: Centralized schema and route definitions for frontend and backend.
- **API Contract**: Defined routes with path, method, input, and response schemas.
- **Storage Abstraction**: Database operations encapsulated.

### RBAC (Role-Based Access Control)
- **Implementation**: `isAdmin` middleware, resource ownership checks, and `userType` for dashboard customization.

### Financial Tools Hub (`/app/tools`)
- A pure-frontend page with 11 reactive calculators, including SAFE dilution, Cap Table & Exit Waterfall, VC Method Valuation, IRR & MOIC Return Modeller, Unit Economics Health Check, and TAM/SAM/SOM Calculator. All calculations update live with no backend persistence.

### Forecasting Studio (`/app/forecasting`)
- A pure-frontend page with 9 reactive models categorized into Fund Models (VC Portfolio KPI Dashboard, Fund Forecast Scenarios), Revenue Forecasting (SaaS ARR/MRR Forecast, Enterprise SaaS Forecast), and Venture Studio Model. No backend persistence.

### Consolidated Navigation Architecture (v2)
- New Hub Pages: `/app/fundraise` (combines Matching, Fund Management, Deal Rooms), `/app/investor-db` (combines Investors, InvestmentFirms), and `/app/due-diligence` (combines DDChecklist, DataRoomChecklist, EOYFundHealthReview).
- Backward-compatible redirects are implemented for old routes.

### Interactive Checklists & Due Diligence Suite
- **Data Room Checklist**: Fund mode toggle (Emerging Manager / Fund I vs Fund II+), with progress tracking and auto-saving to DB.
- **EOY Fund Health Review**: Annual year-end review with multiple input types, auto-saving, and export.
- **DD Toolkit**: Includes a DD Readiness Diagnostic (17 weighted questions) and a Full 39-item Early Stage DD Checklist, with priority badges, progress tracking, auto-saving, and export.
- **DB**: `checklist_sessions` table stores per-user checklist state as JSON.

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
- **Resend**: For email sending, with webhook integration.
- **Svix**: For Resend webhook signature verification.