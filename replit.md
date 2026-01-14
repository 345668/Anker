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
- **Key Tables**: `users`, `investors`, `investmentFirms`, `deals`, `startups`, `messages`, `subscribers`, `activityLogs`, `systemSettings`.
- **Type Safety**: Drizzle-Zod for schema-derived insert schemas.

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

## Audit Implementation Status

### Completed Recommendations
1. **Type Safety**: Fixed `(contact as any).pipelineStage` cast in Dashboard API - now uses proper typed access.
2. **Auto Contact Creation**: Outreach creation now automatically creates CRM contacts for new investors/firms.
3. **Deal→Matchmaking Feedback Loop**: `processDealOutcomeFeedback()` updates matches when deals close (won/lost).
4. **Activity Logging**: Added comprehensive logging for deals, contacts, matches, and outreaches.

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