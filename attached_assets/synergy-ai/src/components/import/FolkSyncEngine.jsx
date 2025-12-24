import { base44 } from '@/api/base44Client';

// Conflict resolution: last-write-wins based on timestamps
function resolveConflict(localRecord, folkRecord) {
  const localUpdated = new Date(localRecord.updated_date);
  const folkUpdated = new Date(folkRecord.createdAt); // Folk doesn't expose updated_date
  const localSynced = localRecord.last_synced_at ? new Date(localRecord.last_synced_at) : new Date(0);

  // If local was updated after last sync, local wins
  if (localUpdated > localSynced) {
    return 'local';
  }

  // Otherwise Folk wins (has newer data)
  return 'folk';
}

// Map app data to Folk format
function mapFirmToFolk(firm) {
  return {
    name: firm.company_name,
    description: firm.firm_description || undefined,
    industry: firm.industry || undefined,
    foundationYear: firm.foundation_year || undefined,
    employeeRange: firm.employee_range || undefined,
    fundingRaised: firm.funding_raised?.toString() || undefined,
    lastFundingDate: firm.last_funding_date || undefined,
    addresses: firm.addresses?.length ? firm.addresses : undefined,
    emails: firm.emails?.length ? firm.emails : undefined,
    phones: firm.phones?.length ? firm.phones : undefined,
    urls: firm.urls?.length ? firm.urls : (firm.website ? [firm.website] : undefined),
  };
}

function mapContactToFolk(contact) {
  return {
    firstName: contact.first_name || undefined,
    lastName: contact.last_name || undefined,
    fullName: contact.full_name,
    description: contact.bio || undefined,
    birthday: contact.birthday || undefined,
    jobTitle: contact.title || undefined,
    addresses: contact.addresses?.length ? contact.addresses : undefined,
    emails: contact.emails?.length ? contact.emails : undefined,
    phones: contact.phones?.length ? contact.phones : undefined,
    urls: contact.urls?.length ? contact.urls : undefined,
  };
}

// Map Folk data to app format
function mapFolkToFirm(company) {
  const firmData = {
    folk_id: company.id,
    company_name: company.name,
    firm_description: company.description,
    industry: company.industry,
    foundation_year: company.foundationYear,
    employee_range: company.employeeRange,
    funding_raised: company.fundingRaised ? parseFloat(company.fundingRaised) : null,
    last_funding_date: company.lastFundingDate,
    website: company.urls?.[0] || null,
    urls: company.urls || [],
    emails: company.emails || [],
    phones: company.phones || [],
    addresses: company.addresses || [],
    linkedin_url: company.urls?.find(u => u.includes('linkedin.com')),
    folk_groups: company.groups || [],
    folk_custom_fields: company.customFieldValues || {},
    folk_created_at: company.createdAt,
    folk_created_by: company.createdBy,
    last_synced_at: new Date().toISOString(),
  };

  // Parse first address
  if (company.addresses?.[0]) {
    const addressParts = company.addresses[0].split(',').map(p => p.trim());
    if (addressParts.length >= 3) {
      firmData.street_address = addressParts[0];
      firmData.city = addressParts[1];
      firmData.country = addressParts[2];
    } else if (addressParts.length === 2) {
      firmData.city = addressParts[0];
      firmData.country = addressParts[1];
    }
  }

  return firmData;
}

function mapFolkToContact(person, companies = []) {
  const companyId = person.companies?.[0]?.id;
  const company = companyId ? companies.find(c => c.id === companyId) : null;
  const companyName = company?.name || person.companies?.[0]?.name;

  return {
    folk_id: person.id,
    full_name: person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
    first_name: person.firstName,
    last_name: person.lastName,
    title: person.jobTitle,
    bio: person.description,
    birthday: person.birthday,
    work_email: person.emails?.[0],
    emails: person.emails || [],
    primary_phone: person.phones?.[0],
    phones: person.phones || [],
    addresses: person.addresses || [],
    urls: person.urls || [],
    linkedin_url: person.urls?.find(u => u.includes('linkedin.com')),
    twitter_url: person.urls?.find(u => u.includes('twitter.com') || u.includes('x.com')),
    location: person.addresses?.[0],
    firm_name: companyName,
    folk_companies: person.companies || [],
    folk_groups: person.groups || [],
    folk_custom_fields: person.customFieldValues || {},
    folk_interaction_metadata: person.interactionMetadata || {},
    folk_created_at: person.createdAt,
    folk_created_by: person.createdBy,
    last_synced_at: new Date().toISOString(),
  };
}

// Sync FROM Folk TO App (pull)
export async function syncFromFolk(groupName = 'All VCs', onProgress) {
  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  try {
    // Fetch from Folk via backend
    const { data: folkData } = await base44.functions.invoke('folkApi', { 
      action: 'fetchGroupData',
      groupName 
    });

    if (!folkData.success) {
      throw new Error(folkData.error || 'Failed to fetch data from Folk');
    }

    const folkCompanies = folkData.companies;
    const folkPeople = folkData.people;

    // Get existing records
    const existingFirms = await base44.entities.InvestorFirm.list('company_name', 1000);
    const existingContacts = await base44.entities.Contact.list('full_name', 1000);

    const firmsByFolkId = existingFirms.reduce((acc, f) => {
      if (f.folk_id) acc[f.folk_id] = f;
      return acc;
    }, {});

    const contactsByFolkId = existingContacts.reduce((acc, c) => {
      if (c.folk_id) acc[c.folk_id] = c;
      return acc;
    }, {});

    const firmsByName = existingFirms.reduce((acc, f) => {
      acc[f.company_name.toLowerCase().trim()] = f.id;
      return acc;
    }, {});

    let processed = 0;
    const total = folkCompanies.length + folkPeople.length;

    // Sync companies
    for (const company of folkCompanies) {
      try {
        const existingFirm = firmsByFolkId[company.id];
        const firmData = mapFolkToFirm(company);

        if (existingFirm) {
          // Check for conflicts
          const winner = resolveConflict(existingFirm, company);
          if (winner === 'folk') {
            await base44.entities.InvestorFirm.update(existingFirm.id, firmData);
            results.updated++;
          } else {
            results.skipped++;
          }
        } else {
          const newFirm = await base44.entities.InvestorFirm.create(firmData);
          firmsByName[company.name.toLowerCase().trim()] = newFirm.id;
          results.created++;
        }
      } catch (error) {
        results.errors.push({ type: 'company', id: company.id, error: error.message });
      }

      processed++;
      if (onProgress) onProgress(Math.round((processed / total) * 100));
    }

    // Sync people
    for (const person of folkPeople) {
      try {
        const existingContact = contactsByFolkId[person.id];
        const contactData = mapFolkToContact(person, folkCompanies);

        // Link to firm
        const companyName = contactData.firm_name;
        if (companyName) {
          contactData.firm_id = firmsByName[companyName.toLowerCase().trim()];
        }

        if (existingContact) {
          const winner = resolveConflict(existingContact, person);
          if (winner === 'folk') {
            await base44.entities.Contact.update(existingContact.id, contactData);
            results.updated++;
          } else {
            results.skipped++;
          }
        } else {
          await base44.entities.Contact.create(contactData);
          results.created++;
        }
      } catch (error) {
        results.errors.push({ type: 'person', id: person.id, error: error.message });
      }

      processed++;
      if (onProgress) onProgress(Math.round((processed / total) * 100));
    }
  } catch (error) {
    throw new Error(`Sync from Folk failed: ${error.message}`);
  }

  return results;
}

// Sync FROM App TO Folk (push)
export async function syncToFolk(onProgress) {
  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const firms = await base44.entities.InvestorFirm.list('-updated_date', 1000);
    const contacts = await base44.entities.Contact.list('-updated_date', 1000);

    let processed = 0;
    const total = firms.length + contacts.length;

    // Sync firms that were updated since last sync
    for (const firm of firms) {
      try {
        const lastSynced = firm.last_synced_at ? new Date(firm.last_synced_at) : new Date(0);
        const lastUpdated = new Date(firm.updated_date);

        // Only sync if updated after last sync
        if (lastUpdated > lastSynced) {
          const folkData = mapFirmToFolk(firm);

          if (firm.folk_id) {
            // Update existing in Folk
            const { data: response } = await base44.functions.invoke('folkApi', {
              action: 'updateCompany',
              data: { id: firm.folk_id, updates: folkData }
            });
            if (response.success) results.updated++;
          } else {
            // Create new in Folk
            const { data: response } = await base44.functions.invoke('folkApi', {
              action: 'createCompany',
              data: folkData
            });
            if (response.success) {
              await base44.entities.InvestorFirm.update(firm.id, { 
                folk_id: response.company.id,
                last_synced_at: new Date().toISOString()
              });
              results.created++;
            }
          }

          // Update sync timestamp
          await base44.entities.InvestorFirm.update(firm.id, {
            last_synced_at: new Date().toISOString()
          });
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.errors.push({ type: 'firm', id: firm.id, error: error.message });
      }

      processed++;
      if (onProgress) onProgress(Math.round((processed / total) * 100));
    }

    // Sync contacts
    for (const contact of contacts) {
      try {
        const lastSynced = contact.last_synced_at ? new Date(contact.last_synced_at) : new Date(0);
        const lastUpdated = new Date(contact.updated_date);

        if (lastUpdated > lastSynced) {
          const folkData = mapContactToFolk(contact);

          if (contact.folk_id) {
            const { data: response } = await base44.functions.invoke('folkApi', {
              action: 'updatePerson',
              data: { id: contact.folk_id, updates: folkData }
            });
            if (response.success) results.updated++;
          } else {
            const { data: response } = await base44.functions.invoke('folkApi', {
              action: 'createPerson',
              data: folkData
            });
            if (response.success) {
              await base44.entities.Contact.update(contact.id, {
                folk_id: response.person.id,
                last_synced_at: new Date().toISOString()
              });
              results.created++;
            }
          }

          await base44.entities.Contact.update(contact.id, {
            last_synced_at: new Date().toISOString()
          });
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.errors.push({ type: 'contact', id: contact.id, error: error.message });
      }

      processed++;
      if (onProgress) onProgress(Math.round((processed / total) * 100));
    }
  } catch (error) {
    throw new Error(`Sync to Folk failed: ${error.message}`);
  }

  return results;
}

// Full bi-directional sync
export async function fullSync(groupName = 'All VCs', onProgress) {
  const results = {
    fromFolk: null,
    toFolk: null,
    totalTime: 0
  };

  const startTime = Date.now();

  // First pull from Folk
  results.fromFolk = await syncFromFolk(groupName, (progress) => {
    if (onProgress) onProgress({ stage: 'pull', progress });
  });

  // Then push to Folk
  results.toFolk = await syncToFolk((progress) => {
    if (onProgress) onProgress({ stage: 'push', progress });
  });

  results.totalTime = Date.now() - startTime;

  return results;
}