# Anker - Venture Capital Website

## Overview

Anker is a modern venture capital firm website built with a React frontend and Express backend. The application showcases portfolio companies, team members, newsroom articles, and provides contact/newsletter functionality. It features premium design aesthetics with smooth animations, custom cursor effects, and Framer-exported UI components integrated alongside shadcn/ui.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS with custom theme configuration and CSS variables
- **UI Components**: 
  - shadcn/ui component library (Radix UI primitives with custom styling)
  - Framer-exported components via Unframer integration (`client/src/framer/`)
- **Animations**: Framer Motion for page transitions and micro-interactions
- **State Management**: TanStack React Query for server state
- **Forms**: React Hook Form with Zod resolver for validation
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Server**: HTTP server with development (Vite middleware) and production (static serving) modes
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for input validation
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Shared schema between frontend and backend (`shared/schema.ts`)

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Tables**: 
  - `users` - User accounts with auth, roles (isAdmin), and profile data
  - `sessions` - Authentication sessions (Replit Auth)
  - `messages` - Contact form submissions
  - `subscribers` - Newsletter email subscriptions
  - `startups` - Founder-created companies
  - `investors` - Individual investor profiles (with Folk CRM integration)
  - `investmentFirms` - VC/Angel firms
  - `contacts` - CRM contact management
  - `deals` - Deal pipeline tracking
  - `dealRooms` - Collaboration spaces for deals
  - `dealRoomDocuments/Notes/Milestones` - Deal room content
  - `activityLogs` - Admin audit trail
  - `syncLogs` - Folk CRM sync history
  - `systemSettings` - Platform configuration
- **Migrations**: Managed via drizzle-kit (`db:push` command)
- **Type Safety**: Drizzle-Zod generates insert schemas from table definitions

### Admin Console
- **Access Control**: Admin-only via `isAdmin` middleware and email whitelist
- **Admin Emails**: vc@philippemasindet.com, masindetphilippe@gmail.com
- **Routes**: `/admin/*` protected endpoints in `server/admin-routes.ts`
- **Features**:
  - Data Import: Folk CRM sync, CSV import (planned)
  - User Management: View/edit users, toggle admin status
  - System Settings: Integration configuration
  - Analytics: Platform-wide metrics and statistics
  - Database: Entity management with bulk operations
  - Activity Logs: Audit trail for admin actions

### Folk CRM Integration
- **API Key**: Stored as `FOLK_API_KEY` environment secret
- **Service**: `server/services/folk.ts` handles API communication
- **Sync**: Bidirectional sync capability with investor records
- **Tracking**: `folkId` field on investors, `syncLogs` table for history
- **Bulk Operations** (Admin UI at `/admin/folk`):
  - **Trigger Folk Enrichment**: Updates contacts to prompt Folk's native Dropcontact enrichment (runs as background job)
  - **Import to DB**: Imports selected Folk contacts to local database
  - **Bulk Email**: Send personalized email campaigns with {{firstName}}, {{name}}, {{company}} tokens
  - **Sync to Folk**: Push enriched data back to Folk CRM custom fields
  - **Range Selection**: Supports first N, last N, or range (start-end) selection

### Database Seeding
- **Auto-seeding**: Startup seeds run automatically on every server start/deployment
- **Idempotent**: Seeds skip existing records, only inserting new data
- **Family Offices**: 174 family offices from Netherlands, UK, EU, UAE, Luxembourg pre-seeded
- **Seed Files**: `server/seeds/family-offices.ts` contains family office data
- **Manual Trigger**: Admin endpoint `POST /api/admin/seed/family-offices`
- **Production Sync**: Seeds run on deployment to sync data to production database

### Investor-Founder Matchmaking
- **Scoring Algorithm**: Multi-factor scoring with weighted criteria:
  - Industry Match (30%): Sector alignment with investor focus
  - Stage Match (25%): Investment stage compatibility
  - Location Match (20%): Geographic fit and market access
  - Check Size Match (15%): Alignment with typical investment range
  - Investor Type (10%): Fit between stage and investor type
- **Threshold**: All matches above 20% are displayed for broader discovery
- **Score Breakdown**: UI shows individual factor scores with visual progress bars
- **Service Files**: `server/services/matchmaking.ts`, `server/services/accelerated-matching.ts`

### Profile Enrichment
- **Social Media Extraction**: Extract LinkedIn, Twitter/X, GitHub URLs from text
- **Founder Enrichment**: AI-powered profile generation based on founder name and company
- **Website Crawling**: AI analysis of startup websites for team and product info
- **Pitch Deck Extraction**: Extract founder profiles from uploaded pitch decks
- **Service File**: `server/services/profile-enrichment.ts`

### AI Chatbot
- **Purpose**: Quick answers to common questions about Anker platform
- **Knowledge Base**: Built-in platform documentation and FAQs
- **Features**: Conversation history, suggested follow-up questions, quick answers
- **UI Component**: Floating chatbot button on all pages (`client/src/components/Chatbot.tsx`)
- **API Routes**: `POST /api/chatbot/chat`, `GET /api/chatbot/quick-answers`
- **Service File**: `server/services/chatbot.ts`

### Key Design Patterns
- **Shared Types**: Schema and route definitions in `shared/` directory are consumed by both frontend and backend
- **API Contract**: Routes defined with path, method, input schema, and response schemas in `shared/routes.ts`
- **Storage Abstraction**: Database operations wrapped in storage interface (`server/storage.ts`)
- **Custom Hooks**: Data mutations wrapped in React hooks (`use-messages.ts`, `use-subscribers.ts`)

### Build System
- **Development**: `tsx` runs TypeScript directly with Vite dev server
- **Production**: 
  - Vite builds frontend to `dist/public`
  - esbuild bundles server with selective dependency bundling for faster cold starts
  - Output: `dist/index.cjs`

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: PostgreSQL session store (available but sessions not currently implemented)

### UI/Styling
- **Google Fonts**: DM Sans, Outfit, Fira Code, Geist Mono, Architects Daughter
- **Framer/Unframer**: Design components exported from Framer with custom CSS variables

### Third-Party Libraries
- **Radix UI**: Complete primitive component set for accessible UI elements
- **Lucide React**: Icon library
- **date-fns**: Date formatting utilities
- **embla-carousel-react**: Carousel functionality
- **vaul**: Drawer component
- **cmdk**: Command palette component
- **react-day-picker**: Calendar/date picker

### Development Tools
- **@replit/vite-plugin-runtime-error-modal**: Error overlay for development
- **@replit/vite-plugin-cartographer**: Replit-specific development tooling