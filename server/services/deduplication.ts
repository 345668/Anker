import { storage } from "../storage";
import type { Investor, Contact, InvestmentFirm, PotentialDuplicate } from "@shared/schema";

interface DuplicateMatch {
  entity1Id: string;
  entity2Id: string;
  matchType: string;
  similarityScore: number;
  matchDetails: Record<string, any>;
}

class DeduplicationService {
  private normalizeEmail(email: string | null | undefined): string {
    if (!email) return "";
    return email.toLowerCase().trim();
  }

  private normalizeName(name: string | null | undefined): string {
    if (!name) return "";
    return name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = this.normalizeName(name1);
    const n2 = this.normalizeName(name2);
    
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 100;
    
    const longer = n1.length > n2.length ? n1 : n2;
    const shorter = n1.length > n2.length ? n2 : n1;
    
    if (longer.includes(shorter) && shorter.length >= 3) {
      return Math.floor(80 * (shorter.length / longer.length));
    }
    
    const distance = this.levenshteinDistance(n1, n2);
    const maxLen = Math.max(n1.length, n2.length);
    return Math.max(0, Math.floor(100 * (1 - distance / maxLen)));
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  async findInvestorDuplicates(): Promise<DuplicateMatch[]> {
    const investors = await storage.getInvestors();
    const duplicates: DuplicateMatch[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < investors.length; i++) {
      for (let j = i + 1; j < investors.length; j++) {
        const inv1 = investors[i];
        const inv2 = investors[j];
        const pairKey = [inv1.id, inv2.id].sort().join("-");
        
        if (seen.has(pairKey)) continue;
        
        const matchDetails: Record<string, any> = {};
        let highestScore = 0;
        let matchType = "";

        const email1 = this.normalizeEmail(inv1.email);
        const email2 = this.normalizeEmail(inv2.email);
        if (email1 && email2 && email1 === email2) {
          matchDetails.emailMatch = true;
          highestScore = 100;
          matchType = "email_exact";
        }

        const fullName1 = `${inv1.firstName || ""} ${inv1.lastName || ""}`.trim();
        const fullName2 = `${inv2.firstName || ""} ${inv2.lastName || ""}`.trim();
        const nameSimilarity = this.calculateNameSimilarity(fullName1, fullName2);
        
        if (nameSimilarity >= 80) {
          matchDetails.nameSimilarity = nameSimilarity;
          matchDetails.name1 = fullName1;
          matchDetails.name2 = fullName2;
          if (nameSimilarity > highestScore) {
            highestScore = nameSimilarity;
            matchType = nameSimilarity === 100 ? "name_exact" : "name_fuzzy";
          }
        }

        if (inv1.linkedinUrl && inv2.linkedinUrl) {
          const linkedin1 = inv1.linkedinUrl.toLowerCase().replace(/\/$/, "");
          const linkedin2 = inv2.linkedinUrl.toLowerCase().replace(/\/$/, "");
          if (linkedin1 === linkedin2) {
            matchDetails.linkedinMatch = true;
            highestScore = 100;
            matchType = "linkedin_exact";
          }
        }

        if (highestScore >= 70) {
          seen.add(pairKey);
          duplicates.push({
            entity1Id: inv1.id,
            entity2Id: inv2.id,
            matchType,
            similarityScore: highestScore,
            matchDetails,
          });
        }
      }
    }

    return duplicates;
  }

  async findContactDuplicates(ownerId: string): Promise<DuplicateMatch[]> {
    const contacts = await storage.getContactsByOwner(ownerId);
    const duplicates: DuplicateMatch[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const c1 = contacts[i];
        const c2 = contacts[j];
        const pairKey = [c1.id, c2.id].sort().join("-");
        
        if (seen.has(pairKey)) continue;
        
        const matchDetails: Record<string, any> = {};
        let highestScore = 0;
        let matchType = "";

        const email1 = this.normalizeEmail(c1.email);
        const email2 = this.normalizeEmail(c2.email);
        if (email1 && email2 && email1 === email2) {
          matchDetails.emailMatch = true;
          highestScore = 100;
          matchType = "email_exact";
        }

        const fullName1 = `${c1.firstName || ""} ${c1.lastName || ""}`.trim();
        const fullName2 = `${c2.firstName || ""} ${c2.lastName || ""}`.trim();
        const nameSimilarity = this.calculateNameSimilarity(fullName1, fullName2);
        
        if (nameSimilarity >= 80) {
          matchDetails.nameSimilarity = nameSimilarity;
          if (nameSimilarity > highestScore) {
            highestScore = nameSimilarity;
            matchType = nameSimilarity === 100 ? "name_exact" : "name_fuzzy";
          }
        }

        if (c1.company && c2.company) {
          const companySimilarity = this.calculateNameSimilarity(c1.company, c2.company);
          if (companySimilarity >= 90) {
            matchDetails.companyMatch = true;
            matchDetails.companySimilarity = companySimilarity;
          }
        }

        if (highestScore >= 70) {
          seen.add(pairKey);
          duplicates.push({
            entity1Id: c1.id,
            entity2Id: c2.id,
            matchType,
            similarityScore: highestScore,
            matchDetails,
          });
        }
      }
    }

    return duplicates;
  }

  async runDuplicateScan(entityType: "investor" | "contact", ownerId?: string): Promise<{ found: number; created: number }> {
    let matches: DuplicateMatch[] = [];
    
    if (entityType === "investor") {
      matches = await this.findInvestorDuplicates();
    } else if (entityType === "contact" && ownerId) {
      matches = await this.findContactDuplicates(ownerId);
    }

    const existingDuplicates = await storage.getPotentialDuplicates(entityType, "pending");
    const existingPairs = new Set(
      existingDuplicates.map(d => [d.entity1Id, d.entity2Id].sort().join("-"))
    );

    let created = 0;
    for (const match of matches) {
      const pairKey = [match.entity1Id, match.entity2Id].sort().join("-");
      if (!existingPairs.has(pairKey)) {
        await storage.createPotentialDuplicate({
          entityType,
          entity1Id: match.entity1Id,
          entity2Id: match.entity2Id,
          matchType: match.matchType,
          similarityScore: match.similarityScore,
          matchDetails: match.matchDetails,
          status: "pending",
        });
        created++;
      }
    }

    return { found: matches.length, created };
  }

  async mergeInvestors(primaryId: string, duplicateId: string, userId: string): Promise<Investor> {
    const primary = await storage.getInvestorById(primaryId);
    const duplicate = await storage.getInvestorById(duplicateId);
    
    if (!primary || !duplicate) {
      throw new Error("One or both investors not found");
    }

    const mergedData: Partial<typeof primary> = {};
    const fieldsToMerge = [
      "email", "phone", "title", "linkedinUrl", "personLinkedinUrl", 
      "twitterUrl", "avatar", "bio", "location", "investorType",
      "investorState", "investorCountry", "fundHQ", "hqLocation",
      "fundingStage", "typicalInvestment", "website"
    ] as const;

    for (const field of fieldsToMerge) {
      if (!primary[field] && duplicate[field]) {
        (mergedData as any)[field] = duplicate[field];
      }
    }

    if (Array.isArray(duplicate.stages) && duplicate.stages.length > 0) {
      const primaryStages = Array.isArray(primary.stages) ? primary.stages : [];
      mergedData.stages = Array.from(new Set([...primaryStages, ...duplicate.stages]));
    }

    if (Array.isArray(duplicate.sectors) && duplicate.sectors.length > 0) {
      const primarySectors = Array.isArray(primary.sectors) ? primary.sectors : [];
      mergedData.sectors = Array.from(new Set([...primarySectors, ...duplicate.sectors]));
    }

    if (Object.keys(mergedData).length > 0) {
      await storage.updateInvestor(primaryId, mergedData as any);
    }

    await storage.updateInvestor(duplicateId, { isActive: false } as any);

    const duplicates = await storage.getPotentialDuplicates("investor", "pending");
    for (const dup of duplicates) {
      if (dup.entity1Id === duplicateId || dup.entity2Id === duplicateId ||
          (dup.entity1Id === primaryId && dup.entity2Id === duplicateId) ||
          (dup.entity1Id === duplicateId && dup.entity2Id === primaryId)) {
        await storage.updatePotentialDuplicate(dup.id, {
          status: "merged",
          mergedIntoId: primaryId,
          reviewedBy: userId,
          reviewedAt: new Date(),
        } as any);
      }
    }

    return (await storage.getInvestorById(primaryId))!;
  }

  async dismissDuplicate(duplicateId: string, userId: string): Promise<void> {
    await storage.updatePotentialDuplicate(duplicateId, {
      status: "dismissed",
      reviewedBy: userId,
      reviewedAt: new Date(),
    } as any);
  }
}

export const deduplicationService = new DeduplicationService();
