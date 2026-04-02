import { Router, Request, Response } from "express";
import { db } from "./db";
import { users, startups, investors, investmentFirms } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

function requireAuth(req: Request, res: Response): string | null {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  return userId;
}

const founderSchema = z.object({
  companyName: z.string().optional(),
  website: z.string().optional(),
  shortBio: z.string().optional(),
  hqLocation: z.string().optional(),
  industry: z.string().optional(),
  niche: z.string().nullable().optional(),
  stage: z.string().optional(),
  fundingTarget: z.string().optional(),
  teamSize: z.string().optional(),
  linkedinUrl: z.string().optional(),
  pitchDeckUploaded: z.boolean().optional(),
  pitchDeckUrl: z.string().optional(),
  targetGeographies: z.array(z.string()).optional(),
  preferredInvestorTypes: z.array(z.string()).optional(),
  keyMilestone: z.string().optional(),
});

const investorSchema = z.object({
  firmName: z.string().optional(),
  firmType: z.string().optional(),
  website: z.string().optional(),
  hqLocation: z.string().optional(),
  preferredStages: z.array(z.string()).optional(),
  preferredSectors: z.array(z.string()).optional(),
  typicalCheckSize: z.string().optional(),
  aum: z.string().optional(),
  investmentThesis: z.string().optional(),
  focusNiches: z.array(z.string()).optional(),
  geographyFocus: z.array(z.string()).optional(),
  portfolioCount: z.string().optional(),
});

export function registerOnboardingRoutes(app: Router) {
  // ── Founder onboarding ────────────────────────────────────────────────────
  app.post("/api/onboarding/founder", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const result = founderSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0]?.message || "Invalid data" });
      }

      const data = result.data;

      const industries: string[] = [];
      if (data.industry) industries.push(data.industry);
      if (data.niche) industries.push(data.niche);

      const matchingProfile = {
        industries,
        targetInvestorTypes: data.preferredInvestorTypes || [],
        geographicFocus: data.targetGeographies || [],
        keyMetrics: data.keyMilestone ? { milestone: data.keyMilestone } : {},
      };

      // Create or update startup record
      const [existingStartup] = await db.select().from(startups)
        .where(eq(startups.founderId, userId)).limit(1);

      if (existingStartup) {
        await db.update(startups).set({
          name: data.companyName || existingStartup.name,
          website: data.website !== undefined ? data.website : existingStartup.website,
          description: data.shortBio !== undefined ? data.shortBio : existingStartup.description,
          location: data.hqLocation !== undefined ? data.hqLocation : existingStartup.location,
          stage: data.stage !== undefined ? data.stage : existingStartup.stage,
          industries: industries.length ? industries : existingStartup.industries,
          linkedinUrl: data.linkedinUrl !== undefined ? data.linkedinUrl : existingStartup.linkedinUrl,
          pitchDeckUrl: data.pitchDeckUrl !== undefined ? data.pitchDeckUrl : existingStartup.pitchDeckUrl,
          matchingProfile,
          onboardingData: data as any,
          updatedAt: new Date(),
        }).where(eq(startups.id, existingStartup.id));
      } else if (data.companyName) {
        await db.insert(startups).values({
          founderId: userId,
          name: data.companyName,
          website: data.website || null,
          description: data.shortBio || null,
          location: data.hqLocation || null,
          stage: data.stage || null,
          industries,
          linkedinUrl: data.linkedinUrl || null,
          pitchDeckUrl: data.pitchDeckUrl || null,
          matchingProfile,
          onboardingData: data as any,
          isPublic: false,
        });
      }

      // Update user profile and mark onboarding complete
      await db.update(users).set({
        userType: "founder",
        linkedinUrl: data.linkedinUrl || undefined,
        stage: data.stage || undefined,
        location: data.hqLocation || undefined,
        industries: industries.length ? industries : undefined,
        onboardingCompleted: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
      console.error("Founder onboarding error:", error);
      res.status(500).json({ message: "Failed to save founder profile" });
    }
  });

  // ── Investor onboarding ───────────────────────────────────────────────────
  app.post("/api/onboarding/investor", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;

    try {
      const result = investorSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0]?.message || "Invalid data" });
      }

      const data = result.data;

      // Check if investor record already exists for this user
      const [existingInvestor] = await db.select().from(investors)
        .where(eq(investors.userId, userId)).limit(1);

      // Create or update investment firm if firmName provided
      let firmId: string | null = null;
      if (data.firmName) {
        const [existingFirm] = existingInvestor?.firmId
          ? await db.select().from(investmentFirms).where(eq(investmentFirms.id, existingInvestor.firmId)).limit(1)
          : [null];

        if (existingFirm) {
          await db.update(investmentFirms).set({
            name: data.firmName,
            website: data.website !== undefined ? data.website : existingFirm.website,
            location: data.hqLocation !== undefined ? data.hqLocation : existingFirm.location,
            type: data.firmType !== undefined ? data.firmType : existingFirm.type,
            sectors: data.preferredSectors || existingFirm.sectors,
            stages: data.preferredStages || existingFirm.stages,
            description: data.investmentThesis !== undefined ? data.investmentThesis : existingFirm.description,
            aum: data.aum !== undefined ? data.aum : existingFirm.aum,
            portfolioCount: data.portfolioCount ? parseInt(data.portfolioCount) || null : existingFirm.portfolioCount,
            updatedAt: new Date(),
          }).where(eq(investmentFirms.id, existingFirm.id));
          firmId = existingFirm.id;
        } else {
          const [newFirm] = await db.insert(investmentFirms).values({
            name: data.firmName,
            website: data.website || null,
            location: data.hqLocation || null,
            type: data.firmType || null,
            sectors: data.preferredSectors || [],
            stages: data.preferredStages || [],
            description: data.investmentThesis || null,
            aum: data.aum || null,
            portfolioCount: data.portfolioCount ? parseInt(data.portfolioCount) || null : null,
            source: "onboarding",
          }).returning();
          firmId = newFirm.id;
        }
      }

      // Fetch current user for name fields
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (existingInvestor) {
        await db.update(investors).set({
          firmId: firmId || existingInvestor.firmId,
          stages: data.preferredStages || existingInvestor.stages,
          sectors: data.preferredSectors || existingInvestor.sectors,
          location: data.hqLocation !== undefined ? data.hqLocation : existingInvestor.location,
          bio: data.investmentThesis !== undefined ? data.investmentThesis : existingInvestor.bio,
        }).where(eq(investors.id, existingInvestor.id));
      } else {
        await db.insert(investors).values({
          userId,
          firmId: firmId || null,
          firstName: currentUser?.firstName || "Unknown",
          lastName: currentUser?.lastName || null,
          email: currentUser?.email || null,
          stages: data.preferredStages || [],
          sectors: data.preferredSectors || [],
          location: data.hqLocation || null,
          bio: data.investmentThesis || null,
          isActive: true,
        });
      }

      // Update user profile and mark onboarding complete
      await db.update(users).set({
        userType: "investor",
        companyName: data.firmName || undefined,
        location: data.hqLocation || undefined,
        preferredStages: data.preferredStages || undefined,
        investmentFocus: data.preferredSectors || undefined,
        bio: data.investmentThesis || undefined,
        onboardingCompleted: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
      console.error("Investor onboarding error:", error);
      res.status(500).json({ message: "Failed to save investor profile" });
    }
  });
}
