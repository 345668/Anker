# Anker — AI-Powered Venture Capital Intelligence Platform

> **Anker Consulting** | Enterprise-grade investor-founder matchmaking, AI-driven deep research, CRM integration, MBB-style reporting, pitch deck analysis, and full-stack deal flow management.

[![Built on Replit](https://img.shields.io/badge/Built%20on-Replit-F26207?style=flat-square&logo=replit)](https://replit.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Mistral AI](https://img.shields.io/badge/Mistral-Large-FF7000?style=flat-square)](https://mistral.ai/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square)](https://orm.drizzle.team/)

---

## Table of Contents

- [Vision & Mission](#vision--mission)
- [Platform Overview](#platform-overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Core Modules](#core-modules)
- [AI Services & Intelligence Layer](#ai-services--intelligence-layer)
- [Matchmaking Engine](#matchmaking-engine)
- [Pitch Deck Analysis](#pitch-deck-analysis)
- [MBB-Style Reporting](#mbb-style-reporting)
- [Deal Flow Management](#deal-flow-management)
- [CRM Integration](#crm-integration)
- [Admin Console](#admin-console)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Security Model](#security-model)
- [Design System](#design-system)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [License & Support](#license--support)

---

## Vision & Mission

### Vision
To become the world's most trusted AI-powered intelligence layer for venture capital, bridging the gap between promising founders and the right capital partners through technology, data, and insight.

### Mission
Anker democratizes access to institutional-grade investor intelligence. Where traditionally only elite founders with warm network introductions could reach the right investors, Anker provides every qualified founder with a sophisticated, data-driven pathway to capital — backed by artificial intelligence, real-time enrichment, and proprietary matchmaking algorithms.

### Why Anker?
The venture capital ecosystem is structurally inefficient. Founders spend months sending cold outreach to investors who will never fund them. Investors wade through hundreds of misaligned pitches. The right match — built on sector fit, stage alignment, check size compatibility, and geographic practicality — is rarely made at the first interaction. Anker solves this by building a semantic understanding of both parties and engineering precision connections at scale.

---

## Platform Overview

Anker is a full-stack venture capital consulting platform that serves two primary user classes: **founders** seeking investment and **administrators** managing the platform and investor database. Built on a React 18 / Express.js / PostgreSQL architecture, the platform integrates multiple AI models, external data APIs, and CRM systems to deliver a seamless end-to-end fundraising intelligence experience.

The platform encompasses:
- A production investor intelligence database comprising **10,919 investment firms** and **6,720 individual investor profiles** across 22 institutional classification types (Venture Capital, Family Office, Corporate VC, Pension Fund, Film Finance, Sports-Tech VC, Private Equity, Accelerator, and more) spanning 15+ countries
- A **multi-factor AI matchmaking engine** with semantic vector embeddings and learned weight optimization
- An **MBB-style reporting engine** generating McKinsey/Bain/BCG-caliber investment analysis reports
- **Stage-aware pitch deck analysis** with gating rules and investment readiness classifications
- A **Folk CRM bidirectional integration** for contact management and outreach automation
- An **enterprise AI newsroom** with configurable source management
- **Password-protected data rooms** for secure document collaboration
- A real-time **AI chatbot** powered by Mistral with full platform knowledge

---

## Key Features

### Investor Discovery & AI Matching
- **Hybrid Matchmaking Engine**: Combines multi-factor scoring (industry, stage, geography, check size, investor type) with Jaccard semantic similarity and Mistral embedding-based vector matching
- **Niche Industry Specialization**: Deep-domain scoring for Entertainment/Film, Real Estate, Sports, Healthcare, FinTech, Climate, and 40+ additional verticals
- **Score Transparency**: Every match includes a breakdown across all scoring dimensions with visual progress indicators and narrative explanations
- **Bulk CRM Import**: Matched investors can be pushed directly to Folk CRM with scores and notes in a single click
- **Production Database**: 10,919 investment firms and 6,720 individual investor profiles across 22 institutional classification types, 15+ countries, and 13+ sector verticals — continuously enriched through automated deep research

### Deep Research & Data Enrichment
- **AI-Powered Web Crawling**: Automated extraction and parsing of investor websites using a multi-layer crawl-then-enrich pipeline
- **Mistral Large Enrichment**: LLM-powered inference of firm classification, AUM, typical check sizes, portfolio sectors, and leadership profiles
- **Hunter.io Integration**: Domain-based email discovery, address verification, and LinkedIn profile extraction
- **Batch Processing**: Enrich hundreds of firms simultaneously with real-time progress tracking, ETA estimation, and cancellation support
- **Enrichment Statistics**: Dashboard showing enrichment coverage, quality scores, and field completion rates

### Deal Flow Management
- **Deal Rooms**: Fully collaborative workspaces for managing active investor relationships
- **Multi-Document Storage**: Secure uploads for pitch decks, term sheets, LOIs, due diligence packages, and financials
- **Milestone Tracking**: Visual deal timeline with customizable stages and completion tracking
- **Activity Audit Trail**: Immutable log of every action for compliance and institutional memory

### CRM & Outreach
- **Folk CRM Bidirectional Sync**: Import contacts from Folk, push enriched data and match scores back with custom field mapping
- **Bulk Email Campaigns**: Personalized outreach to investor lists with merge fields for name, firm, and match rationale
- **Rate-Limited Delivery**: Intelligent throttling at 50 emails/hour to protect sender reputation
- **Resend Integration**: Deliverability-optimized transactional email via Resend with webhook tracking

### AI Pitch Deck Analysis
- **Stage-Aware Frameworks**: Separate evaluation rubrics for Early Stage and Late Stage companies
- **Gating Rules**: Automatic investment readiness classification (INVEST / CONSIDER / PASS)
- **Multi-Document Upload**: Simultaneous analysis of pitch deck, data room pack, financials, and FAQ documents
- **MBB-Style Enhanced Analysis**: Bias-free scoring using critical institutional standards with professional chart generation

### MBB-Style Reporting
- **Match Reports**: 6-page institutional-grade documents including executive overview, analytics dashboard, top-match profiles, tier analysis, outreach strategy, and market intelligence
- **Pitch Deck Reports**: Investment analysis reports with Executive Summary, Critical Assessment, Red Flags & Risks, Scoring Matrix, Financial Analysis, and INVEST/CONSIDER/PASS recommendation
- **Auto-Generated Charts**: Inline data visualizations built programmatically for all reports
- **PDF Export**: Production-ready documents with Anker branding

### Enterprise AI Newsroom
- **Configurable News Sources**: Admin-controlled source management for industry verticals
- **AI-Curated Summaries**: Automatic article summarization and relevance scoring
- **Category Filtering**: Browse news by sector, geography, or investment stage

### Platform Intelligence
- **AI Chatbot Assistant**: Mistral-powered conversational assistant with full Anker knowledge base, conversation history, and suggested question flows
- **Interview AI Assistant**: AI-guided interview preparation with structured feedback
- **Weight Learning Loop**: Matchmaking weights automatically adjust based on deal outcomes (won/lost) and founder feedback signals

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18 | UI Framework |
| TypeScript | 5.0 | Type Safety |
| Tailwind CSS | 3.x | Utility-First Styling |
| shadcn/ui | Latest | Accessible Component Library |
| Radix UI | Latest | Headless Primitive Components |
| Framer Motion | 11.x | Animations & Transitions |
| TanStack Query | v5 | Server State Management |
| Wouter | 3.x | Lightweight Client Routing |
| React Hook Form | 7.x | Form State Management |
| Zod | 3.x | Runtime Schema Validation |
| Lucide React | Latest | Icon System |
| Embla Carousel | Latest | Touch-friendly Carousels |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Express.js | 4.x | HTTP API Server |
| TypeScript | 5.0 | Type Safety |
| Drizzle ORM | Latest | Type-safe Database ORM |
| PostgreSQL | 15 | Relational Database |
| Passport.js | Latest | Authentication Middleware |
| Zod | 3.x | Request Validation |
| Multer | Latest | File Upload Handling |
| Nanoid | Latest | Secure ID Generation |

### Build & Tooling
| Technology | Purpose |
|------------|---------|
| Vite | Frontend Build & Dev Server |
| esbuild | Server Bundling |
| tsx | TypeScript Execution |
| Drizzle Kit | Schema Migrations |

### AI & External Services
| Service | Purpose |
|---------|---------|
| Mistral Large | Deep Research, Enrichment, Chatbot, Pitch Analysis |
| Mistral Embed | 1024-dimensional Semantic Vector Embeddings |
| Hunter.io | Email Discovery & Verification |
| Folk CRM | Contact Management & CRM Sync |
| Resend | Transactional Email Delivery |
| Replit Auth | OAuth Authentication |
| Alpha Vantage | Financial Market Data |
| Finnhub | Real-time Market Data |
| Marketaux | Financial News API |

---

## System Architecture

```
╔═══════════════════════════════════════════════════════════════════════╗
║                         ANKER PLATFORM                                ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║   ┌─────────────────────────────────────────────────────────────┐     ║
║   │                  CLIENT LAYER (React 18)                    │     ║
║   │                                                             │     ║
║   │  ┌───────────┐ ┌────────────┐ ┌──────────┐ ┌───────────┐   │     ║
║   │  │  Pages    │ │ Components │ │  Hooks   │ │  TanStack │   │     ║
║   │  │ (Wouter)  │ │ (shadcn)   │ │ (custom) │ │   Query   │   │     ║
║   │  └───────────┘ └────────────┘ └──────────┘ └───────────┘   │     ║
║   └───────────────────────────┬─────────────────────────────────┘     ║
║                               │ REST/JSON over HTTPS                  ║
║   ┌───────────────────────────▼─────────────────────────────────┐     ║
║   │                  SERVER LAYER (Express.js)                  │     ║
║   │                                                             │     ║
║   │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐   │     ║
║   │  │  Routes  │ │  Storage  │ │ Services │ │  Middleware  │  │     ║
║   │  │ (REST)   │ │ (Drizzle) │ │ (AI/CRM) │ │ (Auth/RBAC) │  │     ║
║   │  └──────────┘ └───────────┘ └──────────┘ └─────────────┘   │     ║
║   │                                                             │     ║
║   │  ┌──────────────────────────────────────────────────────┐   │     ║
║   │  │              BACKGROUND WORKER                       │   │     ║
║   │  │  Atomic job claiming · 2s polling · 3 retries        │   │     ║
║   │  │  Max 2 concurrent · Enrichment · Embedding jobs      │   │     ║
║   │  └──────────────────────────────────────────────────────┘   │     ║
║   └───────────────────────────┬─────────────────────────────────┘     ║
║                               │                                       ║
║   ┌───────────────────────────▼─────────────────────────────────┐     ║
║   │              DATABASE LAYER (PostgreSQL 15)                 │     ║
║   │                                                             │     ║
║   │  users · investors · investmentFirms · startups             │     ║
║   │  deals · dealRooms · dealRoomDocuments · activityLogs       │     ║
║   │  messages · subscribers · newsArticles · systemSettings     │     ║
║   └─────────────────────────────────────────────────────────────┘     ║
║                                                                       ║
║   ┌─────────────────────────────────────────────────────────────┐     ║
║   │              EXTERNAL SERVICES                              │     ║
║   │                                                             │     ║
║   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │     ║
║   │  │ Mistral  │ │  Hunter  │ │ Folk CRM │ │    Resend    │   │     ║
║   │  │ Large +  │ │  Email   │ │ Contacts │ │  Transact.   │   │     ║
║   │  │ Embed    │ │ Discover │ │   Sync   │ │    Email     │   │     ║
║   │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │     ║
║   └─────────────────────────────────────────────────────────────┘     ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Request Lifecycle
1. **Client** makes a TanStack Query-managed fetch to an Express REST endpoint
2. **Middleware** validates session, checks RBAC, and rate-limits the request
3. **Route handler** validates request body with Zod schema
4. **Storage layer** executes Drizzle ORM query against PostgreSQL
5. For AI tasks, **Background Worker** atomically claims the job and dispatches to the appropriate AI service
6. **Response** is returned as typed JSON; TanStack Query updates the client cache

---

## Core Modules

### 1. Investor Management
**Files**: `client/src/pages/app/Investors.tsx`, `server/routes.ts`

Individual investor profiles with:
- Full contact and social information
- Investment preferences (stage, sectors, geography, check range)
- Folk CRM synchronization status and last-sync timestamp
- Activity history and deal associations
- AI-enriched data fields with confidence indicators

### 2. Investment Firms
**Files**: `client/src/pages/app/InvestmentFirms.tsx`, `server/admin-routes.ts`

Institutional investment entity tracking:
- Firm classification: VC, Family Office, PE, Angel, Hedge Fund, Corporate VC, Sovereign Wealth
- AUM ranges and typical check sizes
- Portfolio company references
- Full deep-research enrichment with web crawl data
- Investor roster linked to firm records

### 3. Startup Profiles
**Files**: `client/src/pages/app/MyStartup.tsx`

Founders build structured company profiles:
- Company description, pitch summary, and value proposition
- Founding team and advisor profiles
- Funding stage, target raise amount, and prior funding history
- Industry and sector tags with niche keyword support
- Geographic presence and target markets
- Pitch deck upload with AI parsing

### 4. Deal Pipeline
**Files**: `client/src/pages/app/DealRooms.tsx`, `server/routes.ts`

End-to-end deal lifecycle management:
- Kanban-style pipeline view across stages (Intro → Due Diligence → Term Sheet → Closed)
- Auto-created deal room for each startup on profile creation
- Document version control with upload history
- Team collaboration with inline notes and @mentions
- Milestone tracking with deadline management

### 5. Newsroom
**Files**: `client/src/pages/app/Newsroom.tsx`, `server/services/news.ts`

AI-curated industry intelligence:
- Admin-configurable source list by vertical and geography
- Automated article ingestion with AI-generated summaries
- Category tags for filtering by stage, sector, and geography
- Read/unread tracking per user session

### 6. Interview Module
**Files**: `client/src/pages/app/Interviews.tsx`

AI-assisted interview management:
- Session creation with investor name, date, and round
- AI-generated preparation briefs based on investor profile
- Live interview notes with timestamp anchoring
- Post-interview AI debrief and action item generation

---

## AI Services & Intelligence Layer

### Deep Research Engine
**File**: `server/services/mistral.ts`

The Anker deep research pipeline operates in two phases:

**Phase 1 — Web Crawl**: The crawler fetches the firm's official website and extracts raw text content, handling JavaScript-rendered pages, timeouts, and redirect chains.

**Phase 2 — AI Enrichment**: The raw web content is passed to Mistral Large with a structured prompt demanding extraction of:

```typescript
interface EnrichedFirmData {
  classification: "VC" | "Family Office" | "PE" | "Angel" | "Hedge Fund" | "Corporate VC" | "Sovereign Wealth";
  description: string;          // 2-3 sentence professional summary
  hqLocation: string;           // "City, Country" format
  website: string;
  aum: string;                  // e.g., "$500M", "€2B"
  typicalCheckSize: string;     // e.g., "$1M–$10M"
  stages: string[];             // ["Seed", "Series A", "Series B", ...]
  sectors: string[];            // ["Technology", "Healthcare", "Climate", ...]
  foundingYear: number;
  employeeRange: string;        // "10-50", "50-200", etc.
  linkedinUrl: string;
  twitterUrl: string;
  keyPersonnel: PersonProfile[];
}
```

### Semantic Embedding Service
**File**: `server/services/embedding.ts`

- **Model**: Mistral Embed (1024-dimensional dense vectors)
- **Entity Coverage**: Investors, startups, firms
- **Caching Architecture**: Entity-level cache with invalidation on record update
- **Rate Limiting**: Maximum 50 embedding calls per minute with exponential backoff
- **Usage**: Powers semantic similarity scoring in the matchmaking engine

### Background Worker
**File**: `server/services/backgroundWorker.ts`

Production-grade async job processing:
- **Atomic Job Claiming**: Database-level transaction prevents duplicate processing
- **Polling Interval**: 2-second poll cycle
- **Concurrency**: Maximum 2 simultaneous jobs
- **Retry Policy**: Up to 3 attempts per job with exponential backoff
- **Job Types**: Enrichment, embedding generation, CRM sync, batch email

### AI Chatbot
**Files**: `server/services/chatbot.ts`, `client/src/components/Chatbot.tsx`

- Mistral-powered conversational assistant
- Full Anker platform knowledge base
- Conversation history with session persistence
- Pre-built quick answers for 5 common questions
- Suggested follow-up question generation

---

## Matchmaking Engine

**Files**: `server/services/matchmaking.ts`, `server/services/accelerated-matching.ts`

### Scoring Architecture

The Anker matchmaking engine is a hybrid scoring system that combines:

1. **Multi-Factor Rule-Based Scoring** (primary signal)
2. **Jaccard Semantic Similarity** (overlap scoring)
3. **Mistral Vector Embedding Similarity** (deep semantic understanding)
4. **Deal Outcome Feedback Loop** (learned weight optimization)

### Factor Weights

| Factor | Base Weight | Description |
|--------|------------|-------------|
| Industry Alignment | 30% | Sector-level match between startup tags and investor focus |
| Stage Compatibility | 25% | Investment stage fit (Pre-Seed through Growth) |
| Geographic Fit | 20% | Country, region, and market-access alignment |
| Check Size Alignment | 15% | Funding target vs. investor typical check range |
| Investor Type Fit | 10% | Stage-appropriate investor category matching |

### Niche Industry Scoring

Anker applies domain-specific keyword expansion for specialized verticals:

**Entertainment & Film (25+ keywords)**
- Slate financing, gap financing, completion bonds
- Tax credits, pre-sales, co-production, P&A financing
- Independent film, streaming rights, distribution deals

**Real Estate (30+ keywords)**
- Construction loans, bridge financing, mezzanine debt
- Multifamily, REITs, ground-up development
- Value-add, core-plus, opportunistic strategies

**Sports (15+ keywords)**
- Sports-tech, athlete performance analytics
- Fan engagement, esports, stadium technology
- Athlete-backed funds, sports PE

### Learned Weight Optimization

The engine implements a feedback loop that adjusts weights based on deal outcomes:

| Signal | Weight Adjustment |
|--------|-----------------|
| Won Deal | +3.0× on aligned factors |
| Positive Match Feedback | +1.0× |
| Lost Deal | −1.0× on aligned factors |
| Passed Match Feedback | −0.5× |

Blending formula: `finalWeight = 0.70 × learnedWeight + 0.30 × defaultWeight`

### Match Output

- Returns up to **200 matched investors** per startup
- Each match includes: composite score, per-factor breakdown, narrative explanation, match tier classification
- **Match Insights** panel: Champion Partner profile, Portfolio Synergies, Decision Speed index, Value-Add assessment, and Probability Score

---

## Pitch Deck Analysis

**Files**: `server/services/pitch-analysis.ts`, `client/src/pages/app/PitchDeck.tsx`

### Stage-Aware Evaluation

Anker applies fundamentally different analytical frameworks based on company stage:

**Early Stage Framework** (Pre-Seed, Seed, Series A)
- Team quality and domain expertise (weighted higher)
- Market sizing and TAM/SAM/SOM articulation
- Problem-solution fit clarity
- Early traction signals (users, LOIs, pilots)
- Technology differentiation and moat potential

**Late Stage Framework** (Series B, Series C, Growth)
- Unit economics: CAC, LTV, LTV/CAC ratio, payback period
- Revenue growth rate and trajectory
- Market penetration and competitive positioning
- Path to profitability and EBITDA margins
- Management team track record and operational depth

### Multi-Document Analysis

The enhanced analysis mode accepts simultaneous upload of:
1. **Pitch Deck** (primary document)
2. **Data Room Pack** (supporting documents)
3. **Financial Model** (spreadsheets or PDF)
4. **FAQ Document** (investor Q&A)

Cross-document synthesis produces a comprehensive view that removes inconsistencies and surfaces hidden risks.

### Investment Readiness Classification

| Classification | Score Range | Meaning |
|---------------|------------|---------|
| INVEST | 80–100 | Strong candidate for immediate consideration |
| CONSIDER | 55–79 | Promising with identified gaps to address |
| PASS | 0–54 | Material weaknesses require resolution |

---

## MBB-Style Reporting

**Files**: `server/services/report-generator.ts`, `server/services/pdf-generator.ts`

Anker generates institutional-quality reports modeled on the output of top-tier management consulting firms.

### Match Report Structure (6 Pages)
1. **Executive Overview** — Mission, methodology, and key statistics
2. **Analytics Dashboard** — Score distribution, tier breakdown, geographic heat map
3. **Top Match Profiles** — Detailed cards for the top 10 investors with full rationale
4. **Tier Analysis** — A/B/C tier segmentation with group-level insights
5. **Outreach Strategy** — Sequenced contact plan with templated messaging
6. **Market Intelligence** — Competitive landscape and macro capital flow trends

### Pitch Deck Report Structure
1. **Executive Summary** — Company at a glance and analyst recommendation
2. **Critical Assessment** — Strengths and weaknesses across all evaluation dimensions
3. **Red Flags & Risks** — Material concerns ranked by severity
4. **Scoring Matrix** — Radar chart across all evaluation categories
5. **Financial Analysis** — Unit economics, projections, and benchmarking
6. **Recommendation** — INVEST / CONSIDER / PASS with conditions and next steps

---

## Deal Flow Management

### Deal Rooms
Each startup is automatically provisioned a deal room upon profile creation. Deal rooms provide:

- **Document Library**: Version-controlled uploads with preview and download
- **Collaboration Notes**: Rich-text notes with user attribution and timestamps
- **Milestone Board**: Customizable stage gates with completion tracking
- **Activity Timeline**: Immutable chronological log of all room events
- **Access Control**: Password protection for external investor sharing

### Deal Pipeline Stages
```
SOURCING → SCREENING → FIRST_MEETING → DUE_DILIGENCE → TERM_SHEET → CLOSED_WON / CLOSED_LOST
```

---

## CRM Integration

### Folk CRM Bidirectional Sync

**Configuration**: Set the `FOLK_API_KEY` environment variable.

**Import Flow**: Folk contacts → Anker investor profiles with field mapping
**Export Flow**: Anker investors + enrichment data + match scores → Folk custom fields

**Supported Custom Fields**:
- `anker_match_score` — Composite match score for a given startup
- `anker_enrichment_date` — Last AI enrichment timestamp
- `anker_classification` — Firm category (VC, Family Office, etc.)
- `anker_sectors` — Comma-separated sector tags
- `anker_stages` — Investment stage preferences

### Bulk Email Campaigns
- Personalization tokens: `{{first_name}}`, `{{firm_name}}`, `{{match_score}}`, `{{industry}}`
- Rate limiter: 50 emails/hour per user to protect sender reputation
- Delivery status tracking via Resend webhooks
- Signature verification via Svix for webhook security

---

## Admin Console

**Access**: `/admin/*` routes — requires `isAdmin` middleware and email whitelist authorization.

### Dashboard (`/admin`)
- Real-time platform statistics (users, investors, startups, deals)
- Recent activity feed
- Quick action shortcuts
- System health indicators

### User Management (`/admin/users`)
- Full user directory with registration metadata
- Toggle admin privileges
- Reset user sessions
- Assign user types (founder, investor, admin)

### Folk CRM Panel (`/admin/folk`)
- Manual and scheduled sync triggers
- Contact import with field mapping configuration
- Bulk email campaign builder
- Sync log history with error reporting

### Database Management (`/admin/database`)
- Direct entity CRUD across all tables
- Bulk import via CSV upload
- Data export (JSON, CSV)
- Relationship viewer

### Enrichment Control (`/admin/enrichment`)
- Single-firm and batch enrichment triggers
- Progress tracking with ETA and cancel capability
- Enrichment quality dashboard
- Field coverage statistics

### Activity Logs (`/admin/logs`)
- Immutable audit trail for compliance
- Filter by user, action type, entity, and date range
- Export for external compliance systems

### Admin Whitelist
Pre-authorized administrator accounts:
- `vc@philippemasindet.com`
- `masindetphilippe@gmail.com`

---

## Database Schema

### Core Tables

| Table | Primary Key | Description |
|-------|------------|-------------|
| `users` | `varchar` UUID | User accounts, auth metadata, roles, and user type |
| `sessions` | `varchar` | Passport.js session storage |
| `investors` | `serial` | Individual investor profiles with preferences |
| `investmentFirms` | `serial` | VC/PE/Family Office organizations |
| `startups` | `serial` | Founder-created company profiles |
| `contacts` | `serial` | CRM contact records linked to Folk |
| `deals` | `serial` | Deal pipeline with stage tracking |
| `dealRooms` | `serial` | Collaborative workspaces per startup |
| `dealRoomDocuments` | `serial` | Version-controlled document uploads |
| `dealRoomNotes` | `serial` | Team collaboration notes |
| `dealRoomMilestones` | `serial` | Deal timeline events |

### Support Tables

| Table | Description |
|-------|-------------|
| `messages` | Contact form submissions |
| `subscribers` | Newsletter subscriber list |
| `activityLogs` | Admin audit trail (immutable) |
| `syncLogs` | Folk CRM sync history |
| `systemSettings` | Platform configuration key-value store |
| `newsArticles` | AI-curated news items |
| `newsSources` | News source configuration |
| `backgroundJobs` | Async job queue with retry tracking |
| `matchWeights` | Learned matchmaking weights per startup |

### Production Investor Database

The platform operates a live production database of institutional investors populated through Folk CRM integration, Mercury, direct imports, and seed data. All counts are live as of March 2026.

#### Investment Firms — 10,919 Total

| Firm Classification | Count | Investor Type |
|--------------------|-------|--------------|
| Venture Capital | 1,555 | Traditional VC funds |
| Corporate VC | 203 | Strategic corporate arms |
| Family Office (all variants) | 281 | Single, multi, and general family offices |
| Pension Fund | 75 | Institutional long-horizon capital |
| Film Finance | 40 | Slate, gap, and completion bond financing |
| Private Equity | 31 | Buyout and growth equity |
| Film Production | 30 | Studios and independent production |
| Sports-Tech VC | 19 | Sports technology venture funds |
| Accelerator | 16 | Equity-for-programme programmes |
| Athlete-backed VC | 12 | Athlete-affiliated venture vehicles |
| Sports Private Equity | 6 | Sports club and franchise PE |
| Other specialist | 27 | Entertainment lenders, film distributors, alt lenders, RBF |
| Unclassified (Folk import) | ~7,630 | Pending AI enrichment classification |

#### Investment Firms — Top Geographies

| Country | Firm Count | | Country | Firm Count |
|---------|-----------|---|---------|-----------|
| United States | 1,782 | | Sweden | 157 |
| United Kingdom | 1,021 | | Poland | 143 |
| Germany | 558 | | Luxembourg | 122 |
| France | 491 | | Norway | 113 |
| Netherlands | 315 | | Austria | 98 |
| Switzerland | 286 | | Belgium | 97 |
| Spain | 251 | | Denmark | 84 |
| Italy | 177 | | Rest of World | ~5,225 |

#### Investment Firms — Top Sector Tags

| Sector | Firms | | Sector | Firms |
|--------|-------|-|--------|-------|
| AI / Machine Learning | 1,159 | | Media | 121 |
| Healthtech | 967 | | Entertainment | 120 |
| Biotech | 668 | | Film | 78 |
| Energy | 631 | | Real Estate | 50 |
| Cleantech | 621 | | Sports | 42 |
| Food & Agritech | 608 | | | |
| Mobility | 567 | | | |

#### Individual Investors — 6,720 Total

| Attribute | Value |
|-----------|-------|
| Total profiles | 6,720 |
| Sourced via Folk CRM | 6,503 (96.8%) |
| Manually seeded / imported | 217 (3.2%) |
| Profiles with verified email | 3,796 (56.5%) |

| Investor Type | Count | | Country | Count |
|--------------|-------|-|---------|-------|
| Venture Capital | 522 | | United States | 635 |
| Venture Fund | 74 | | United Kingdom | 478 |
| Angel Investor | 61 | | France | 225 |
| Pension Fund | 33 | | Switzerland | 199 |
| Other types | 30 | | Germany | 175 |

#### Startup Seed Data (Cold Start)

| Category | Count | Coverage |
|----------|-------|----------|
| Family Offices (seed) | 174 | Netherlands, UK, EU, UAE, Luxembourg |
| Movie Financiers (seed) | 78 | Studios, completion bond providers, gap financing |
| Sports Investors (seed) | 70 | Sports-tech VCs, athlete funds, PE firms |

*Seed data is applied on cold start and forms part of the broader 10,919 firm database.*

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/user` | Get current authenticated user |
| GET | `/api/login` | Initiate Replit OAuth flow |
| GET | `/api/logout` | Destroy session and redirect |
| POST | `/api/auth/register` | Register new user with credentials |

### Investors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/investors` | List all investors (paginated) |
| GET | `/api/investors/:id` | Get investor by ID |
| POST | `/api/investors` | Create investor record |
| PATCH | `/api/investors/:id` | Update investor fields |
| DELETE | `/api/investors/:id` | Delete investor |
| POST | `/api/investors/:id/sync-folk` | Sync investor to Folk CRM |

### Investment Firms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/investment-firms` | List all firms (paginated, filterable) |
| GET | `/api/investment-firms/:id` | Get firm with full enrichment data |
| POST | `/api/investment-firms` | Create firm |
| PATCH | `/api/investment-firms/:id` | Update firm |
| DELETE | `/api/investment-firms/:id` | Delete firm |

### Matchmaking
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/matching/startup/:id` | Run matching for a startup |
| POST | `/api/matching/accelerated` | Accelerated matching with vector embeddings |
| POST | `/api/matching/feedback` | Submit match outcome feedback |
| POST | `/api/matching/bulk-import` | Import matched investors to CRM |

### Startups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/startups` | List startups (admin) |
| GET | `/api/startups/:id` | Get startup profile |
| POST | `/api/startups` | Create startup profile |
| PATCH | `/api/startups/:id` | Update startup |
| POST | `/api/startups/:id/analyze-deck` | Trigger pitch deck analysis |

### Deal Rooms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deal-rooms/:id` | Get deal room |
| POST | `/api/deal-rooms/:id/documents` | Upload document |
| POST | `/api/deal-rooms/:id/notes` | Add note |
| POST | `/api/deal-rooms/:id/milestones` | Add milestone |

### Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/enrich-firm/:id` | Enrich single firm with AI |
| POST | `/api/admin/enrich-firms/batch` | Batch enrichment job |
| GET | `/api/admin/enrichment-stats` | Enrichment coverage statistics |
| POST | `/api/admin/seed/family-offices` | Trigger family office seeding |
| POST | `/api/admin/folk/import` | Import from Folk CRM |
| POST | `/api/admin/folk/bulk-email` | Send bulk email campaign |
| GET | `/api/admin/activity-logs` | Retrieve audit logs |
| GET | `/api/admin/users` | List all platform users |

### News
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/news` | Get curated news articles |
| GET | `/api/news/sources` | List configured news sources |
| POST | `/api/admin/news/sources` | Add news source (admin) |

---

## Security Model

### Authentication
- **Replit OAuth** for primary authentication with secure session cookies
- **Credential auth** for programmatic/API access with scrypt password hashing
- Session encryption via `SESSION_SECRET` environment variable
- HTTPS-only cookies in production

### Authorization
- **RBAC Middleware**: `isAdmin` guard on all `/admin/*` routes
- **Email Whitelist**: Pre-authorized admin email addresses
- **Resource Ownership**: Users can only access their own startups, deals, and documents
- **User Type Gating**: `userType` field controls dashboard features shown to founders vs. admins

### Rate Limiting
| Scope | Limit |
|-------|-------|
| Global API | 500 requests / 15 minutes |
| Authentication | 10 requests / 15 minutes |
| Password Reset | 3 requests / hour |
| Email Outreach | 50 emails / hour per user |

### Data Protection
- File uploads validated by MIME type and size
- SQL injection protection via Drizzle ORM parameterized queries
- XSS prevention through React's default escaping
- CSRF protection via SameSite cookie attributes
- Webhook signature verification via Svix for Resend events

---

## Design System

### Color Palette
| Role | Value | Usage |
|------|-------|-------|
| Background Primary | `rgb(18, 18, 18)` | Page backgrounds |
| Background Secondary | `rgb(25, 25, 25)` | Card surfaces |
| Background Tertiary | `rgb(30, 30, 30)` | Input fields, panels |
| Primary Accent | `rgb(142, 132, 247)` | CTAs, highlights, links |
| Secondary Accent | `rgb(200, 170, 130)` | Gold/premium indicators |
| Text Primary | `rgba(255, 255, 255, 0.92)` | Main body text |
| Text Secondary | `rgba(255, 255, 255, 0.55)` | Secondary labels |
| Border | `rgba(255, 255, 255, 0.08)` | Subtle separators |

### Typography
| Role | Font Family |
|------|------------|
| Primary Body | DM Sans, Outfit |
| Monospace | Fira Code, Geist Mono |
| Display / Decorative | Architects Daughter |
| Fallback | system-ui, sans-serif |

### Component System
Built on **shadcn/ui** with **Radix UI** primitives:
- Fully accessible (WAI-ARIA compliant)
- Keyboard navigable
- Screen reader compatible
- Consistent focus management

### Animation
- **Framer Motion** for page transitions, modal animations, and list entry effects
- Reduced-motion media query respected for accessibility
- Smooth 300ms transitions as standard

---

## Environment Variables

### Required Secrets
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session encryption key (min 32 chars) |
| `MISTRAL_API_KEY` | Mistral AI API key for enrichment, analysis, and embeddings |
| `FOLK_API_KEY` | Folk CRM API key for contact sync |
| `HUNTER_API_KEY` | Hunter.io API key for email discovery |

### Optional Secrets
| Variable | Description |
|----------|-------------|
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage financial data API |
| `FINNHUB_API_KEY` | Finnhub real-time market data |
| `MARKETAUX_API_KEY` | Marketaux financial news API |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Replit Object Storage bucket ID |
| `PRIVATE_OBJECT_DIR` | Private storage directory path |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public storage search paths |

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ database
- Required API keys (see [Environment Variables](#environment-variables))

### Installation

**1. Install Dependencies**
```bash
npm install
```

**2. Initialize Database**
```bash
npm run db:push
```

**3. Configure Secrets**
Set all required environment variables in your `.env` file or Replit Secrets manager.

**4. Start Development Server**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`.

### Production Build
```bash
npm run build
npm start
```

---

## Project Structure

```
anker/
├── client/                          # React 18 frontend
│   ├── src/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── ui/                  # shadcn/ui primitives
│   │   │   ├── Chatbot.tsx          # AI assistant widget
│   │   │   ├── MatchCard.tsx        # Investor match display
│   │   │   └── ReportViewer.tsx     # PDF report viewer
│   │   ├── pages/
│   │   │   ├── app/                 # Authenticated app pages
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Investors.tsx
│   │   │   │   ├── InvestmentFirms.tsx
│   │   │   │   ├── MyStartup.tsx
│   │   │   │   ├── Matching.tsx
│   │   │   │   ├── DealRooms.tsx
│   │   │   │   ├── PitchDeck.tsx
│   │   │   │   ├── Newsroom.tsx
│   │   │   │   └── Interviews.tsx
│   │   │   ├── admin/               # Admin console pages
│   │   │   │   ├── AdminDashboard.tsx
│   │   │   │   ├── AdminUsers.tsx
│   │   │   │   ├── AdminFolk.tsx
│   │   │   │   ├── AdminDatabase.tsx
│   │   │   │   └── AdminLogs.tsx
│   │   │   └── AuthLanding.tsx      # Login / Register
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # Utilities, queryClient, helpers
│   │   └── framer/                  # Framer-exported design components
│   └── index.html
│
├── server/                          # Express.js backend
│   ├── services/                    # Business logic
│   │   ├── mistral.ts               # AI enrichment & chatbot
│   │   ├── embedding.ts             # Vector embedding service
│   │   ├── matchmaking.ts           # Core matchmaking algorithm
│   │   ├── accelerated-matching.ts  # Embedding-enhanced matching
│   │   ├── backgroundWorker.ts      # Async job processor
│   │   ├── web-crawler.ts           # Website content extraction
│   │   ├── folk.ts                  # Folk CRM integration
│   │   ├── hunter.ts                # Email discovery
│   │   ├── profile-enrichment.ts    # Founder profile enrichment
│   │   ├── pitch-analysis.ts        # Pitch deck analysis
│   │   ├── report-generator.ts      # MBB-style report generation
│   │   ├── news.ts                  # Newsroom aggregation
│   │   └── chatbot.ts               # AI chatbot service
│   ├── middleware/
│   │   ├── auth.ts                  # Authentication middleware
│   │   ├── security.ts              # Rate limiting & security
│   │   └── rbac.ts                  # Role-based access control
│   ├── seeds/                       # Database seed files
│   │   ├── family-offices.ts        # 174 family office records
│   │   ├── movie-financiers.ts      # 78 film finance records
│   │   └── sports-investors.ts      # 70 sports investor records
│   ├── routes.ts                    # Main API routes
│   ├── admin-routes.ts              # Admin API routes
│   ├── storage.ts                   # Database abstraction layer
│   └── index.ts                     # Server entry point
│
├── shared/                          # Shared types (frontend + backend)
│   ├── schema.ts                    # Drizzle schema + Zod types
│   └── routes.ts                    # API route definitions
│
├── docs/                            # Documentation
│   └── DATABASE_BACKUP_GUIDE.md
│
└── attached_assets/                 # User-uploaded files
```

---

## Deployment

### Replit Deployment (Recommended)
1. Ensure all environment secrets are configured in Replit Secrets
2. Run `npm run db:push` to synchronize the schema
3. Click **Deploy** in the Replit interface
4. The platform auto-builds and serves via the production Express server

### Manual Production Build
```bash
npm run build
npm start
```

### Database Backup
- **Point-in-Time Restore**: Available via Replit's managed PostgreSQL
- **Manual Backup**: `pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql`
- **Restore**: `psql $DATABASE_URL < backup_YYYYMMDD.sql`

---

## License & Support

**License**: Proprietary — Anker Consulting. All rights reserved.

**Support**:
- Primary: `vc@philippemasindet.com`
- In-platform: Use the AI chatbot in the bottom-right corner for instant answers

---

*Anker — Precision capital intelligence for the next generation of founders.*
