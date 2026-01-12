import { Router, Request, Response } from "express";
import { db } from "./db";
import { 
  funds, insertFundSchema, 
  fundInvestments, insertFundInvestmentSchema,
  portfolioMetrics, insertPortfolioMetricsSchema,
  lpEntities, insertLpEntitySchema,
  lpCommitments, insertLpCommitmentSchema,
  lpCapitalCalls, insertLpCapitalCallSchema,
  lpDistributions, insertLpDistributionSchema,
  lpReports, insertLpReportSchema,
  fundAnalyticsSnapshots,
  investmentFirms,
  startups,
  deals
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, count, sum, avg } from "drizzle-orm";
import { isAuthenticated } from "./replit_integrations/auth";

export const institutionalRouter = Router();

institutionalRouter.use(isAuthenticated);

// ==========================================
// FUND MANAGEMENT ENDPOINTS
// ==========================================

institutionalRouter.get("/firms/:firmId/funds", async (req: Request, res: Response) => {
  try {
    const { firmId } = req.params;
    const firmFunds = await db.select().from(funds).where(eq(funds.firmId, firmId)).orderBy(desc(funds.vintage));
    res.json(firmFunds);
  } catch (error) {
    console.error("Error fetching funds:", error);
    res.status(500).json({ error: "Failed to fetch funds" });
  }
});

institutionalRouter.get("/funds/:fundId", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const [fund] = await db.select().from(funds).where(eq(funds.id, fundId));
    if (!fund) {
      return res.status(404).json({ error: "Fund not found" });
    }
    res.json(fund);
  } catch (error) {
    console.error("Error fetching fund:", error);
    res.status(500).json({ error: "Failed to fetch fund" });
  }
});

institutionalRouter.post("/firms/:firmId/funds", async (req: Request, res: Response) => {
  try {
    const { firmId } = req.params;
    const validated = insertFundSchema.parse({ ...req.body, firmId });
    const [newFund] = await db.insert(funds).values(validated as any).returning();
    res.status(201).json(newFund);
  } catch (error) {
    console.error("Error creating fund:", error);
    res.status(500).json({ error: "Failed to create fund" });
  }
});

institutionalRouter.patch("/funds/:fundId", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const [updated] = await db.update(funds)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(funds.id, fundId))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating fund:", error);
    res.status(500).json({ error: "Failed to update fund" });
  }
});

institutionalRouter.delete("/funds/:fundId", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    await db.delete(funds).where(eq(funds.id, fundId));
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting fund:", error);
    res.status(500).json({ error: "Failed to delete fund" });
  }
});

// ==========================================
// PORTFOLIO INVESTMENT ENDPOINTS
// ==========================================

institutionalRouter.get("/funds/:fundId/investments", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const investments = await db.select().from(fundInvestments)
      .where(eq(fundInvestments.fundId, fundId))
      .orderBy(desc(fundInvestments.investmentDate));
    res.json(investments);
  } catch (error) {
    console.error("Error fetching investments:", error);
    res.status(500).json({ error: "Failed to fetch investments" });
  }
});

institutionalRouter.post("/funds/:fundId/investments", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const validated = insertFundInvestmentSchema.parse({ ...req.body, fundId });
    const [investment] = await db.insert(fundInvestments).values(validated).returning();
    res.status(201).json(investment);
  } catch (error) {
    console.error("Error creating investment:", error);
    res.status(500).json({ error: "Failed to create investment" });
  }
});

institutionalRouter.patch("/investments/:investmentId", async (req: Request, res: Response) => {
  try {
    const { investmentId } = req.params;
    const [updated] = await db.update(fundInvestments)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(fundInvestments.id, investmentId))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating investment:", error);
    res.status(500).json({ error: "Failed to update investment" });
  }
});

institutionalRouter.delete("/investments/:investmentId", async (req: Request, res: Response) => {
  try {
    const { investmentId } = req.params;
    await db.delete(fundInvestments).where(eq(fundInvestments.id, investmentId));
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting investment:", error);
    res.status(500).json({ error: "Failed to delete investment" });
  }
});

// ==========================================
// LP ENTITY ENDPOINTS
// ==========================================

institutionalRouter.get("/firms/:firmId/lps", async (req: Request, res: Response) => {
  try {
    const { firmId } = req.params;
    const lps = await db.select().from(lpEntities)
      .where(eq(lpEntities.firmId, firmId))
      .orderBy(lpEntities.name);
    res.json(lps);
  } catch (error) {
    console.error("Error fetching LPs:", error);
    res.status(500).json({ error: "Failed to fetch LPs" });
  }
});

institutionalRouter.post("/firms/:firmId/lps", async (req: Request, res: Response) => {
  try {
    const { firmId } = req.params;
    const validated = insertLpEntitySchema.parse({ ...req.body, firmId });
    const [lp] = await db.insert(lpEntities).values(validated).returning();
    res.status(201).json(lp);
  } catch (error) {
    console.error("Error creating LP:", error);
    res.status(500).json({ error: "Failed to create LP" });
  }
});

institutionalRouter.patch("/lps/:lpId", async (req: Request, res: Response) => {
  try {
    const { lpId } = req.params;
    const [updated] = await db.update(lpEntities)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(lpEntities.id, lpId))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating LP:", error);
    res.status(500).json({ error: "Failed to update LP" });
  }
});

// ==========================================
// LP COMMITMENT ENDPOINTS
// ==========================================

institutionalRouter.get("/funds/:fundId/commitments", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const commitments = await db.select({
      commitment: lpCommitments,
      lp: lpEntities
    })
    .from(lpCommitments)
    .leftJoin(lpEntities, eq(lpCommitments.lpId, lpEntities.id))
    .where(eq(lpCommitments.fundId, fundId))
    .orderBy(desc(lpCommitments.commitmentAmount));
    res.json(commitments);
  } catch (error) {
    console.error("Error fetching commitments:", error);
    res.status(500).json({ error: "Failed to fetch commitments" });
  }
});

institutionalRouter.post("/funds/:fundId/commitments", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const validated = insertLpCommitmentSchema.parse({ ...req.body, fundId });
    const [commitment] = await db.insert(lpCommitments).values(validated).returning();
    res.status(201).json(commitment);
  } catch (error) {
    console.error("Error creating commitment:", error);
    res.status(500).json({ error: "Failed to create commitment" });
  }
});

// ==========================================
// CAPITAL CALLS & DISTRIBUTIONS
// ==========================================

institutionalRouter.get("/funds/:fundId/capital-calls", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const calls = await db.select().from(lpCapitalCalls)
      .where(eq(lpCapitalCalls.fundId, fundId))
      .orderBy(desc(lpCapitalCalls.callDate));
    res.json(calls);
  } catch (error) {
    console.error("Error fetching capital calls:", error);
    res.status(500).json({ error: "Failed to fetch capital calls" });
  }
});

institutionalRouter.post("/funds/:fundId/capital-calls", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const validated = insertLpCapitalCallSchema.parse({ ...req.body, fundId });
    const [call] = await db.insert(lpCapitalCalls).values(validated).returning();
    res.status(201).json(call);
  } catch (error) {
    console.error("Error creating capital call:", error);
    res.status(500).json({ error: "Failed to create capital call" });
  }
});

institutionalRouter.get("/funds/:fundId/distributions", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const distributions = await db.select().from(lpDistributions)
      .where(eq(lpDistributions.fundId, fundId))
      .orderBy(desc(lpDistributions.distributionDate));
    res.json(distributions);
  } catch (error) {
    console.error("Error fetching distributions:", error);
    res.status(500).json({ error: "Failed to fetch distributions" });
  }
});

institutionalRouter.post("/funds/:fundId/distributions", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const validated = insertLpDistributionSchema.parse({ ...req.body, fundId });
    const [distribution] = await db.insert(lpDistributions).values(validated).returning();
    res.status(201).json(distribution);
  } catch (error) {
    console.error("Error creating distribution:", error);
    res.status(500).json({ error: "Failed to create distribution" });
  }
});

// ==========================================
// PORTFOLIO METRICS
// ==========================================

institutionalRouter.get("/funds/:fundId/metrics", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const metrics = await db.select().from(portfolioMetrics)
      .where(eq(portfolioMetrics.fundId, fundId))
      .orderBy(desc(portfolioMetrics.periodEnd));
    res.json(metrics);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

institutionalRouter.post("/funds/:fundId/metrics", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const validated = insertPortfolioMetricsSchema.parse({ ...req.body, fundId });
    const [metric] = await db.insert(portfolioMetrics).values(validated).returning();
    res.status(201).json(metric);
  } catch (error) {
    console.error("Error creating metrics:", error);
    res.status(500).json({ error: "Failed to create metrics" });
  }
});

// ==========================================
// LP REPORTS
// ==========================================

institutionalRouter.get("/funds/:fundId/reports", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const reports = await db.select().from(lpReports)
      .where(eq(lpReports.fundId, fundId))
      .orderBy(desc(lpReports.createdAt));
    res.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

institutionalRouter.post("/funds/:fundId/reports", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    const userId = (req.user as any)?.id;
    const validated = insertLpReportSchema.parse({ ...req.body, fundId, generatedBy: userId });
    const [report] = await db.insert(lpReports).values(validated).returning();
    res.status(201).json(report);
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ error: "Failed to create report" });
  }
});

institutionalRouter.patch("/reports/:reportId", async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const [updated] = await db.update(lpReports)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(lpReports.id, reportId))
      .returning();
    res.json(updated);
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ error: "Failed to update report" });
  }
});

// ==========================================
// ANALYTICS ENDPOINTS
// ==========================================

institutionalRouter.get("/funds/:fundId/analytics", async (req: Request, res: Response) => {
  try {
    const { fundId } = req.params;
    
    const [fund] = await db.select().from(funds).where(eq(funds.id, fundId));
    if (!fund) {
      return res.status(404).json({ error: "Fund not found" });
    }

    const investments = await db.select().from(fundInvestments)
      .where(eq(fundInvestments.fundId, fundId));

    const commitmentData = await db.select().from(lpCommitments)
      .where(eq(lpCommitments.fundId, fundId));

    const totalInvested = investments.reduce((sum, inv) => sum + (inv.investedAmount || 0), 0);
    const totalUnrealizedValue = investments.reduce((sum, inv) => sum + (inv.unrealizedValue || 0), 0);
    const totalRealizedValue = investments.reduce((sum, inv) => sum + (inv.realizedValue || 0), 0);
    const totalValue = totalUnrealizedValue + totalRealizedValue;
    const totalCommitments = commitmentData.reduce((sum, c) => sum + (c.commitmentAmount || 0), 0);

    const activeInvestments = investments.filter(i => i.status === "active").length;
    const exitedInvestments = investments.filter(i => i.status === "exited").length;
    const writtenOffInvestments = investments.filter(i => i.status === "written_off").length;

    const sectorAllocation: Record<string, number> = {};
    investments.forEach(inv => {
      if (inv.sector) {
        sectorAllocation[inv.sector] = (sectorAllocation[inv.sector] || 0) + (inv.investedAmount || 0);
      }
    });

    const roundAllocation: Record<string, number> = {};
    investments.forEach(inv => {
      if (inv.roundType) {
        roundAllocation[inv.roundType] = (roundAllocation[inv.roundType] || 0) + (inv.investedAmount || 0);
      }
    });

    const topPerformers = investments
      .filter(i => i.multipleOnInvestment && i.multipleOnInvestment > 0)
      .sort((a, b) => (b.multipleOnInvestment || 0) - (a.multipleOnInvestment || 0))
      .slice(0, 5)
      .map(i => ({
        name: i.companyName,
        moic: i.multipleOnInvestment,
        irr: i.irr,
        invested: i.investedAmount,
        value: (i.unrealizedValue || 0) + (i.realizedValue || 0)
      }));

    const analytics = {
      fund: {
        name: fund.name,
        vintage: fund.vintage,
        status: fund.status,
        targetSize: fund.targetSize,
        committedCapital: totalCommitments,
        calledCapital: fund.calledCapital || 0,
        distributedCapital: fund.distributedCapital || 0
      },
      portfolio: {
        totalInvested,
        totalValue,
        unrealizedValue: totalUnrealizedValue,
        realizedValue: totalRealizedValue,
        portfolioCount: investments.length,
        activeCount: activeInvestments,
        exitedCount: exitedInvestments,
        writtenOffCount: writtenOffInvestments
      },
      performance: {
        tvpi: totalInvested > 0 ? totalValue / totalInvested : 0,
        dpi: totalInvested > 0 ? totalRealizedValue / totalInvested : 0,
        rvpi: totalInvested > 0 ? totalUnrealizedValue / totalInvested : 0,
        averageMoic: investments.length > 0 
          ? investments.reduce((sum, i) => sum + (i.multipleOnInvestment || 0), 0) / investments.length 
          : 0
      },
      allocations: {
        bySector: sectorAllocation,
        byRound: roundAllocation
      },
      topPerformers,
      lpSummary: {
        totalLps: commitmentData.length,
        totalCommitments,
        averageCommitment: commitmentData.length > 0 ? totalCommitments / commitmentData.length : 0
      }
    };

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

institutionalRouter.get("/firms/:firmId/analytics", async (req: Request, res: Response) => {
  try {
    const { firmId } = req.params;

    const firmFunds = await db.select().from(funds).where(eq(funds.firmId, firmId));
    const fundIds = firmFunds.map(f => f.id);

    if (fundIds.length === 0) {
      return res.json({
        overview: { totalFunds: 0, totalAum: 0, activeDeals: 0 },
        funds: [],
        allocations: {},
        performance: {}
      });
    }

    const allInvestments = await db.select().from(fundInvestments)
      .where(sql`${fundInvestments.fundId} = ANY(${fundIds})`);

    const totalInvested = allInvestments.reduce((sum, inv) => sum + (inv.investedAmount || 0), 0);
    const totalValue = allInvestments.reduce((sum, inv) => 
      sum + (inv.unrealizedValue || 0) + (inv.realizedValue || 0), 0);

    const allCommitments = await db.select().from(lpCommitments)
      .where(sql`${lpCommitments.fundId} = ANY(${fundIds})`);

    const totalAum = allCommitments.reduce((sum, c) => sum + (c.commitmentAmount || 0), 0);

    const sectorAllocation: Record<string, number> = {};
    allInvestments.forEach(inv => {
      if (inv.sector) {
        sectorAllocation[inv.sector] = (sectorAllocation[inv.sector] || 0) + (inv.investedAmount || 0);
      }
    });

    const fundSummaries = firmFunds.map(fund => {
      const fundInv = allInvestments.filter(i => i.fundId === fund.id);
      const invested = fundInv.reduce((sum, i) => sum + (i.investedAmount || 0), 0);
      const value = fundInv.reduce((sum, i) => sum + (i.unrealizedValue || 0) + (i.realizedValue || 0), 0);
      return {
        id: fund.id,
        name: fund.name,
        vintage: fund.vintage,
        status: fund.status,
        portfolioCount: fundInv.length,
        invested,
        currentValue: value,
        tvpi: invested > 0 ? value / invested : 0
      };
    });

    res.json({
      overview: {
        totalFunds: firmFunds.length,
        totalAum,
        totalInvested,
        totalValue,
        portfolioCompanies: allInvestments.length,
        activeInvestments: allInvestments.filter(i => i.status === "active").length,
        tvpi: totalInvested > 0 ? totalValue / totalInvested : 0
      },
      funds: fundSummaries,
      allocations: { bySector: sectorAllocation },
      recentInvestments: allInvestments
        .sort((a, b) => new Date(b.investmentDate).getTime() - new Date(a.investmentDate).getTime())
        .slice(0, 10)
    });
  } catch (error) {
    console.error("Error fetching firm analytics:", error);
    res.status(500).json({ error: "Failed to fetch firm analytics" });
  }
});

// Get user's associated firm (for institutional dashboard access)
institutionalRouter.get("/my-firm", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if user is associated with an investment firm via investors table
    const { investors } = await import("@shared/schema");
    const [investorProfile] = await db.select()
      .from(investors)
      .where(eq(investors.userId, userId));

    if (investorProfile?.firmId) {
      const [firm] = await db.select()
        .from(investmentFirms)
        .where(eq(investmentFirms.id, investorProfile.firmId));
      return res.json({ firm, role: "investor" });
    }

    // Check if user owns any investment firms (via teams of type investment_firm)
    const { teams, teamMembers } = await import("@shared/schema");
    const userTeams = await db.select({
      team: teams
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(
      eq(teamMembers.userId, userId),
      eq(teams.type, "investment_firm")
    ));

    if (userTeams.length > 0) {
      // Find the associated investment firm
      const [firmTeam] = userTeams;
      return res.json({ team: firmTeam.team, role: "team_member" });
    }

    res.json({ firm: null, role: null });
  } catch (error) {
    console.error("Error fetching user's firm:", error);
    res.status(500).json({ error: "Failed to fetch firm association" });
  }
});
