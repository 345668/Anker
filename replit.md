# Anker - Venture Capital Website

## Overview
Anker is a modern venture capital firm website featuring a React frontend and Express backend. It showcases portfolio companies, team members, newsroom articles, and offers contact/newsletter functionalities. The platform is designed with premium aesthetics, smooth animations, and integrates Framer-exported UI components alongside shadcn/ui. Beyond its public-facing features, Anker includes a robust admin console for managing data, integrating with Folk CRM, and employing AI for deep research, data enrichment of investment firms (especially family offices), and an advanced investor-founder matchmaking engine. The project aims to streamline operations for venture capital firms, enhance data quality, and improve the efficiency of deal sourcing and matching.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **Styling**: Tailwind CSS with custom themes; shadcn/ui and Framer-exported components.
- **Animations**: Framer Motion.
- **State Management**: TanStack React Query.
- **Forms**: React Hook Form with Zod.
- **Build**: Vite.

### Backend
- **Framework**: Express.js with TypeScript.
- **API**: RESTful, defined with Zod schemas.
- **Database**: PostgreSQL with Drizzle ORM; shared schema (`shared/schema.ts`).

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL.
- **Key Tables**: `users`, `investors`, `investmentFirms`, `deals`, `startups`, `messages`, `subscribers`, `activityLogs`, `systemSettings`, `dealRooms`, `dealRoomDocuments`.
- **Type Safety**: Drizzle-Zod for schema-derived insert schemas.
- **Data Room 1:1 Relationship**: Each startup has exactly one data room (`dealRooms.startupId` with unique constraint). Data rooms are auto-created when startups are created.

### Admin Console
- **Access**: Admin-only via `isAdmin` middleware and email whitelist.
- **Features**: Data import (Folk CRM sync, CSV), user management, system settings, analytics, database entity management, activity logs.

### AI/Data Enrichment & Matchmaking
- **Folk CRM Integration**: Bidirectional sync for investor records, bulk operations for enrichment and email campaigns.
- **Deep Research & Data Enrichment**: AI-powered (Mistral Large) enrichment for investment firms, specifically family offices, to fill missing data points like AUM, check size, sectors, etc.
- **Database Seeding**: Auto-seeding for family offices, movie financiers, and sports investors.
- **Niche Industry Matching**: Advanced alias matching for domains like Entertainment/Film, Real Estate, and Sports.
- **Investor-Founder Matchmaking**:
    - **Baseline Algorithm**: Multi-factor scoring (Industry, Stage, Location, Check Size, Investor Type).
    - **Enhanced Matchmaking Engine**: Hybrid approach combining hard constraints, semantic compatibility (Jaccard similarity), economic fit, geographic practicality, investor behavior, and contextual multipliers. Includes domain-specific scoring for Film/Movies and Real Estate.
    - **Document-Enhanced Matching**: Normal matchmaking now uses data room documents to extract additional industry keywords for improved investor matching.
    - **Deal Outcome Feedback Loop**: Automatically updates matchmaking weights based on "won" or "lost" deals.
- **Profile Enrichment**: AI-powered extraction and generation of founder profiles, social media, and website crawling.
- **AI Chatbot**: Provides quick answers using built-in platform documentation.

### Design Patterns
- **Shared Types**: Centralized schema and route definitions for frontend and backend.
- **API Contract**: Defined routes with path, method, input, and response schemas.
- **Storage Abstraction**: Database operations encapsulated in a storage interface.

### Build System
- **Development**: `tsx` with Vite dev server.
- **Production**: Vite for frontend, `esbuild` for server bundling.

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

## Networking Component Audit (January 2026)

### Critical Fixes
1. **N-I2 - Server-Side Warm Intro API**: Implemented `/api/introductions` endpoints
   - `GET /api/introductions` - List user's intro requests
   - `POST /api/introductions` - Create new intro request
   - `POST /api/introductions/:id/send` - Send intro request
   - `PATCH /api/introductions/:id` - Update intro request
2. **N-I3 - Introduction Workflow States**: Created `introductions` table with states:
   - draft, pending_review, sent_to_connector, connector_approved, sent_to_target, target_responded, declined, completed
3. **N-I1 - Front-end Connected**: Networking.tsx now has:
   - Investor search dropdown connected to `/api/introductions/search-investors`
   - AI Generate button connected to `/api/introductions/generate`
   - Send Request button connected to create introduction API
4. **N-I2 (AI) - AI Intro Generation**: `POST /api/introductions/generate` endpoint
   - Uses Mistral Large to generate personalized intro messages
   - Context includes startup, investor, firm, and match data
   - Returns message, subject, and confidence score
5. **N-S2 - Server-Side Search**: Refactored Search.tsx to use server-side search
   - Uses debounced query (300ms) to prevent excessive API calls
   - Investors and firms use `/api/investors?search=` and `/api/firms?search=` server-side filtering
   - Queries are conditionally enabled based on active tab for efficiency
   - Results limited to 20 items per category for pagination support

## Audit Implementation Status (January 2026)

### Critical Fixes
1. **O-W1 - Outreach API**: `POST /api/outreaches` endpoint fully implemented with validation
2. **O-W2 - Resend Webhook Handler**: `POST /api/webhooks/resend` implemented with Svix signature verification for email open/click/bounce tracking
3. **D-C1 - Transactional Outreach**: Atomic outreach creation + email sending via `POST /api/outreach/create-and-send`

### High Priority Fixes
4. **M-L4 - Negative Signal Learning**: `adjustWeightsFromFeedback()` now incorporates:
   - Lost deals: -1 weight multiplier
   - Passed matches: -0.5 weight multiplier
   - 30% penalty factor applied to over-weighted factors in negative signals
5. **M-L1 - Data Quality Penalty**: Matches with score ≤0.5 and !matched flag receive penalty multiplier (0.5x-1.0x)

### Medium Priority Fixes
6. **O-L1 - Verification Bypass Removed**: `verifyFirst` parameter removed from `sendOutreachEmail` - email verification is now mandatory
7. **M-L5 - Hard Constraint Thresholds**: 
   - Check size overlap: 10% → 25% minimum
   - Stage distance: max 2 → max 1 level apart

### Outreach Email System Improvements (January 2026)
8. **E-T3 - HTML Sanitization**: Email templates sanitized with DOMPurify before storing and sending
   - Allowed tags: headings, basic formatting, links, images, lists, tables
   - Blocked: script, style, svg, math, iframe, form elements
9. **E-R3 - User-Level Rate Limiting**: Outreach endpoints rate limited to 50 emails/hour/user
   - Protects domain reputation and prevents sudden traffic spikes
   - Uses user ID as key (falls back to IP if unauthenticated)
10. **E-T2 - Expanded Personalization Variables**: Now supports 16 template variables
    - Recipient: `{{name}}`, `{{firstName}}`, `{{lastName}}`, `{{company}}`
    - Startup: `{{startupName}}`, `{{startupIndustry}}`, `{{founderName}}`
    - Investor: `{{investorFirm}}`, `{{investorTitle}}`, `{{investorFirstName}}`, `{{investorLastName}}`
    - Deal: `{{dealTitle}}`, `{{targetAmount}}`, `{{stage}}`, `{{location}}`, `{{meetingLink}}`
    - Endpoint: `GET /api/emailTemplates/variables` returns all supported variables
11. **E-S4 - Resend Error Code Mapping**: Enhanced error messages with retry hints
12. **E-T4 - Plain Text Fallback**: Auto-generated from HTML if not provided

### Previously Completed
- **Type Safety**: Fixed `(contact as any).pipelineStage` cast in Dashboard API
- **Auto Contact Creation**: Outreach creation automatically creates CRM contacts
- **Deal→Matchmaking Feedback Loop**: `processDealOutcomeFeedback()` updates matches on deal close
- **Activity Logging**: Comprehensive logging for deals, contacts, matches, outreaches

### Match Generation API
- **Endpoint**: `POST /api/matches/generate`
- **Flow**: Calls `adjustWeightsFromFeedback()` → `generateMatchesForStartup()` → `saveMatchResults()`

## Production Configuration

### Required Environment Variables

#### Resend Email Webhook Security
```
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```
**Purpose**: Verifies webhook signatures from Resend to prevent spoofed email events.

**How to configure**:
1. Go to [Resend Dashboard](https://resend.com/webhooks)
2. Create a new webhook endpoint pointing to: `https://your-domain.com/api/webhooks/resend`
3. Select events: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
4. Copy the signing secret (starts with `whsec_`)
5. Add to Replit Secrets as `RESEND_WEBHOOK_SECRET`

**Security Notes**:
- In production (`NODE_ENV=production`), requests without valid signatures are rejected with 401
- In development, webhook events are processed without verification (warning logged)
- Uses official Svix library for signature verification

### Activity Logging Coverage
- **Deals**: Stage changes, status changes logged with before/after values
- **Contacts**: Pipeline stage and status changes logged
- **Matches**: Status changes logged with investor/firm metadata
- **Outreaches**: Creation logged with subject and targets

### RBAC (Role-Based Access Control)
- **Current Implementation**: 
  - `isAdmin` middleware for admin routes (email whitelist)
  - Resource ownership checks (ownerId === userId)
  - `userType` (founder/investor) for dashboard customization
- **Future Enhancements**: 
  - Granular permissions for deal rooms (view/edit/admin levels)
  - Team/organization-level access control
  - Investor-specific view permissions for shared documents