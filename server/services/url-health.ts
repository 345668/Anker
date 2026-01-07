import { db } from "../db";
import { 
  urlHealthChecks, urlRepairCandidates, urlHealthJobs, 
  investmentFirms, investors, businessmen,
  UrlHealthCheck, UrlHealthJob, UrlHealthStatus
} from "@shared/schema";
import { eq, and, sql, isNull, or, lt, inArray } from "drizzle-orm";

const PARKED_DOMAIN_KEYWORDS = [
  "buy this domain",
  "domain for sale",
  "this domain is for sale",
  "domain parking",
  "parked domain",
  "godaddy",
  "sedo",
  "afternic",
  "dan.com",
  "hugedomains",
  "domain expired",
  "expired domain",
  "is available",
  "acquire this domain"
];

const REDIRECT_LIMIT = 5;
const TIMEOUT_MS = 8000;

interface UrlValidationResult {
  url: string;
  httpStatus: number | null;
  canonicalUrl: string | null;
  redirectChain: string[];
  healthStatus: UrlHealthStatus;
  confidence: number;
  isParkedDomain: boolean;
  isExpired: boolean;
  hasLoginOnly: boolean;
  contentLength: number | null;
  pageTitle: string | null;
  errorMessage: string | null;
}

interface EntityUrlRecord {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  url: string;
  entityName: string;
}

export async function validateUrl(url: string): Promise<UrlValidationResult> {
  const result: UrlValidationResult = {
    url,
    httpStatus: null,
    canonicalUrl: null,
    redirectChain: [],
    healthStatus: "unknown",
    confidence: 0,
    isParkedDomain: false,
    isExpired: false,
    hasLoginOnly: false,
    contentLength: null,
    pageTitle: null,
    errorMessage: null
  };

  if (!url || url.trim() === "") {
    result.healthStatus = "unknown";
    result.errorMessage = "Empty URL";
    return result;
  }

  try {
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(normalizedUrl, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; URLHealthBot/1.0; +https://1000vc.com)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      clearTimeout(timeoutId);

      result.httpStatus = response.status;
      result.canonicalUrl = response.url;

      if (response.url !== normalizedUrl) {
        result.redirectChain.push(normalizedUrl);
        result.redirectChain.push(response.url);
      }

      if (response.status >= 200 && response.status < 300) {
        const text = await response.text();
        result.contentLength = text.length;

        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        result.pageTitle = titleMatch ? titleMatch[1].trim().substring(0, 200) : null;

        const lowerText = text.toLowerCase();
        result.isParkedDomain = PARKED_DOMAIN_KEYWORDS.some(kw => lowerText.includes(kw));

        const hasLoginForm = lowerText.includes('type="password"') || 
                            lowerText.includes("type='password'") ||
                            lowerText.includes('name="password"');
        const hasMinimalContent = text.length < 5000;
        result.hasLoginOnly = hasLoginForm && hasMinimalContent;

        if (result.isParkedDomain) {
          result.healthStatus = "parked";
          result.confidence = 0.9;
        } else if (response.url !== normalizedUrl) {
          result.healthStatus = "redirected";
          result.confidence = 0.85;
        } else {
          result.healthStatus = "valid";
          result.confidence = 0.95;
        }
      } else if (response.status >= 400 && response.status < 500) {
        result.healthStatus = "unreachable";
        result.confidence = 0.9;
        result.errorMessage = `HTTP ${response.status}`;
      } else if (response.status >= 500) {
        result.healthStatus = "unreachable";
        result.confidence = 0.7;
        result.errorMessage = `Server error ${response.status}`;
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === "AbortError") {
        result.healthStatus = "unreachable";
        result.confidence = 0.8;
        result.errorMessage = "Request timeout";
      } else if (fetchError.code === "ENOTFOUND" || fetchError.message?.includes("ENOTFOUND")) {
        result.healthStatus = "expired";
        result.isExpired = true;
        result.confidence = 0.95;
        result.errorMessage = "DNS resolution failed";
      } else if (fetchError.code === "ECONNREFUSED") {
        result.healthStatus = "unreachable";
        result.confidence = 0.9;
        result.errorMessage = "Connection refused";
      } else {
        result.healthStatus = "unreachable";
        result.confidence = 0.7;
        result.errorMessage = fetchError.message || "Unknown fetch error";
      }
    }
  } catch (error: any) {
    result.healthStatus = "unknown";
    result.confidence = 0;
    result.errorMessage = error.message || "Validation failed";
  }

  return result;
}

export async function getEntitiesWithUrls(entityScope: string, limit: number = 100): Promise<EntityUrlRecord[]> {
  const records: EntityUrlRecord[] = [];

  if (entityScope === "all" || entityScope === "investmentFirms") {
    const firms = await db.select({
      id: investmentFirms.id,
      name: investmentFirms.name,
      website: investmentFirms.website,
      linkedinUrl: investmentFirms.linkedinUrl
    })
    .from(investmentFirms)
    .where(
      or(
        sql`${investmentFirms.website} IS NOT NULL AND ${investmentFirms.website} != ''`,
        sql`${investmentFirms.linkedinUrl} IS NOT NULL AND ${investmentFirms.linkedinUrl} != ''`
      )
    )
    .limit(limit);

    for (const firm of firms) {
      if (firm.website) {
        records.push({
          id: `firm-website-${firm.id}`,
          entityType: "investmentFirm",
          entityId: firm.id.toString(),
          fieldName: "website",
          url: firm.website,
          entityName: firm.name || "Unknown Firm"
        });
      }
      if (firm.linkedinUrl) {
        records.push({
          id: `firm-linkedin-${firm.id}`,
          entityType: "investmentFirm",
          entityId: firm.id.toString(),
          fieldName: "linkedinUrl",
          url: firm.linkedinUrl,
          entityName: firm.name || "Unknown Firm"
        });
      }
    }
  }

  if (entityScope === "all" || entityScope === "investors") {
    const invs = await db.select({
      id: investors.id,
      firstName: investors.firstName,
      lastName: investors.lastName,
      linkedinUrl: investors.linkedinUrl,
      twitterUrl: investors.twitterUrl
    })
    .from(investors)
    .where(
      or(
        sql`${investors.linkedinUrl} IS NOT NULL AND ${investors.linkedinUrl} != ''`,
        sql`${investors.twitterUrl} IS NOT NULL AND ${investors.twitterUrl} != ''`
      )
    )
    .limit(limit);

    for (const inv of invs) {
      const investorName = [inv.firstName, inv.lastName].filter(Boolean).join(" ") || "Unknown Investor";
      if (inv.linkedinUrl) {
        records.push({
          id: `investor-linkedin-${inv.id}`,
          entityType: "investor",
          entityId: inv.id.toString(),
          fieldName: "linkedinUrl",
          url: inv.linkedinUrl,
          entityName: investorName
        });
      }
      if (inv.twitterUrl) {
        records.push({
          id: `investor-twitter-${inv.id}`,
          entityType: "investor",
          entityId: inv.id.toString(),
          fieldName: "twitterUrl",
          url: inv.twitterUrl,
          entityName: investorName
        });
      }
    }
  }

  if (entityScope === "all" || entityScope === "businessmen") {
    const biz = await db.select({
      id: businessmen.id,
      firstName: businessmen.firstName,
      lastName: businessmen.lastName,
      linkedinUrl: businessmen.linkedinUrl,
      website: businessmen.website
    })
    .from(businessmen)
    .where(
      or(
        sql`${businessmen.linkedinUrl} IS NOT NULL AND ${businessmen.linkedinUrl} != ''`,
        sql`${businessmen.website} IS NOT NULL AND ${businessmen.website} != ''`
      )
    )
    .limit(limit);

    for (const b of biz) {
      const bizName = [b.firstName, b.lastName].filter(Boolean).join(" ") || "Unknown";
      if (b.linkedinUrl) {
        records.push({
          id: `businessman-linkedin-${b.id}`,
          entityType: "businessman",
          entityId: b.id.toString(),
          fieldName: "linkedinUrl",
          url: b.linkedinUrl,
          entityName: bizName
        });
      }
      if (b.website) {
        records.push({
          id: `businessman-website-${b.id}`,
          entityType: "businessman",
          entityId: b.id.toString(),
          fieldName: "website",
          url: b.website,
          entityName: bizName
        });
      }
    }
  }

  return records;
}

export async function startUrlHealthJob(
  entityScope: string,
  startedBy: string,
  options: { includeAutoFix?: boolean; confidenceThreshold?: number } = {}
): Promise<UrlHealthJob> {
  const [job] = await db.insert(urlHealthJobs).values({
    entityScope,
    status: "pending",
    includeAutoFix: options.includeAutoFix ?? true,
    confidenceThreshold: options.confidenceThreshold ?? 0.85,
    startedBy
  }).returning();

  return job;
}

export async function processUrlHealthJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(urlHealthJobs).where(eq(urlHealthJobs.id, jobId));
  if (!job) return;

  await db.update(urlHealthJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(urlHealthJobs.id, jobId));

  try {
    const records = await getEntitiesWithUrls(job.entityScope, 1000);
    
    await db.update(urlHealthJobs)
      .set({ totalRecords: records.length })
      .where(eq(urlHealthJobs.id, jobId));

    let processedCount = 0;
    let validCount = 0;
    let brokenCount = 0;

    for (const record of records) {
      const [currentJob] = await db.select().from(urlHealthJobs).where(eq(urlHealthJobs.id, jobId));
      if (currentJob?.status === "cancelled") {
        break;
      }

      const validationResult = await validateUrl(record.url);

      const [existing] = await db.select()
        .from(urlHealthChecks)
        .where(
          and(
            eq(urlHealthChecks.entityType, record.entityType),
            eq(urlHealthChecks.entityId, record.entityId),
            eq(urlHealthChecks.fieldName, record.fieldName)
          )
        );

      if (existing) {
        await db.update(urlHealthChecks)
          .set({
            originalUrl: record.url,
            canonicalUrl: validationResult.canonicalUrl,
            httpStatus: validationResult.httpStatus,
            redirectChain: validationResult.redirectChain,
            healthStatus: validationResult.healthStatus,
            confidence: validationResult.confidence,
            isParkedDomain: validationResult.isParkedDomain,
            isExpired: validationResult.isExpired,
            hasLoginOnly: validationResult.hasLoginOnly,
            contentLength: validationResult.contentLength,
            pageTitle: validationResult.pageTitle,
            lastCheckedAt: new Date(),
            checkCount: (existing.checkCount || 0) + 1,
            errorMessage: validationResult.errorMessage,
            processingState: "completed",
            updatedAt: new Date()
          })
          .where(eq(urlHealthChecks.id, existing.id));
      } else {
        await db.insert(urlHealthChecks).values({
          entityType: record.entityType,
          entityId: record.entityId,
          fieldName: record.fieldName,
          originalUrl: record.url,
          canonicalUrl: validationResult.canonicalUrl,
          httpStatus: validationResult.httpStatus,
          redirectChain: validationResult.redirectChain,
          healthStatus: validationResult.healthStatus,
          confidence: validationResult.confidence,
          isParkedDomain: validationResult.isParkedDomain,
          isExpired: validationResult.isExpired,
          hasLoginOnly: validationResult.hasLoginOnly,
          contentLength: validationResult.contentLength,
          pageTitle: validationResult.pageTitle,
          lastCheckedAt: new Date(),
          checkCount: 1,
          errorMessage: validationResult.errorMessage,
          processingState: "completed"
        });
      }

      processedCount++;
      if (validationResult.healthStatus === "valid" || validationResult.healthStatus === "redirected") {
        validCount++;
      } else if (["parked", "expired", "unreachable"].includes(validationResult.healthStatus)) {
        brokenCount++;
      }

      if (processedCount % 10 === 0) {
        await db.update(urlHealthJobs)
          .set({ 
            processedRecords: processedCount,
            validUrls: validCount,
            brokenUrls: brokenCount
          })
          .where(eq(urlHealthJobs.id, jobId));
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    await db.update(urlHealthJobs)
      .set({
        status: "completed",
        processedRecords: processedCount,
        validUrls: validCount,
        brokenUrls: brokenCount,
        completedAt: new Date()
      })
      .where(eq(urlHealthJobs.id, jobId));

  } catch (error: any) {
    await db.update(urlHealthJobs)
      .set({
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date()
      })
      .where(eq(urlHealthJobs.id, jobId));
  }
}

export async function cancelUrlHealthJob(jobId: string): Promise<void> {
  await db.update(urlHealthJobs)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(urlHealthJobs.id, jobId));
}

export async function getActiveUrlHealthJob(): Promise<UrlHealthJob | null> {
  const [job] = await db.select()
    .from(urlHealthJobs)
    .where(inArray(urlHealthJobs.status, ["pending", "running"]))
    .limit(1);
  return job || null;
}

export async function getUrlHealthStats(entityScope: string = "all"): Promise<{
  total: number;
  valid: number;
  redirected: number;
  broken: number;
  pending: number;
}> {
  let whereClause = sql`1=1`;
  
  if (entityScope !== "all") {
    const entityType = entityScope === "investmentFirms" ? "investmentFirm" : 
                       entityScope === "investors" ? "investor" : "businessman";
    whereClause = eq(urlHealthChecks.entityType, entityType);
  }

  const [stats] = await db.select({
    total: sql<number>`COUNT(*)::int`,
    valid: sql<number>`SUM(CASE WHEN ${urlHealthChecks.healthStatus} = 'valid' THEN 1 ELSE 0 END)::int`,
    redirected: sql<number>`SUM(CASE WHEN ${urlHealthChecks.healthStatus} = 'redirected' THEN 1 ELSE 0 END)::int`,
    broken: sql<number>`SUM(CASE WHEN ${urlHealthChecks.healthStatus} IN ('parked', 'expired', 'unreachable') THEN 1 ELSE 0 END)::int`,
    pending: sql<number>`SUM(CASE WHEN ${urlHealthChecks.healthStatus} = 'pending' THEN 1 ELSE 0 END)::int`
  })
  .from(urlHealthChecks)
  .where(whereClause);

  return {
    total: stats?.total || 0,
    valid: stats?.valid || 0,
    redirected: stats?.redirected || 0,
    broken: stats?.broken || 0,
    pending: stats?.pending || 0
  };
}

export async function getUrlHealthChecks(
  entityScope: string = "all",
  healthStatus?: UrlHealthStatus,
  limit: number = 50,
  offset: number = 0
): Promise<UrlHealthCheck[]> {
  let conditions = [];
  
  if (entityScope !== "all") {
    const entityType = entityScope === "investmentFirms" ? "investmentFirm" : 
                       entityScope === "investors" ? "investor" : "businessman";
    conditions.push(eq(urlHealthChecks.entityType, entityType));
  }
  
  if (healthStatus) {
    conditions.push(eq(urlHealthChecks.healthStatus, healthStatus));
  }

  const query = db.select()
    .from(urlHealthChecks)
    .orderBy(sql`${urlHealthChecks.lastCheckedAt} DESC NULLS LAST`)
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }
  
  return await query;
}
