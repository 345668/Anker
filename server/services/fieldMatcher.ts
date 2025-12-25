import { storage } from "../storage";
import type { FolkFieldDefinition, FolkFieldMapping } from "@shared/schema";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

interface FieldMatchSuggestion {
  folkFieldKey: string;
  folkFieldName: string;
  targetTable: string;
  targetColumn: string | null;
  storeInJson: boolean;
  confidence: number;
  reason: string;
}

interface FieldMatchResult {
  suggestions: FieldMatchSuggestion[];
  unmatchedFields: string[];
}

const INVESTOR_COLUMNS = [
  { name: "firstName", type: "string", description: "First name of the investor" },
  { name: "lastName", type: "string", description: "Last name of the investor" },
  { name: "email", type: "string", description: "Email address" },
  { name: "phone", type: "string", description: "Phone number" },
  { name: "title", type: "string", description: "Job title or position" },
  { name: "company", type: "string", description: "Company or firm name" },
  { name: "linkedinUrl", type: "string", description: "LinkedIn profile URL" },
  { name: "personLinkedinUrl", type: "string", description: "Personal LinkedIn URL" },
  { name: "website", type: "string", description: "Website URL" },
  { name: "investorType", type: "string", description: "Type of investor (VC, Angel, etc.)" },
  { name: "investorState", type: "string", description: "State/region location" },
  { name: "investorCountry", type: "string", description: "Country location" },
  { name: "fundHQ", type: "string", description: "Fund headquarters location" },
  { name: "hqLocation", type: "string", description: "Headquarters location" },
  { name: "fundingStage", type: "string", description: "Preferred funding stages" },
  { name: "typicalInvestment", type: "string", description: "Typical investment amount" },
  { name: "numLeadInvestments", type: "integer", description: "Number of lead investments" },
  { name: "totalInvestments", type: "integer", description: "Total number of investments" },
  { name: "recentInvestments", type: "string", description: "Recent investment activity" },
  { name: "status", type: "string", description: "Status in pipeline" },
  { name: "bio", type: "string", description: "Biography or description" },
  { name: "notes", type: "string", description: "General notes" },
];

const INVESTMENT_FIRM_COLUMNS = [
  { name: "name", type: "string", description: "Firm name" },
  { name: "description", type: "string", description: "Firm description" },
  { name: "website", type: "string", description: "Website URL" },
  { name: "logo", type: "string", description: "Logo URL" },
  { name: "type", type: "string", description: "Firm type (VC, Angel, Accelerator, PE, CVC)" },
  { name: "aum", type: "string", description: "Assets under management" },
  { name: "location", type: "string", description: "Location" },
  { name: "hqLocation", type: "string", description: "Headquarters location" },
  { name: "stages", type: "array", description: "Investment stages (Pre-seed, Seed, Series A, etc.)" },
  { name: "sectors", type: "array", description: "Industry sectors" },
  { name: "industry", type: "string", description: "Primary industry" },
  { name: "checkSizeMin", type: "integer", description: "Minimum check size" },
  { name: "checkSizeMax", type: "integer", description: "Maximum check size" },
  { name: "portfolioCount", type: "integer", description: "Number of portfolio companies" },
  { name: "linkedinUrl", type: "string", description: "LinkedIn URL" },
  { name: "twitterUrl", type: "string", description: "Twitter URL" },
  { name: "fundingRaised", type: "string", description: "Total funding raised" },
  { name: "lastFundingDate", type: "string", description: "Date of last funding round" },
  { name: "foundationYear", type: "string", description: "Year founded" },
  { name: "employeeRange", type: "string", description: "Employee count range" },
  { name: "status", type: "string", description: "Status in pipeline" },
];

function normalizeFieldKey(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectFieldType(values: any[]): string {
  if (!values || values.length === 0) return "string";
  
  const nonNullValues = values.filter(v => v != null);
  if (nonNullValues.length === 0) return "string";
  
  const firstValue = nonNullValues[0];
  
  if (typeof firstValue === "number") return "number";
  if (typeof firstValue === "boolean") return "boolean";
  if (Array.isArray(firstValue)) return "array";
  if (typeof firstValue === "object") return "object";
  
  const strValue = String(firstValue);
  
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(strValue)) return "email";
  if (/^https?:\/\//.test(strValue) || /linkedin\.com|twitter\.com/.test(strValue)) return "url";
  if (/^\+?[\d\s()-]{7,}$/.test(strValue)) return "phone";
  if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) return "date";
  if (/^\d+$/.test(strValue)) return "number";
  
  return "string";
}

export async function discoverFieldsFromFolkData(
  groupId: string,
  records: any[]
): Promise<FolkFieldDefinition[]> {
  const fieldMap = new Map<string, { name: string; values: any[]; count: number; isCustom: boolean }>();
  
  for (const record of records) {
    const standardFields: Record<string, any> = {
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: record.fullName || record.name,
      emails: record.emails,
      phones: record.phones,
      jobTitle: record.jobTitle,
      linkedinUrl: record.linkedinUrl,
    };
    
    for (const [key, value] of Object.entries(standardFields)) {
      if (value != null) {
        const existing = fieldMap.get(key) || { name: key, values: [], count: 0, isCustom: false };
        existing.values.push(value);
        existing.count++;
        fieldMap.set(key, existing);
      }
    }
    
    const customFields = record.customFieldValues || record.customFields || {};
    for (const [key, value] of Object.entries(customFields)) {
      if (value != null) {
        const fieldKey = normalizeFieldKey(key);
        const existing = fieldMap.get(fieldKey) || { name: key, values: [], count: 0, isCustom: true };
        existing.values.push(value);
        existing.count++;
        existing.isCustom = true;
        fieldMap.set(fieldKey, existing);
      }
    }
    
    if (record.groups) {
      for (const group of record.groups) {
        if (group.customFieldValues) {
          for (const [key, value] of Object.entries(group.customFieldValues)) {
            if (value != null) {
              const fieldKey = normalizeFieldKey(key);
              const existing = fieldMap.get(fieldKey) || { name: key, values: [], count: 0, isCustom: true };
              existing.values.push(value);
              existing.count++;
              existing.isCustom = true;
              fieldMap.set(fieldKey, existing);
            }
          }
        }
      }
    }
  }
  
  const definitions: FolkFieldDefinition[] = [];
  
  for (const [fieldKey, data] of Array.from(fieldMap.entries())) {
    const sampleValues = data.values.slice(0, 5);
    const fieldType = detectFieldType(sampleValues);
    
    const definition = await storage.upsertFolkFieldDefinition({
      groupId,
      fieldName: data.name,
      fieldKey,
      fieldType,
      sampleValues,
      occurrenceCount: data.count,
      isCustomField: data.isCustom,
    });
    
    definitions.push(definition);
  }
  
  return definitions;
}

export async function generateAIFieldMappings(
  groupId: string,
  targetTable: "investors" | "investment_firms" = "investors"
): Promise<FieldMatchResult> {
  const definitions = await storage.getFolkFieldDefinitions(groupId);
  
  if (definitions.length === 0) {
    return { suggestions: [], unmatchedFields: [] };
  }
  
  const targetColumns = targetTable === "investors" ? INVESTOR_COLUMNS : INVESTMENT_FIRM_COLUMNS;
  
  const folkFields = definitions.map(d => ({
    key: d.fieldKey,
    name: d.fieldName,
    type: d.fieldType,
    samples: d.sampleValues?.slice(0, 3),
    isCustom: d.isCustomField,
  }));
  
  const prompt = `You are a data mapping expert. Given Folk CRM fields and target database columns, suggest the best mappings.

Folk CRM Fields (from the data source):
${JSON.stringify(folkFields, null, 2)}

Target Database Columns (${targetTable} table):
${JSON.stringify(targetColumns, null, 2)}

For each Folk field, determine:
1. If it maps to an existing column, which one?
2. Confidence score (0-100) for the mapping
3. Brief reason for the suggestion

Respond with valid JSON only, in this exact format:
{
  "mappings": [
    {
      "folkFieldKey": "field_name",
      "targetColumn": "columnName or null if no match",
      "storeInJson": true/false,
      "confidence": 85,
      "reason": "Brief explanation"
    }
  ]
}

Rules:
- If a field clearly maps to a column, set targetColumn and storeInJson=false
- If no good match, set targetColumn=null and storeInJson=true (store in JSON metadata)
- Standard fields (firstName, lastName, email, etc.) should map directly
- Custom fields with no match should go to JSON storage
- Be conservative: only suggest high confidence matches`;

  try {
    if (!MISTRAL_API_KEY) {
      return generateFallbackMappings(definitions, targetTable);
    }
    
    const response = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    
    if (!response.ok) {
      console.error("Mistral API error:", await response.text());
      return generateFallbackMappings(definitions, targetTable);
    }
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) {
      return generateFallbackMappings(definitions, targetTable);
    }
    
    const parsed = JSON.parse(content);
    const suggestions: FieldMatchSuggestion[] = [];
    const unmatchedFields: string[] = [];
    
    for (const mapping of parsed.mappings || []) {
      const definition = definitions.find(d => d.fieldKey === mapping.folkFieldKey);
      if (!definition) continue;
      
      suggestions.push({
        folkFieldKey: mapping.folkFieldKey,
        folkFieldName: definition.fieldName,
        targetTable,
        targetColumn: mapping.targetColumn,
        storeInJson: mapping.storeInJson ?? (mapping.targetColumn === null),
        confidence: mapping.confidence || 50,
        reason: mapping.reason || "AI suggested mapping",
      });
      
      if (!mapping.targetColumn) {
        unmatchedFields.push(mapping.folkFieldKey);
      }
    }
    
    return { suggestions, unmatchedFields };
    
  } catch (error) {
    console.error("AI field matching error:", error);
    return generateFallbackMappings(definitions, targetTable);
  }
}

function generateFallbackMappings(
  definitions: FolkFieldDefinition[],
  targetTable: "investors" | "investment_firms"
): FieldMatchResult {
  const targetColumns = targetTable === "investors" ? INVESTOR_COLUMNS : INVESTMENT_FIRM_COLUMNS;
  const suggestions: FieldMatchSuggestion[] = [];
  const unmatchedFields: string[] = [];
  
  const directMappings: Record<string, string> = {
    firstname: "firstName",
    first_name: "firstName",
    lastname: "lastName",
    last_name: "lastName",
    email: "email",
    emails: "email",
    phone: "phone",
    phones: "phone",
    title: "title",
    jobtitle: "title",
    job_title: "title",
    linkedin: "linkedinUrl",
    linkedinurl: "linkedinUrl",
    linkedin_url: "linkedinUrl",
    website: "website",
    company: "company",
    bio: "bio",
    notes: "notes",
    location: "hqLocation",
    hqlocation: "hqLocation",
    hq_location: "hqLocation",
    country: "investorCountry",
    state: "investorState",
    type: "investorType",
    investor_type: "investorType",
    status: "status",
  };
  
  for (const definition of definitions) {
    const normalizedKey = definition.fieldKey.toLowerCase();
    const directMatch = directMappings[normalizedKey];
    
    if (directMatch && targetColumns.some(c => c.name === directMatch)) {
      suggestions.push({
        folkFieldKey: definition.fieldKey,
        folkFieldName: definition.fieldName,
        targetTable,
        targetColumn: directMatch,
        storeInJson: false,
        confidence: 90,
        reason: "Direct field name match",
      });
    } else {
      const fuzzyMatch = targetColumns.find(c => 
        c.name.toLowerCase() === normalizedKey ||
        c.name.toLowerCase().includes(normalizedKey) ||
        normalizedKey.includes(c.name.toLowerCase())
      );
      
      if (fuzzyMatch) {
        suggestions.push({
          folkFieldKey: definition.fieldKey,
          folkFieldName: definition.fieldName,
          targetTable,
          targetColumn: fuzzyMatch.name,
          storeInJson: false,
          confidence: 70,
          reason: "Fuzzy field name match",
        });
      } else {
        suggestions.push({
          folkFieldKey: definition.fieldKey,
          folkFieldName: definition.fieldName,
          targetTable,
          targetColumn: null,
          storeInJson: true,
          confidence: 100,
          reason: "No matching column, stored in custom fields JSON",
        });
        unmatchedFields.push(definition.fieldKey);
      }
    }
  }
  
  return { suggestions, unmatchedFields };
}

export async function saveFieldMappings(
  groupId: string,
  suggestions: FieldMatchSuggestion[],
  userId?: string
): Promise<FolkFieldMapping[]> {
  const savedMappings: FolkFieldMapping[] = [];
  
  for (const suggestion of suggestions) {
    const existing = await storage.getFolkFieldMappingByKey(groupId, suggestion.folkFieldKey);
    
    if (existing) {
      const updated = await storage.updateFolkFieldMapping(existing.id, {
        targetColumn: suggestion.targetColumn,
        storeInJson: suggestion.storeInJson,
        aiConfidence: suggestion.confidence,
        aiReason: suggestion.reason,
      });
      if (updated) savedMappings.push(updated);
    } else {
      const created = await storage.createFolkFieldMapping({
        groupId,
        folkFieldKey: suggestion.folkFieldKey,
        targetTable: suggestion.targetTable,
        targetColumn: suggestion.targetColumn,
        storeInJson: suggestion.storeInJson,
        aiConfidence: suggestion.confidence,
        aiReason: suggestion.reason,
      });
      savedMappings.push(created);
    }
  }
  
  return savedMappings;
}

export async function approveFieldMapping(
  mappingId: string,
  userId: string
): Promise<FolkFieldMapping | undefined> {
  return storage.updateFolkFieldMapping(mappingId, {
    isApproved: true,
    approvedBy: userId,
    approvedAt: new Date(),
  });
}

export async function getApprovedMappings(groupId: string): Promise<Map<string, FolkFieldMapping>> {
  const mappings = await storage.getFolkFieldMappings(groupId);
  const approvedMap = new Map<string, FolkFieldMapping>();
  
  for (const mapping of mappings) {
    if (mapping.isApproved) {
      approvedMap.set(mapping.folkFieldKey, mapping);
    }
  }
  
  return approvedMap;
}
