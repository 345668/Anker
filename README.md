# 1000VC - AI-Powered Capital Matching Platform

> **Anker Consulting** | Enterprise-grade investor-founder matchmaking with AI enrichment, CRM integration, and deal flow management.

[![Built on Replit](https://img.shields.io/badge/Built%20on-Replit-orange)](https://replit.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791)](https://www.postgresql.org/)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Platform Architecture](#platform-architecture)
- [Core Modules](#core-modules)
- [AI Services](#ai-services)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Admin Console](#admin-console)
- [Integrations](#integrations)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Overview

1000VC is a comprehensive venture capital consulting platform designed to connect founders with the right investors. The platform leverages AI-powered data enrichment, automated web crawling, and intelligent matchmaking algorithms to streamline the fundraising process.

### Mission
Democratize access to venture capital by providing founders with institutional-grade investor intelligence and matchmaking capabilities.

### Inner Circle Membership (Tesseract)
Premium membership tier offering exclusive access to curated investor networks, priority matching, and personalized deal support.

---

## Key Features

### Investor Discovery & Matching
- **AI-Powered Matchmaking**: Multi-factor scoring algorithm weighing industry alignment, stage compatibility, geography, and check size
- **Niche Industry Specialization**: Enhanced matching for Entertainment/Film, Real Estate, and Sports sectors
- **Score Breakdown**: Transparent matching with individual factor scores and visual progress bars
- **Database of 500+ Investors**: Pre-seeded with family offices, movie financiers, sports investors, and VCs

### Deep Research & Enrichment
- **Web Crawling**: Automated extraction of investor data from official websites
- **AI Analysis**: Mistral Large model for intelligent data inference and classification
- **Hunter Integration**: Email discovery and verification for investor contacts
- **Batch Processing**: Process hundreds of firms with progress tracking and cancel capability

### Deal Flow Management
- **Deal Rooms**: Collaborative spaces for managing active deals
- **Document Management**: Secure storage for pitch decks, term sheets, and due diligence materials
- **Milestone Tracking**: Visual timeline of deal progress
- **Activity Logs**: Complete audit trail for compliance

### CRM Integration
- **Folk CRM Sync**: Bidirectional synchronization with Folk CRM
- **Contact Management**: Unified view of all investor relationships
- **Bulk Operations**: Mass email campaigns with personalization tokens

### AI-Powered Features
- **Pitch Deck Analysis**: Extract key metrics and founder profiles from uploaded decks
- **Chatbot Assistant**: Instant answers to platform questions
- **Profile Enrichment**: AI-generated founder and company profiles
- **News Aggregation**: Automated industry news curation

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI Framework |
| TypeScript | Type Safety |
| Tailwind CSS | Styling |
| shadcn/ui | Component Library |
| Framer Motion | Animations |
| TanStack Query | Server State |
| Wouter | Routing |
| React Hook Form | Form Handling |
| Zod | Validation |

### Backend
| Technology | Purpose |
|------------|---------|
| Express.js | API Server |
| TypeScript | Type Safety |
| Drizzle ORM | Database ORM |
| PostgreSQL | Database |
| Passport.js | Authentication |

### AI & External Services
| Service | Purpose |
|---------|---------|
| Mistral AI | Data Enrichment & Analysis |
| Hunter.io | Email Discovery |
| Folk CRM | Contact Management |
| Resend | Transactional Email |
| Replit Auth | Authentication |

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Required API keys (see [Environment Variables](#environment-variables))

### Installation

1. **Clone and Install Dependencies**
```bash
npm install
```

2. **Set Up Database**
```bash
npm run db:push
```

3. **Configure Environment Variables**
Create a `.env` file with required secrets (see [Environment Variables](#environment-variables))

4. **Start Development Server**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

### Production Build
```bash
npm run build
npm start
```

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                          │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌─────────────────┐   │
│  │  Pages  │  │Components│  │  Hooks  │  │  TanStack Query │   │
│  └─────────┘  └──────────┘  └─────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER (Express.js)                        │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Routes  │  │  Storage  │  │ Services │  │  Middleware  │   │
│  └──────────┘  └───────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Mistral  │  │  Hunter  │  │ Folk CRM │  │   Resend     │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATABASE (PostgreSQL)                      │
│  ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌──────────────┐    │
│  │  Users   │  │ Investors │  │  Deals  │  │   Startups   │    │
│  └──────────┘  └───────────┘  └─────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Modules

### 1. Investor Management
**Location**: `client/src/pages/app/Investors.tsx`, `server/routes.ts`

Manage individual investor profiles with:
- Contact information and social links
- Investment preferences (stage, sectors, check size)
- Folk CRM synchronization
- Activity history

### 2. Investment Firms
**Location**: `client/src/pages/app/InvestmentFirms.tsx`, `server/admin-routes.ts`

Track investment organizations:
- Firm classification (VC, Family Office, PE, Angel)
- AUM and typical check sizes
- Portfolio companies
- Deep Research enrichment

### 3. Startup Profiles
**Location**: `client/src/pages/app/MyStartup.tsx`

Founders create and manage:
- Company information and pitch
- Team profiles
- Funding requirements
- Pitch deck uploads

### 4. Matchmaking Engine
**Location**: `server/services/matchmaking.ts`, `server/services/accelerated-matching.ts`

Multi-factor scoring algorithm:
| Factor | Weight | Description |
|--------|--------|-------------|
| Industry | 30% | Sector alignment with investor focus |
| Stage | 25% | Investment stage compatibility |
| Location | 20% | Geographic fit and market access |
| Check Size | 15% | Alignment with funding target |
| Investor Type | 10% | Stage-appropriate investor type |

**Niche Industry Support**:
- **Entertainment/Film**: 25+ keywords including slate financing, gap financing, completion bonds, tax credits
- **Real Estate**: 30+ keywords including construction loans, bridge financing, multifamily, REITs
- **Sports**: Sports-tech, athlete performance, fan engagement, esports

### 5. Deal Rooms
**Location**: `client/src/pages/app/DealRooms.tsx`

Collaborative deal management:
- Document sharing and version control
- Team notes and comments
- Milestone tracking
- Activity timeline

---

## AI Services

### Deep Research (Mistral AI)
**Location**: `server/services/mistral.ts`

AI-powered data enrichment for investment firms:

```typescript
// Fields enriched by Deep Research
{
  classification: "VC" | "Family Office" | "PE" | "Angel" | ...,
  description: string,      // 2-3 sentence professional summary
  hqLocation: string,       // "City, Country" format
  website: string,
  aum: string,              // e.g., "$500M", "€2B"
  typicalCheckSize: string, // e.g., "$1M-$10M"
  stages: string[],         // ["Seed", "Series A", ...]
  sectors: string[],        // ["Technology", "Healthcare", ...]
  foundingYear: number,
  employeeRange: string,
  linkedinUrl: string,
  twitterUrl: string
}
```

### Web Crawler
**Location**: `server/services/web-crawler.ts`

Automated website content extraction:
- Fetches and parses investor websites
- Extracts structured company information
- Feeds real data to AI for accurate enrichment
- Handles timeouts and error recovery

### Hunter Integration
**Location**: `server/services/hunter.ts`

Email discovery and verification:
- Domain-based email search
- Email verification
- LinkedIn profile discovery
- Company information lookup

### Profile Enrichment
**Location**: `server/services/profile-enrichment.ts`

- Social media URL extraction
- AI-powered founder profile generation
- Website analysis for team information
- Pitch deck content extraction

### Chatbot
**Location**: `server/services/chatbot.ts`, `client/src/components/Chatbot.tsx`

Platform assistant with:
- Built-in knowledge base
- Conversation history
- Suggested questions
- Quick answers

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts with auth and roles |
| `sessions` | Authentication sessions |
| `investors` | Individual investor profiles |
| `investmentFirms` | VC/PE/Family Office organizations |
| `startups` | Founder-created companies |
| `contacts` | CRM contact records |
| `deals` | Deal pipeline tracking |
| `dealRooms` | Collaboration spaces |
| `dealRoomDocuments` | Uploaded documents |
| `dealRoomNotes` | Team notes |
| `dealRoomMilestones` | Deal timeline |

### Support Tables

| Table | Description |
|-------|-------------|
| `messages` | Contact form submissions |
| `subscribers` | Newsletter subscriptions |
| `activityLogs` | Admin audit trail |
| `syncLogs` | CRM sync history |
| `systemSettings` | Platform configuration |
| `newsArticles` | Aggregated news |
| `newsSources` | News source configuration |

### Database Seeding

Auto-seeded data on every deployment:
- **174 Family Offices**: Netherlands, UK, EU, UAE, Luxembourg
- **78 Movie Financiers**: Studios, completion bond providers, gap financing
- **70+ Sports Investors**: Sports-tech VCs, athlete-backed funds, PE firms

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/user` | Get current user |
| GET | `/api/login` | Initiate Replit Auth |
| GET | `/api/logout` | End session |

### Investors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/investors` | List all investors |
| GET | `/api/investors/:id` | Get investor by ID |
| POST | `/api/investors` | Create investor |
| PATCH | `/api/investors/:id` | Update investor |
| DELETE | `/api/investors/:id` | Delete investor |

### Investment Firms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/investment-firms` | List all firms |
| GET | `/api/investment-firms/:id` | Get firm by ID |
| POST | `/api/investment-firms` | Create firm |
| PATCH | `/api/investment-firms/:id` | Update firm |
| DELETE | `/api/investment-firms/:id` | Delete firm |

### Matching
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/matching/startup/:id` | Get matches for startup |
| POST | `/api/matching/accelerated` | Run accelerated matching |

### Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/enrich-firm/:id` | Enrich single firm |
| POST | `/api/admin/enrich-firms/batch` | Batch enrichment |
| GET | `/api/admin/enrichment-stats` | Enrichment statistics |
| POST | `/api/admin/seed/family-offices` | Trigger seeding |

---

## Admin Console

Access: `/admin/*` routes (requires admin role)

### Features

1. **Dashboard** (`/admin`)
   - Platform statistics
   - Recent activity
   - Quick actions

2. **User Management** (`/admin/users`)
   - View all users
   - Toggle admin status
   - Manage roles

3. **Folk CRM** (`/admin/folk`)
   - Import contacts
   - Trigger enrichment
   - Bulk email campaigns
   - Sync to Folk

4. **Database** (`/admin/database`)
   - Entity management
   - Bulk operations
   - Data export

5. **Backups** (`/admin/backups`)
   - Create snapshots
   - Download backups
   - Preview data

6. **Activity Logs** (`/admin/logs`)
   - Audit trail
   - Action history
   - User activity

### Admin Emails
Pre-authorized admin accounts:
- `vc@philippemasindet.com`
- `masindetphilippe@gmail.com`

---

## Integrations

### Folk CRM
Bidirectional sync with Folk CRM for contact management:
- Import contacts from Folk to local database
- Push enriched data back to Folk custom fields
- Bulk email campaigns with personalization

**Configuration**: Set `FOLK_API_KEY` environment variable

### Resend Email
Transactional email delivery for:
- Bulk investor outreach
- Notification emails
- System alerts

**Configuration**: Automatically configured via Replit integration

### Replit Auth
OAuth-based authentication using Replit accounts:
- Secure session management
- Role-based access control
- Admin authorization

---

## Environment Variables

### Required Secrets
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session encryption key |
| `MISTRAL_API_KEY` | Mistral AI API key |
| `FOLK_API_KEY` | Folk CRM API key |
| `HUNTER_API_KEY` | Hunter.io API key |

### Optional Secrets
| Variable | Description |
|----------|-------------|
| `ALPHA_VANTAGE_API_KEY` | Financial data API |
| `FINNHUB_API_KEY` | Market data API |
| `MARKETAUX_API_KEY` | News API |

---

## Deployment

### Replit Deployment
1. Push code to Replit
2. Configure environment secrets
3. Run database migrations: `npm run db:push`
4. Click "Deploy" to publish

### Production Build
```bash
# Build frontend and backend
npm run build

# Start production server
npm start
```

### Database Backup
For production database backups:
- Use Replit's Point-in-Time Restore
- Or manual pg_dump: `pg_dump $DATABASE_URL > backup.sql`

---

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and helpers
│   │   └── framer/         # Framer-exported components
│   └── index.html
├── server/                 # Express backend
│   ├── services/           # Business logic services
│   │   ├── mistral.ts      # AI enrichment
│   │   ├── web-crawler.ts  # Website crawling
│   │   ├── matchmaking.ts  # Investor matching
│   │   ├── folk.ts         # CRM integration
│   │   └── chatbot.ts      # AI assistant
│   ├── seeds/              # Database seed data
│   ├── routes.ts           # API routes
│   ├── admin-routes.ts     # Admin API routes
│   └── storage.ts          # Database operations
├── shared/                 # Shared types and schemas
│   ├── schema.ts           # Drizzle database schema
│   └── routes.ts           # API route definitions
├── docs/                   # Documentation
└── attached_assets/        # Uploaded files
```

---

## Design System

### Theme
- **Mode**: Strict dark theme
- **Background**: `rgb(18,18,18)`, `rgb(25,25,25)`, `rgb(30,30,30)`
- **Primary Accent**: Purple `rgb(142,132,247)`
- **Secondary Accent**: Gold `rgb(200,170,130)`

### Typography
- **Primary**: DM Sans, Outfit
- **Monospace**: Fira Code, Geist Mono
- **Display**: Architects Daughter

### Components
Built on shadcn/ui with Radix UI primitives for accessibility and consistency.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

Proprietary - Anker Consulting

---

## Support

For support, contact:
- Email: vc@philippemasindet.com
- Platform: Use the in-app chatbot for quick answers
