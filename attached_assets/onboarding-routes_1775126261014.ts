/**
 * onboarding-routes.ts
 *
 * Handles onboarding form submissions, writing to the real existing
 * schema tables documented in replit.md:
 *   - users          (userType, onboardingCompleted)
 *   - startups       (all founder profile fields)
 *   - investors      (investor preferences)
 *   - investmentFirms (firm-level data)
 *   - dealRooms      (auto-created 1:1 with startup — existing behaviour)
 *   - checklist_sessions (initialises DD checklist state on signup)
 *
 * Mount in server/routes.ts:
 *   import onboardingRoutes from "./onboarding-routes.js";
 *   app.use("/api/onboarding", onboardingRoutes);
 */

import express from "express";
import { db } from "./db.js";                  // your existing db export
import { storage } from "./storage.js";         // your existing storage abstraction
import {
  users,
  startups,
  investors,
  investmentFirms,
  dealRooms,
  checklistSessions,
} from "../shared/schema.js";
import { eq } from "drizzle-orm";

const router = express.Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

// ─── POST /api/onboarding/founder ─────────────────────────────────────────────
//
// Writes to: users (userType), startups, dealRooms (auto-create), checklist_sessions
//
router.post("/founder", requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as any).id;
    const {
      // Step 2
      companyName,
      website,
      shortBio,
      hqLocation,
      // Step 3
      industry,
      niche,
      stage,
      fundingTarget,
      // Step 4
      teamSize,
      linkedinUrl,
      pitchDeckUrl,
      // Step 5
      targetGeographies,
      preferredInvestorTypes,
      keyMilestone,
    } = req.body;

    // 1. Update user role
    await db
      .update(users)
      .set({
        userType: "founder",
        onboardingCompleted: true,
        onboardingStep: 6,
      })
      .where(eq(users.id, userId));

    // 2. Upsert startup record
    const existingStartup = await db.query.startups.findFirst({
      where: eq(startups.userId, userId),
    });

    let startup;
    if (existingStartup) {
      [startup] = await db
        .update(startups)
        .set({
          name: companyName,
          website: website || null,
          description: shortBio || null,
          location: hqLocation || null,
          industry: industry || null,
          nicheIndustry: niche || null,       // used by niche matchmaking in matchmaking.ts
          stage: stage || null,
          fundingTarget: fundingTarget || null,
          teamSize: teamSize || null,
          founderLinkedin: linkedinUrl || null,
          pitchDeckUrl: pitchDeckUrl || null,
          targetGeographies: targetGeographies || [],
          preferredInvestorTypes: preferredInvestorTypes || [],
          keyMilestone: keyMilestone || null,
          updatedAt: new Date(),
        })
        .where(eq(startups.id, existingStartup.id))
        .returning();
    } else {
      [startup] = await db
        .insert(startups)
        .values({
          userId,
          name: companyName,
          website: website || null,
          description: shortBio || null,
          location: hqLocation || null,
          industry: industry || null,
          nicheIndustry: niche || null,
          stage: stage || null,
          fundingTarget: fundingTarget || null,
          teamSize: teamSize || null,
          founderLinkedin: linkedinUrl || null,
          pitchDeckUrl: pitchDeckUrl || null,
          targetGeographies: targetGeographies || [],
          preferredInvestorTypes: preferredInvestorTypes || [],
          keyMilestone: keyMilestone || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    // 3. Auto-create deal room (mirrors existing behaviour from replit.md:
    //    "Startups have a 1:1 relationship with deal rooms, which are auto-created")
    const existingRoom = await db.query.dealRooms.findFirst({
      where: eq(dealRooms.startupId, startup.id),
    });

    if (!existingRoom) {
      await db.insert(dealRooms).values({
        startupId: startup.id,
        name: `${companyName} Deal Room`,
        createdAt: new Date(),
      });
    }

    // 4. Initialise DD readiness checklist (type: "dd-readiness")
    //    Users can resume from /app/dd-checklist after onboarding
    const existingChecklist = await db.query.checklistSessions.findFirst({
      where: (cs) =>
        eq(cs.userId, userId) && eq(cs.type, "dd-readiness"),
    }).catch(() => null); // graceful — table may not exist yet

    if (!existingChecklist) {
      await db
        .insert(checklistSessions)
        .values({
          userId,
          type: "dd-readiness",
          data: JSON.stringify({ answers: {}, completedAt: null }),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .catch(() => {}); // non-fatal if table doesn't exist yet
    }

    res.json({
      ok: true,
      startupId: startup.id,
      redirectTo: "/app/dashboard",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/onboarding/investor ────────────────────────────────────────────
//
// Writes to: users (userType), investmentFirms, investors
//
router.post("/investor", requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as any).id;
    const {
      // Step 2
      firmName,
      firmType,
      website,
      hqLocation,
      // Step 3
      preferredStages,
      preferredSectors,
      typicalCheckSize,
      aum,
      investmentThesis,
      // Step 4
      focusNiches,
      geographyFocus,
      portfolioCount,
    } = req.body;

    // 1. Update user role
    await db
      .update(users)
      .set({
        userType: "investor",
        onboardingCompleted: true,
        onboardingStep: 5,
      })
      .where(eq(users.id, userId));

    // 2. Upsert investment firm
    const existingFirm = await db.query.investmentFirms.findFirst({
      where: eq(investmentFirms.createdByUserId, userId),
    });

    let firm;
    if (existingFirm) {
      [firm] = await db
        .update(investmentFirms)
        .set({
          name: firmName,
          classification: firmType || null,  // VC | Family Office | PE | Angel
          website: website || null,
          hqLocation: hqLocation || null,
          aum: aum || null,
          updatedAt: new Date(),
        })
        .where(eq(investmentFirms.id, existingFirm.id))
        .returning();
    } else {
      [firm] = await db
        .insert(investmentFirms)
        .values({
          name: firmName,
          classification: firmType || null,
          website: website || null,
          hqLocation: hqLocation || null,
          aum: aum || null,
          createdByUserId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    // 3. Upsert investor preferences record
    //    This is what the matchmaking engine reads
    const existingInvestor = await db.query.investors.findFirst({
      where: eq(investors.userId, userId),
    });

    if (existingInvestor) {
      await db
        .update(investors)
        .set({
          firmId: firm.id,
          investmentThesis: investmentThesis || null,
          preferredStages: preferredStages || [],
          preferredSectors: preferredSectors || [],
          typicalCheckSize: typicalCheckSize || null,
          focusNiches: focusNiches || [],       // feeds niche matchmaking
          geographyFocus: geographyFocus || [],  // feeds geographic scoring
          portfolioCount: portfolioCount ? parseInt(portfolioCount) : null,
          updatedAt: new Date(),
        })
        .where(eq(investors.id, existingInvestor.id));
    } else {
      await db.insert(investors).values({
        userId,
        firmId: firm.id,
        investmentThesis: investmentThesis || null,
        preferredStages: preferredStages || [],
        preferredSectors: preferredSectors || [],
        typicalCheckSize: typicalCheckSize || null,
        focusNiches: focusNiches || [],
        geographyFocus: geographyFocus || [],
        portfolioCount: portfolioCount ? parseInt(portfolioCount) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    res.json({
      ok: true,
      firmId: firm.id,
      redirectTo: "/app/dashboard",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/onboarding/pitch-deck ─────────────────────────────────────────
//
// Handles pitch deck upload, uses existing Google Cloud Storage setup
// (@google-cloud/storage is already installed in package.json)
//
router.post("/pitch-deck", requireAuth, async (req, res, next) => {
  try {
    // NOTE: Wire up multer or @uppy/core here for multipart handling.
    // The existing project already has @uppy/* installed.
    // This stub shows the endpoint contract.

    // const { fileUrl } = await uploadToGCS(req);
    // await db.update(startups).set({ pitchDeckUrl: fileUrl }).where(eq(startups.userId, userId));

    res.json({ url: "/placeholder/deck.pdf", message: "Wire up GCS upload here" });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/onboarding/status ───────────────────────────────────────────────
//
// Returns whether the user has completed onboarding and their current step.
// Used by App.tsx to decide whether to redirect to /onboarding.
//
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    res.json({
      completed: user.onboardingCompleted || false,
      step: user.onboardingStep || 0,
      userType: user.userType || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
