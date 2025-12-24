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
  - `messages` - Contact form submissions
  - `subscribers` - Newsletter email subscriptions
- **Migrations**: Managed via drizzle-kit (`db:push` command)
- **Type Safety**: Drizzle-Zod generates insert schemas from table definitions

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