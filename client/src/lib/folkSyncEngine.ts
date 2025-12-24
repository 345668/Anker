import { apiRequest } from "./queryClient";

interface SyncResults {
  created: number;
  updated: number;
  skipped: number;
  errors: { type: string; id: string; error: string }[];
}

interface FullSyncResults {
  fromFolk: SyncResults;
  toFolk: SyncResults;
  totalTime: number;
}

function mapFirmToFolk(firm: any) {
  return {
    name: firm.company_name || firm.name,
    description: firm.firm_description || firm.description || undefined,
    industry: firm.industry || undefined,
    foundationYear: firm.foundation_year || firm.foundationYear || undefined,
    employeeRange: firm.employee_range || firm.employeeRange || undefined,
    fundingRaised: firm.funding_raised?.toString() || firm.fundingRaised?.toString() || undefined,
    lastFundingDate: firm.last_funding_date || firm.lastFundingDate || undefined,
    addresses: firm.addresses?.length ? firm.addresses : undefined,
    emails: firm.emails?.length ? firm.emails : undefined,
    phones: firm.phones?.length ? firm.phones : undefined,
    urls: firm.urls?.length ? firm.urls : (firm.website ? [firm.website] : undefined),
  };
}

function mapContactToFolk(contact: any) {
  const firstName = contact.first_name || contact.firstName;
  const lastName = contact.last_name || contact.lastName;
  const fullName = contact.full_name || contact.fullName || `${firstName || ""} ${lastName || ""}`.trim();
  
  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    fullName: fullName,
    description: contact.bio || contact.description || undefined,
    birthday: contact.birthday || undefined,
    jobTitle: contact.title || contact.jobTitle || undefined,
    addresses: contact.addresses?.length ? contact.addresses : undefined,
    emails: contact.emails?.length ? contact.emails : (contact.work_email || contact.email ? [contact.work_email || contact.email] : undefined),
    phones: contact.phones?.length ? contact.phones : (contact.primary_phone || contact.phone ? [contact.primary_phone || contact.phone] : undefined),
    urls: contact.urls?.length ? contact.urls : undefined,
  };
}

export async function syncFromFolk(
  groupId: string, 
  onProgress?: (progress: number) => void
): Promise<SyncResults> {
  const results: SyncResults = { created: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const res = await apiRequest("POST", "/api/admin/folk/import", { groupId });
    const data = await res.json();
    
    if (data.created) results.created = data.created;
    if (data.updated) results.updated = data.updated;
    if (data.skipped) results.skipped = data.skipped;
    if (data.failed) {
      results.errors = Array(data.failed).fill({ type: "unknown", id: "", error: "Import failed" });
    }
    
    onProgress?.(100);
  } catch (error: any) {
    throw new Error(`Sync from Folk failed: ${error.message}`);
  }

  return results;
}

export async function syncToFolk(
  onProgress?: (progress: number) => void
): Promise<SyncResults> {
  const results: SyncResults = { created: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const res = await apiRequest("POST", "/api/admin/folk/sync-to-folk", {});
    const data = await res.json();
    
    if (data.created) results.created = data.created;
    if (data.updated) results.updated = data.updated;
    if (data.skipped) results.skipped = data.skipped;
    
    onProgress?.(100);
  } catch (error: any) {
    throw new Error(`Sync to Folk failed: ${error.message}`);
  }

  return results;
}

export async function fullSync(
  groupId: string,
  onProgress?: (info: { stage: string; progress: number }) => void
): Promise<FullSyncResults> {
  const results: FullSyncResults = {
    fromFolk: { created: 0, updated: 0, skipped: 0, errors: [] },
    toFolk: { created: 0, updated: 0, skipped: 0, errors: [] },
    totalTime: 0,
  };

  const startTime = Date.now();

  onProgress?.({ stage: "pull", progress: 0 });
  results.fromFolk = await syncFromFolk(groupId, (progress) => {
    onProgress?.({ stage: "pull", progress });
  });

  onProgress?.({ stage: "push", progress: 0 });
  results.toFolk = await syncToFolk((progress) => {
    onProgress?.({ stage: "push", progress });
  });

  results.totalTime = Date.now() - startTime;

  return results;
}

export { mapFirmToFolk, mapContactToFolk };
