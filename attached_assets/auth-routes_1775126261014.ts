/**
 * server/auth-routes.ts
 *
 * Unified auth for Anker. Replaces Replit-Auth-only setup.
 * All packages are ALREADY in package.json:
 *   passport, passport-local, bcryptjs, google-auth-library,
 *   openid-client, express-session, connect-pg-simple
 *
 * Additional installs needed:
 *   npm install passport-google-oauth20 passport-github2 passport-linkedin-oauth2
 *   npm install -D @types/passport-google-oauth20 @types/passport-github2
 *
 * Mount in server/routes.ts:
 *   import authRoutes from "./auth-routes.js";
 *   app.use("/api/auth", authRoutes);
 */

import express from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as LinkedInStrategy } from "passport-linkedin-oauth2";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { users } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";

const router = express.Router();
const APP_URL = process.env.APP_URL || "http://localhost:5000";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function findUserByEmail(email: string) {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

async function findUserById(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

async function upsertOAuthUser(
  provider: "google" | "github" | "linkedin",
  profile: any
) {
  const email =
    profile.emails?.[0]?.value ||
    `${provider}-${profile.id}@oauth-anker.internal`;

  const [firstName, ...rest] =
    (profile.displayName || profile.username || "User").split(" ");
  const lastName = rest.join(" ") || "";
  const avatarUrl =
    profile.photos?.[0]?.value ||
    profile._json?.avatar_url ||
    null;

  // Check existing by provider+id first (fastest)
  let existing = await db.query.users.findFirst({
    where: and(
      eq(users.provider, provider),
      eq(users.providerId, profile.id)
    ),
  });

  if (existing) return existing;

  // Check by email (link to existing local account)
  existing = await findUserByEmail(email);
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ provider, providerId: profile.id, avatarUrl: avatarUrl || existing.avatarUrl })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  // Create new
  const [created] = await db
    .insert(users)
    .values({
      email,
      firstName,
      lastName,
      avatarUrl,
      provider,
      providerId: profile.id,
      userType: "founder",
      onboardingCompleted: false,
      onboardingStep: 0,
    })
    .returning();
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Passport strategies
// ─────────────────────────────────────────────────────────────────────────────

// Local (email + password)
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await findUserByEmail(email);
        if (!user || !user.passwordHash) {
          return done(null, false, { message: "Invalid email or password." });
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Invalid email or password." });
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

// Google
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: `${APP_URL}/api/auth/google/callback`,
        scope: ["profile", "email"],
      },
      async (_at, _rt, profile, done) => {
        try { done(null, await upsertOAuthUser("google", profile)); }
        catch (err) { done(err as Error); }
      }
    )
  );
}

// GitHub
if (process.env.GITHUB_CLIENT_ID) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        callbackURL: `${APP_URL}/api/auth/github/callback`,
        scope: ["user:email"],
      },
      async (_at: string, _rt: string, profile: any, done: any) => {
        try { done(null, await upsertOAuthUser("github", profile)); }
        catch (err) { done(err as Error); }
      }
    )
  );
}

// LinkedIn
if (process.env.LINKEDIN_CLIENT_ID) {
  passport.use(
    new LinkedInStrategy(
      {
        clientID: process.env.LINKEDIN_CLIENT_ID!,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        callbackURL: `${APP_URL}/api/auth/linkedin/callback`,
        scope: ["r_emailaddress", "r_liteprofile"],
      },
      async (_at: string, _rt: string, profile: any, done: any) => {
        try { done(null, await upsertOAuthUser("linkedin", profile)); }
        catch (err) { done(err as Error); }
      }
    )
  );
}

// Session
passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await findUserById(id);
    done(null, user ?? false);
  } catch (err) {
    done(err as Error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Redirect helper — goes to onboarding for new users, dashboard for returning
// ─────────────────────────────────────────────────────────────────────────────

function postAuthRedirect(user: any): string {
  return user?.onboardingCompleted ? "/app/dashboard" : "/onboarding";
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/user
router.get("/user", (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
  res.json(req.user);
});

// POST /api/auth/login  (email/password)
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials." });
    req.login(user, (e) => {
      if (e) return next(e);
      res.json({ user, redirectTo: postAuthRedirect(user) });
    });
  })(req, res, next);
});

// POST /api/auth/signup  (email/password)
router.post("/signup", async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (await findUserByEmail(email)) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(users)
      .values({
        email,
        firstName,
        lastName,
        passwordHash,
        provider: "local",
        userType: role,
        onboardingCompleted: false,
        onboardingStep: 0,
      })
      .returning();

    req.login(user, (e) => {
      if (e) return next(e);
      res.status(201).json({ user, redirectTo: "/onboarding" });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.logout(() => res.json({ ok: true }));
});

// ── Google ────────────────────────────────────────────────────────────────────
router.get("/google", passport.authenticate("google"));
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth?error=google_failed" }),
  (req, res) => res.redirect(postAuthRedirect(req.user))
);

// ── GitHub ────────────────────────────────────────────────────────────────────
router.get("/github", passport.authenticate("github"));
router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/auth?error=github_failed" }),
  (req, res) => res.redirect(postAuthRedirect(req.user))
);

// ── LinkedIn ──────────────────────────────────────────────────────────────────
router.get("/linkedin", passport.authenticate("linkedin"));
router.get(
  "/linkedin/callback",
  passport.authenticate("linkedin", { failureRedirect: "/auth?error=linkedin_failed" }),
  (req, res) => res.redirect(postAuthRedirect(req.user))
);

export default router;

/*
─────────────────────────────────────────────────────────────────
ENVIRONMENT VARIABLES TO ADD TO .env / Replit Secrets:

# Google OAuth — console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub OAuth — github.com/settings/developers > OAuth Apps
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# LinkedIn OAuth — developer.linkedin.com/apps
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Your deployed URL (for OAuth callback URLs)
APP_URL=https://your-replit-app.replit.app

─────────────────────────────────────────────────────────────────
MOUNT IN server/routes.ts (add near top, before other routes):

  import authRoutes from "./auth-routes.js";
  import onboardingRoutes from "./onboarding-routes.js";

  app.use("/api/auth", authRoutes);
  app.use("/api/onboarding", onboardingRoutes);

─────────────────────────────────────────────────────────────────
OAUTH CALLBACK URLs TO REGISTER:

Google:   {APP_URL}/api/auth/google/callback
GitHub:   {APP_URL}/api/auth/github/callback
LinkedIn: {APP_URL}/api/auth/linkedin/callback
─────────────────────────────────────────────────────────────────
*/
