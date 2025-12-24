import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { 
  Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle,
  ArrowRight, Building2, Users, ChevronDown, ChevronUp, Info, Sparkles
} from 'lucide-react';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Comprehensive column mapping for investor databases
const investorColumnMappings = [
  // Firm fields
  { key: 'company_name', label: 'Company/Firm Name', required: true, aliases: ['Company Name', 'Firm Name', 'Family Office Name', 'Fund Name', 'Organization'] },
  { key: 'parent_company', label: 'Parent Company', aliases: ['Parent Company', 'Parent Org'] },
  { key: 'firm_type', label: 'Investor Type', aliases: ['Investor Type', 'Fund Type', 'Type', 'Organization Type', 'Family Office Structure'] },
  { key: 'website', label: 'Website', aliases: ['Website', 'Family Office Website Address', 'URL', 'Company Website'] },
  { key: 'linkedin_url', label: 'Firm LinkedIn', aliases: ['Firm LinkedIn Address', 'Corporate Linkedin Address', 'Company LinkedIn', 'LinkedIn'] },
  { key: 'firm_description', label: 'Description', aliases: ['Firm Description', 'Family Office Description', 'Description', 'About'] },
  { key: 'investment_thesis', label: 'Investment Thesis', aliases: ['Investment Thesis', 'Thesis', 'Strategy'] },
  { key: 'investment_focus', label: 'Investment Focus', aliases: ['Investment Focus', 'Focus Areas', 'Sector Focus'] },
  { key: 'investing_sectors', label: 'Investing Sectors', aliases: ['Investing Sectors', 'Sectors', 'Industries'] },
  { key: 'investment_stages', label: 'Investment Stage', aliases: ['Investment Stage', 'Stage', 'Preferred Stage', 'Stages'] },
  { key: 'preferred_geography', label: 'Preferred Geography', aliases: ['Preferred Geography', 'Geography', 'Regions', 'Location Focus'] },
  { key: 'avg_check_size', label: 'Avg Check Size', aliases: ['Avg Check Size', 'Average Check', 'Check Size'] },
  { key: 'total_investments', label: 'Total Investments', aliases: ['Total Investments', 'Portfolio Size', '# Investments'] },
  { key: 'total_exits', label: 'Total Exits', aliases: ['Total Exits', '# Exits', 'Exits'] },
  { key: 'firm_size', label: 'Firm Size', aliases: ['Family Office Size', 'Firm Size', 'AUM', 'Fund Size'] },
  { key: 'street_address', label: 'Street Address', aliases: ['Family Office Street Address', 'Street Address', 'Address'] },
  { key: 'city', label: 'City', aliases: ['Family Office City', 'City'] },
  { key: 'state_region', label: 'State/Region', aliases: ['Family Office State / Region', 'State', 'Region'] },
  { key: 'country', label: 'Country', aliases: ['Family Office Country', 'Country'] },
  { key: 'data_completion_score', label: 'Data Completion Score', aliases: ['Data Completion Score (Text)', 'Data Completion Score', 'Completeness'] },
  { key: 'additional_notes', label: 'Additional Notes', aliases: ['Additional Notes', 'Notes', 'Comments'] },
];

const contactColumnMappings = [
  // Contact fields  
  { key: 'full_name', label: 'Contact Full Name', required: true, aliases: ['Contact Full Name', 'Full Name', 'Name', 'Contact Name'] },
  { key: 'first_name', label: 'First Name', aliases: ['Contact First Name', 'First Name'] },
  { key: 'last_name', label: 'Last Name', aliases: ['Contact Last Name', 'Last Name'] },
  { key: 'title', label: 'Contact Title', aliases: ['Contact Title', 'Contact Job Title', 'Title', 'Position', 'Role'] },
  { key: 'work_email', label: 'Work Email', aliases: ['Work Email', 'Email', 'Contact Primary Email', 'Primary E-Mail', 'Business Email'] },
  { key: 'secondary_email', label: 'Secondary Email', aliases: ['Contact Secondary Email', 'Secondary Email', 'Alt Email'] },
  { key: 'email_risk_level', label: 'Email Risk Level', aliases: ['Email Risk Level', 'Risk Level'] },
  { key: 'email_quality_primary', label: 'Email Quality (Primary)', aliases: ['Email Quality Assessment (Primary)', 'Primary Email Quality'] },
  { key: 'email_quality_secondary', label: 'Email Quality (Secondary)', aliases: ['Email Quality Assessment (Secondary)', 'Secondary Email Quality'] },
  { key: 'primary_phone', label: 'Primary Phone', aliases: ['Primary Phone Number', 'Phone', 'Contact Phone', 'Mobile'] },
  { key: 'secondary_phone', label: 'Secondary Phone', aliases: ['Secondary Phone Number', 'Alt Phone', 'Office Phone'] },
  { key: 'linkedin_url', label: 'Personal LinkedIn', aliases: ['Personal LinkedIn Address', 'Contact LinkedIn Profile', 'LinkedIn Profile', 'Contact LinkedIn'] },
  { key: 'location', label: 'Contact Location', aliases: ['Contact Location', 'Location', 'City'] },
  { key: 'investor_type', label: 'Investor Type (Contact)', aliases: ['Investor Type'] },
  { key: 'investment_focus', label: 'Investment Focus (Contact)', aliases: ['Investment Focus'] },
  { key: 'geographic_focus', label: 'Geographic Focus (Contact)', aliases: ['Geographic Focus', 'Geography Focus', 'Region Focus'] },
  { key: 'preferred_geography', label: 'Preferred Geography (Contact)', aliases: ['Preferred Geography', 'Target Geography', 'Investment Geography'] },
];

const firmTypeMapping = {
  'VC': 'Venture Capital',
  'Venture Capital': 'Venture Capital',
  'CVC': 'Corporate Venture Capital',
  'Corporate VC': 'Corporate Venture Capital',
  'Corporate Venture Capital': 'Corporate Venture Capital',
  'Family Office': 'Family Office',
  'Single Family Office': 'Family Office',
  'Multi-Family Office': 'Family Office',
  'Angel': 'Angel Investor',
  'Angel Investor': 'Angel Investor',
  'Angel Group': 'Angel Group/Network',
  'Angel Network': 'Angel Group/Network',
  'Syndicate': 'Syndicate',
  'Fund of Funds': 'Fund of Funds',
  'FoF': 'Fund of Funds',
  'PE': 'Private Equity',
  'Private Equity': 'Private Equity',
  'Growth Equity': 'Growth Equity',
  'Hedge Fund': 'Hedge Fund',
  'Accelerator': 'Accelerator/Incubator',
  'Incubator': 'Accelerator/Incubator',
  'Bank': 'Bank',
  'Investment Bank': 'Investment Bank',
  'Pension Fund': 'Pension Fund',
  'Government': 'Government/Sovereign Fund',
  'Sovereign Fund': 'Government/Sovereign Fund',
  'University': 'University Endowment',
  'Endowment': 'University Endowment',
  'Insurance': 'Insurance Company',
  'Asset Manager': 'Asset Manager',
  'Wealth Manager': 'Wealth Manager',
  'Micro VC': 'Micro VC',
  'Impact': 'Impact/ESG Fund',
  'ESG': 'Impact/ESG Fund',
};

export default function InvestorCSVImporter({ type = 'both', onImportComplete }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1); // 1: upload, 2: mapping, 3: preview, 4: importing
  const [sourceColumns, setSourceColumns] = useState([]);
  const [extractedData, setExtractedData] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ firms: 0, contacts: 0, failed: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importMode, setImportMode] = useState(type === 'firms' ? 'firms' : type === 'contacts' ? 'contacts' : 'both'); // 'firms', 'contacts', 'both'
  const [detectedFields, setDetectedFields] = useState([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [newFieldsToCreate, setNewFieldsToCreate] = useState([]);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [processingTimeout, setProcessingTimeout] = useState(null);

  const queryClient = useQueryClient();

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // File size validation (max 50MB for local parsing)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (selectedFile.size > maxSize) {
      toast.error(`File too large (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 50MB.`);
      return;
    }

    // File type validation
    const validTypes = ['.csv', '.xlsx', '.xls'];
    const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(fileExt)) {
      toast.error('Invalid file type. Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);
    setProcessingStage('Reading file...');
    toast.info(`Processing ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)}KB)...`);

    // Set timeout to detect stuck processing (30 seconds)
    const timeout = setTimeout(() => {
      if (isProcessing) {
        console.error('Processing timeout - stuck in loop');
        toast.error('Processing took too long. Please try again with a smaller file.');
        setIsProcessing(false);
        setProcessingStage('');
        setFile(null);
        setStep(1);
        if (e?.target) e.target.value = '';
      }
    }, 30000);
    setProcessingTimeout(timeout);

    try {
      // Parse file locally using xlsx with FileReader for better compatibility
      setProcessingStage('Parsing spreadsheet data...');
      
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          try {
            const arrayBuffer = e.target.result;
            const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
              reject(new Error('No sheets found in file'));
              return;
            }
            
            // Get first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            resolve(jsonData);
          } catch (err) {
            reject(new Error(`Failed to parse spreadsheet: ${err.message}`));
          }
        };
        
        reader.onerror = (err) => {
          console.error('FileReader error:', err);
          reject(new Error(`Failed to read file: ${reader.error?.message || 'Unknown error'}`));
        };
        
        reader.onabort = () => reject(new Error('File reading was aborted'));
        
        try {
          reader.readAsArrayBuffer(selectedFile);
        } catch (err) {
          reject(new Error(`Cannot read file: ${err.message}`));
        }
      });
      
      if (data.length === 0) {
        toast.error('No data found in file');
        setIsProcessing(false);
        return;
      }

      const headers = Object.keys(data[0]);
      setSourceColumns(headers);
      setExtractedData(data);
      toast.success(`Parsed ${data.length} records from file`);
        
        // AI-powered intelligent field detection
        setProcessingStage('AI analyzing columns and mapping fields...');
        const sampleData = data.slice(0, 5);

        const aiAnalysis = await base44.integrations.Core.InvokeLLM({
          prompt: `Analyze this investor database CSV and intelligently map columns.

Sample Data:
${JSON.stringify(sampleData, null, 2)}

Available Headers: ${headers.join(', ')}

Known Field Types:
- Investor Firms: ${investorColumnMappings.map(m => m.key).join(', ')}
- Contacts: ${contactColumnMappings.map(m => m.key).join(', ')}

Tasks:
1. Map each source column to the best matching field (use exact key names)
2. Identify unmapped columns that contain useful data
3. Suggest new fields for unmapped columns with valuable information
4. Detect data patterns (arrays, numbers, enums)

Provide intelligent mappings based on content, not just column names.`,
          response_json_schema: {
            type: 'object',
            properties: {
              mappings: {
                type: 'object',
                additionalProperties: { type: 'string' }
              },
              detected_new_fields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source_column: { type: 'string' },
                    suggested_field_name: { type: 'string' },
                    field_type: { type: 'string' },
                    description: { type: 'string' },
                    sample_values: { type: 'array', items: { type: 'string' } }
                  }
                }
              },
              data_quality_score: { type: 'number' },
              recommendations: { type: 'array', items: { type: 'string' } }
            }
          }
        });

        setColumnMapping(aiAnalysis.mappings || {});
        setDetectedFields(aiAnalysis.detected_new_fields || []);
        setMappingConfirmed(false);
        toast.success('AI field mapping complete! Review and confirm mappings.');
        setStep(2);
    } catch (error) {
      console.error('Error processing file:', error);
      
      // Better error messages
      let errorMessage = 'Failed to process file';
      if (error.message?.includes('Network')) {
        errorMessage = 'Network error - file may be too large or connection lost. Try a smaller file or check your internet connection.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Upload timeout - file is too large. Try splitting your data into smaller files.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage, { duration: 5000 });
      
      // Reset all states
      setFile(null);
      setSourceColumns([]);
      setExtractedData([]);
      setColumnMapping({});
      setStep(1);
    } finally {
      // Clear timeout
      if (processingTimeout) {
        clearTimeout(processingTimeout);
        setProcessingTimeout(null);
      }
      setIsProcessing(false);
      setProcessingStage('');
      // Reset file input
      if (e?.target) {
        e.target.value = '';
      }
    }
  };

  const handleImport = async () => {
    setStep(4);
    setImportProgress(0);
    setImportResults({ firms: 0, contacts: 0, failed: 0 });
    toast.info('Starting import...');

    console.log('🚀 Starting import process');
    console.log('📊 Total records to process:', extractedData.length);
    console.log('🗺️ Column mappings:', columnMapping);

    const total = extractedData.length;
    let firmsCreated = 0;
    let contactsCreated = 0;
    let failed = 0;
    const failedRecords = [];

    // Get existing firms for matching with multiple keys (name, website, linkedin)
    toast.info('Loading existing firms for matching...');
    const existingFirms = await base44.entities.InvestorFirm.list('company_name', 100000);
    console.log('📋 Existing firms count:', existingFirms.length);
    
    // Build multiple indexes for better matching
    const firmsByName = {};
    const firmsByWebsite = {};
    const firmsByLinkedIn = {};
    
    existingFirms.forEach(f => {
      if (f.company_name) {
        const normalizedName = f.company_name.toLowerCase().trim().replace(/\s+/g, ' ');
        firmsByName[normalizedName] = f.id;
      }
      if (f.website) {
        const normalizedWebsite = f.website.toLowerCase().trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
        firmsByWebsite[normalizedWebsite] = f.id;
      }
      if (f.linkedin_url) {
        const normalizedLinkedIn = f.linkedin_url.toLowerCase().trim().replace(/\/$/, '');
        firmsByLinkedIn[normalizedLinkedIn] = f.id;
      }
    });
    
    console.log('🔍 Firm indexes built:', {
      byName: Object.keys(firmsByName).length,
      byWebsite: Object.keys(firmsByWebsite).length,
      byLinkedIn: Object.keys(firmsByLinkedIn).length
    });
    
    // Get existing contacts for deduplication
    const existingContacts = await base44.entities.Contact.list('full_name', 100000);
    console.log('📋 Existing contacts count:', existingContacts.length);
    
    // Build contact indexes for deduplication
    const contactsByEmail = {};
    const contactsByNameAndFirm = {};
    
    existingContacts.forEach(c => {
      if (c.work_email) {
        contactsByEmail[c.work_email.toLowerCase().trim()] = c.id;
      }
      if (c.full_name && c.firm_id) {
        const key = `${c.full_name.toLowerCase().trim()}|${c.firm_id}`;
        contactsByNameAndFirm[key] = c.id;
      }
    });
    
    console.log('🔍 Contact indexes built:', {
      byEmail: Object.keys(contactsByEmail).length,
      byNameAndFirm: Object.keys(contactsByNameAndFirm).length
    });

    for (let i = 0; i < extractedData.length; i++) {
      const row = extractedData[i];
      
      try {
        // Extract firm data
        if (importMode === 'firms' || importMode === 'both') {
          const firmName = row[columnMapping.company_name];
          console.log(`\n📌 Row ${i + 1}: Processing firm "${firmName}"`);
          
          if (!firmName) {
            console.log('⚠️ No firm name found, skipping firm creation for this row');
            // Don't mark as failed if we're in 'both' mode - contacts might still be created
            if (importMode === 'firms') {
              failed++;
              failedRecords.push({ row: i + 1, reason: 'No firm name', data: row });
            }
          } else {

          // Enhanced duplicate detection - check by name, website, and LinkedIn
          const firmKey = firmName.toLowerCase().trim().replace(/\s+/g, ' ');
          const firmWebsite = row[columnMapping.website];
          const firmLinkedIn = row[columnMapping.linkedin_url];
          
          let existingFirmId = null;
          
          // Check by name
          if (firmsByName[firmKey]) {
            existingFirmId = firmsByName[firmKey];
            console.log(`⏭️ Firm "${firmName}" already exists (matched by name), skipping`);
          }
          
          // Check by website if no name match
          if (!existingFirmId && firmWebsite) {
            const normalizedWebsite = firmWebsite.toLowerCase().trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
            if (firmsByWebsite[normalizedWebsite]) {
              existingFirmId = firmsByWebsite[normalizedWebsite];
              console.log(`⏭️ Firm "${firmName}" already exists (matched by website), skipping`);
            }
          }
          
          // Check by LinkedIn if no other match
          if (!existingFirmId && firmLinkedIn) {
            const normalizedLinkedIn = firmLinkedIn.toLowerCase().trim().replace(/\/$/, '');
            if (firmsByLinkedIn[normalizedLinkedIn]) {
              existingFirmId = firmsByLinkedIn[normalizedLinkedIn];
              console.log(`⏭️ Firm "${firmName}" already exists (matched by LinkedIn), skipping`);
            }
          }
          
          if (existingFirmId) {
            // Store the existing firm ID for contact matching
            firmsByName[firmKey] = existingFirmId;
          } else {
            const firmData = {};
            
            investorColumnMappings.forEach(mapping => {
              const sourceCol = columnMapping[mapping.key];
              if (sourceCol && row[sourceCol] !== undefined && row[sourceCol] !== null && row[sourceCol] !== '') {
                let value = row[sourceCol];
                
                // Handle arrays
                if (['investment_focus', 'investing_sectors', 'investment_stages', 'preferred_geography', 'geographic_focus'].includes(mapping.key)) {
                  value = typeof value === 'string' 
                    ? value.split(/[,;|]/).map(v => v.trim()).filter(Boolean)
                    : value;
                }
                
                // Handle numbers
                if (['avg_check_size', 'total_investments', 'total_exits', 'data_completion_score'].includes(mapping.key)) {
                  value = parseFloat(String(value).replace(/[^0-9.]/g, '')) || undefined;
                }
                
                // Normalize firm type
                if (mapping.key === 'firm_type' && value) {
                  value = firmTypeMapping[value] || value;
                }
                
                if (value !== undefined && value !== null && value !== '') {
                  firmData[mapping.key] = value;
                }
              }
            });

            console.log('📝 Prepared firm data:', firmData);

            if (firmData.company_name) {
              try {
                const newFirm = await base44.entities.InvestorFirm.create(firmData);
                console.log('✅ Firm created successfully:', newFirm.id);
                
                // Index by all available identifiers
                const normalizedName = firmData.company_name.toLowerCase().trim().replace(/\s+/g, ' ');
                firmsByName[normalizedName] = newFirm.id;
                
                if (firmData.website) {
                  const normalizedWebsite = firmData.website.toLowerCase().trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
                  firmsByWebsite[normalizedWebsite] = newFirm.id;
                }
                
                if (firmData.linkedin_url) {
                  const normalizedLinkedIn = firmData.linkedin_url.toLowerCase().trim().replace(/\/$/, '');
                  firmsByLinkedIn[normalizedLinkedIn] = newFirm.id;
                }
                
                firmsCreated++;
                toast.success(`Created: ${firmData.company_name}`);
              } catch (createError) {
                console.error('❌ Error creating firm:', createError);
                failed++;
                failedRecords.push({ row: i + 1, reason: createError.message, data: firmData });
              }
            } else {
              console.log('⚠️ No company_name in firmData, skipping');
            }
          }
          }
        }

        // Extract contact data
        if (importMode === 'contacts' || importMode === 'both') {
          const contactName = row[columnMapping.full_name] || 
            `${row[columnMapping.first_name] || ''} ${row[columnMapping.last_name] || ''}`.trim();
          
          console.log(`👤 Processing contact "${contactName}"`);
          
          if (contactName && contactName.trim() !== '') {
            const contactData = { full_name: contactName };
            
            contactColumnMappings.forEach(mapping => {
              const sourceCol = columnMapping[mapping.key];
              if (sourceCol && row[sourceCol] !== undefined && row[sourceCol] !== null && row[sourceCol] !== '' && mapping.key !== 'full_name') {
                let value = row[sourceCol];
                
                // Handle arrays
                if (['investment_focus', 'preferred_geography', 'geographic_focus'].includes(mapping.key)) {
                  value = typeof value === 'string' 
                    ? value.split(/[,;|]/).map(v => v.trim()).filter(Boolean)
                    : value;
                }
                
                if (value !== undefined && value !== null && value !== '') {
                  contactData[mapping.key] = value;
                }
              }
            });

            // Enhanced firm matching - try multiple strategies
            const firmName = row[columnMapping.company_name];
            let matchedFirmId = null;
            
            if (firmName) {
              const normalizedFirmName = firmName.toLowerCase().trim().replace(/\s+/g, ' ');
              
              // Strategy 1: Match by name
              matchedFirmId = firmsByName[normalizedFirmName];
              
              // Strategy 2: Match by website if available
              if (!matchedFirmId && row[columnMapping.website]) {
                const normalizedWebsite = row[columnMapping.website].toLowerCase().trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
                matchedFirmId = firmsByWebsite[normalizedWebsite];
                if (matchedFirmId) {
                  console.log(`✓ Matched firm by website: ${firmName}`);
                }
              }
              
              // Strategy 3: Match by LinkedIn if available
              if (!matchedFirmId && row[columnMapping.linkedin_url]) {
                const normalizedLinkedIn = row[columnMapping.linkedin_url].toLowerCase().trim().replace(/\/$/, '');
                matchedFirmId = firmsByLinkedIn[normalizedLinkedIn];
                if (matchedFirmId) {
                  console.log(`✓ Matched firm by LinkedIn: ${firmName}`);
                }
              }
              
              if (matchedFirmId) {
                contactData.firm_id = matchedFirmId;
                contactData.firm_name = firmName;
              } else {
                console.log(`⚠️ No matching firm found for "${firmName}"`);
                contactData.firm_name = firmName; // Store for reference even without firm_id
              }
            }

            // Check for duplicate contact before creating
            const contactEmail = contactData.work_email;
            let isDuplicate = false;
            
            if (contactEmail) {
              const normalizedEmail = contactEmail.toLowerCase().trim();
              if (contactsByEmail[normalizedEmail]) {
                console.log(`⏭️ Contact with email "${contactEmail}" already exists, skipping`);
                isDuplicate = true;
              }
            }
            
            // Also check by name+firm combination
            if (!isDuplicate && contactData.full_name && matchedFirmId) {
              const nameKey = `${contactData.full_name.toLowerCase().trim()}|${matchedFirmId}`;
              if (contactsByNameAndFirm[nameKey]) {
                console.log(`⏭️ Contact "${contactName}" at firm already exists, skipping`);
                isDuplicate = true;
              }
            }

            if (!isDuplicate) {
              console.log('📝 Prepared contact data:', contactData);

              try {
                const newContact = await base44.entities.Contact.create(contactData);
                console.log('✅ Contact created successfully');
                
                // Update indexes
                if (newContact.work_email) {
                  contactsByEmail[newContact.work_email.toLowerCase().trim()] = newContact.id;
                }
                if (newContact.full_name && newContact.firm_id) {
                  const nameKey = `${newContact.full_name.toLowerCase().trim()}|${newContact.firm_id}`;
                  contactsByNameAndFirm[nameKey] = newContact.id;
                }
                
                contactsCreated++;
                toast.success(`Created contact: ${contactName}`);
              } catch (createError) {
                console.error('❌ Error creating contact:', createError);
                failed++;
                failedRecords.push({ row: i + 1, reason: createError.message, data: contactData });
              }
            }
          } else {
            console.log('⚠️ No contact name found, skipping contact creation for this row');
            if (importMode === 'contacts') {
              failed++;
              failedRecords.push({ row: i + 1, reason: 'No contact name', data: row });
            }
          }
        }
      } catch (error) {
        failed++;
        failedRecords.push({ row: i + 1, reason: error.message, data: row });
        console.error('❌ Import error for row:', row, error);
      }

      setImportProgress(Math.round(((i + 1) / total) * 100));
      setImportResults({ firms: firmsCreated, contacts: contactsCreated, failed });
    }

    console.log('\n🎯 Import Summary:');
    console.log('✅ Firms created:', firmsCreated);
    console.log('✅ Contacts created:', contactsCreated);
    console.log('❌ Failed:', failed);
    if (failedRecords.length > 0) {
      console.log('❌ Failed records:', failedRecords);
    }

    queryClient.invalidateQueries(['firms']);
    queryClient.invalidateQueries(['contacts']);
    
    if (failed > 0) {
      toast.error(`Import complete with errors. ${firmsCreated} firms, ${contactsCreated} contacts created. ${failed} failed. Check console for details.`);
      console.error('Failed records details:', failedRecords);
    } else {
      toast.success(`Import complete! ${firmsCreated} firms and ${contactsCreated} contacts created.`);
    }
    
    if (onImportComplete) {
      onImportComplete({ firms: firmsCreated, contacts: contactsCreated, failed });
    }
  };

  const enrichInvestorProfiles = async () => {
    setEnriching(true);
    setEnrichmentProgress(0);

    const firms = await base44.entities.InvestorFirm.list('-created_date', 1000);
    const total = firms.length;

    for (let i = 0; i < firms.length; i++) {
      const firm = firms[i];
      
      try {
        // Skip if already enriched recently
        if (firm.last_enriched && 
            new Date(firm.last_enriched) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
          continue;
        }

        const enrichmentData = await base44.integrations.Core.InvokeLLM({
          prompt: `Deep research and enrich this investor profile using current web data.

Investor: ${firm.company_name}
Current Data: ${JSON.stringify({
  website: firm.website,
  linkedin: firm.linkedin_url,
  type: firm.firm_type,
  focus: firm.investment_focus,
  location: firm.city || firm.country
}, null, 2)}

Research and provide:
1. Investment sectors (specific sub-sectors, not generic)
2. Geographic focus (countries, regions, cities)
3. Recent investments (last 12 months if available)
4. Investment stages (Pre-seed, Seed, Series A, etc.)
5. Check size range (estimated or known)
6. Portfolio companies (notable names)
7. Key decision makers (partners, principals)
8. Investment thesis/strategy
9. AUM or fund size (if available)
10. Contact information (office locations, email domains)

Search the web for recent, accurate information. Be specific with data.`,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              investment_focus: { type: 'array', items: { type: 'string' } },
              investing_sectors: { type: 'array', items: { type: 'string' } },
              investment_stages: { type: 'array', items: { type: 'string' } },
              geographic_focus: { type: 'array', items: { type: 'string' } },
              check_size_min: { type: 'number' },
              check_size_max: { type: 'number' },
              portfolio_companies: { type: 'array', items: { type: 'string' } },
              recent_investments: { type: 'array', items: { type: 'string' } },
              key_people: { type: 'array', items: { type: 'string' } },
              investment_thesis: { type: 'string' },
              aum: { type: 'number' },
              total_investments: { type: 'number' },
              firm_description: { type: 'string' },
              data_confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
            }
          }
        });

        // Update firm with enriched data
        await base44.entities.InvestorFirm.update(firm.id, {
          ...enrichmentData,
          enrichment_status: 'enriched',
          last_enriched: new Date().toISOString()
        });

      } catch (error) {
        console.error('Enrichment error:', firm.company_name, error);
        await base44.entities.InvestorFirm.update(firm.id, {
          enrichment_status: 'failed',
          last_enriched: new Date().toISOString()
        });
      }

      setEnrichmentProgress(Math.round(((i + 1) / total) * 100));
    }

    setEnriching(false);
    queryClient.invalidateQueries(['firms']);
    toast.success('Enrichment complete! Investor profiles updated with web research.');
  };

  const handleAddRecord = async (data) => {
    try {
      if (importMode === 'firms' || importMode === 'both') {
        await base44.entities.InvestorFirm.create(data);
      } else {
        await base44.entities.Contact.create(data);
      }
      queryClient.invalidateQueries(['firms']);
      queryClient.invalidateQueries(['contacts']);
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding record:', error);
    }
  };

  const handleEditRecord = async (id, data) => {
    try {
      if (importMode === 'firms' || importMode === 'both') {
        await base44.entities.InvestorFirm.update(id, data);
      } else {
        await base44.entities.Contact.update(id, data);
      }
      queryClient.invalidateQueries(['firms']);
      queryClient.invalidateQueries(['contacts']);
      setEditingRecord(null);
    } catch (error) {
      console.error('Error updating record:', error);
    }
  };

  const resetImport = () => {
    setFile(null);
    setStep(1);
    setSourceColumns([]);
    setExtractedData([]);
    setColumnMapping({});
    setImportProgress(0);
    setImportResults({ firms: 0, contacts: 0, failed: 0 });
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              Import Investor Database
            </CardTitle>
            <CardDescription>
              Upload your investor CSV or Excel file. Supports various database formats including family offices, VCs, angels, and more.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className={cn(
                "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
                isProcessing ? "bg-slate-50 border-slate-300" : "hover:border-indigo-400 hover:bg-indigo-50"
              )}
              onClick={() => !isProcessing && document.getElementById('csv-upload').click()}
            >
              <input
                id="csv-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isProcessing}
              />
              {isProcessing ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                  <p className="text-lg font-medium text-slate-700">Processing file...</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        processingStage.includes('Uploading') ? "bg-indigo-600 animate-pulse" : "bg-green-500"
                      )} />
                      <span className={cn(
                        processingStage.includes('Uploading') ? "text-indigo-700 font-medium" : "text-slate-500"
                      )}>
                        Uploading file
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        processingStage.includes('Extracting') ? "bg-indigo-600 animate-pulse" : 
                        processingStage.includes('AI analyzing') ? "bg-green-500" : "bg-slate-300"
                      )} />
                      <span className={cn(
                        processingStage.includes('Extracting') ? "text-indigo-700 font-medium" : "text-slate-500"
                      )}>
                        Extracting data
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        processingStage.includes('AI analyzing') ? "bg-indigo-600 animate-pulse" : "bg-slate-300"
                      )} />
                      <span className={cn(
                        processingStage.includes('AI analyzing') ? "text-indigo-700 font-medium" : "text-slate-500"
                      )}>
                        AI mapping columns
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-indigo-600" />
                  </div>
                  <p className="text-lg font-medium text-slate-700">Drop your investor database here</p>
                  <p className="text-sm text-slate-500 mt-1">Supports CSV and Excel files (max 50MB) - parsed locally</p>
                </div>
              )}
            </div>

            {/* Supported fund types */}
            <div className="mt-6">
              <p className="text-sm font-medium text-slate-700 mb-3">Supported Investor Types</p>
              <div className="flex flex-wrap gap-2">
                {['Venture Capital', 'Family Office', 'Angel Investor', 'Fund of Funds', 'Private Equity', 'CVC', 'Accelerator', 'Micro VC'].map((type) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && (
        <div className="space-y-6">
          {/* AI Mapping Summary */}
          <Card className="border-indigo-200 bg-indigo-50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <CardTitle className="text-base">AI Auto-Mapping Complete</CardTitle>
                </div>
                <Badge className="bg-indigo-600 text-white">
                  {Object.keys(columnMapping).length} fields mapped
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-indigo-900">
                We've automatically mapped {Object.keys(columnMapping).length} columns from your file. 
                Review and adjust the mappings below, then confirm to proceed.
              </p>
            </CardContent>
          </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
                1
              </div>
              Review Column Mappings
            </CardTitle>
            <CardDescription>
              Verify AI-detected mappings and manually adjust any incorrect matches
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Import mode selector */}
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-700">Import:</span>
              <div className="flex gap-2">
                {[
                  { value: 'both', label: 'Firms & Contacts' },
                  { value: 'firms', label: 'Firms Only' },
                  { value: 'contacts', label: 'Contacts Only' },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={importMode === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setImportMode(option.value)}
                    className={importMode === option.value ? 'bg-indigo-600' : ''}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Firm mappings */}
            {(importMode === 'firms' || importMode === 'both') && (
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Investor Firm Fields
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {investorColumnMappings.slice(0, showAdvanced ? undefined : 8).map((mapping) => (
                    <div key={mapping.key} className="flex items-center gap-3">
                      <div className="w-40 flex items-center gap-1">
                        <span className={cn("text-sm", mapping.required && "font-medium")}>
                          {mapping.label}
                        </span>
                        {mapping.required && <span className="text-red-500">*</span>}
                      </div>
                      <Select
                        value={columnMapping[mapping.key] || ''}
                        onValueChange={(value) => setColumnMapping({ ...columnMapping, [mapping.key]: value })}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>-- Not mapped --</SelectItem>
                          {sourceColumns.map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact mappings */}
            {(importMode === 'contacts' || importMode === 'both') && (
              <div>
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Contact Fields
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {contactColumnMappings.slice(0, showAdvanced ? undefined : 8).map((mapping) => (
                    <div key={mapping.key} className="flex items-center gap-3">
                      <div className="w-40 flex items-center gap-1">
                        <span className={cn("text-sm", mapping.required && "font-medium")}>
                          {mapping.label}
                        </span>
                        {mapping.required && <span className="text-red-500">*</span>}
                      </div>
                      <Select
                        value={columnMapping[mapping.key] || ''}
                        onValueChange={(value) => setColumnMapping({ ...columnMapping, [mapping.key]: value })}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>-- Not mapped --</SelectItem>
                          {sourceColumns.map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mapping Stats */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">{sourceColumns.length}</p>
                <p className="text-xs text-slate-500">Columns in File</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-indigo-600">{Object.keys(columnMapping).filter(k => columnMapping[k]).length}</p>
                <p className="text-xs text-slate-500">Mapped Fields</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {sourceColumns.length - Object.values(columnMapping).filter(Boolean).length}
                </p>
                <p className="text-xs text-slate-500">Unmapped Columns</p>
              </div>
            </div>

            {/* Toggle advanced fields */}
            <Button 
              variant="ghost" 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-indigo-600"
            >
              {showAdvanced ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  Show Less Fields
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-1" />
                  Show All Fields
                </>
              )}
            </Button>

          </CardContent>
        </Card>

        {/* AI Detected New Fields - Step 2 */}
        {detectedFields.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">New Fields Detected</CardTitle>
                  <CardDescription>
                    AI found {detectedFields.length} unmapped columns with valuable data
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {detectedFields.map((field, idx) => (
                  <div key={idx} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">{field.suggested_field_name}</span>
                          <Badge variant="outline" className="text-xs">{field.field_type}</Badge>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{field.description}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Source:</span> {field.source_column}
                        </p>
                        {field.sample_values?.length > 0 && (
                          <div className="mt-2 p-2 bg-slate-50 rounded">
                            <p className="text-xs font-medium text-slate-700 mb-1">Sample values:</p>
                            <p className="text-xs text-slate-600">
                              {field.sample_values.slice(0, 3).join(' • ')}
                            </p>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={newFieldsToCreate.includes(idx) ? "default" : "outline"}
                        onClick={() => {
                          if (newFieldsToCreate.includes(idx)) {
                            setNewFieldsToCreate(newFieldsToCreate.filter(i => i !== idx));
                          } else {
                            setNewFieldsToCreate([...newFieldsToCreate, idx]);
                          }
                        }}
                        className={newFieldsToCreate.includes(idx) ? "bg-emerald-600" : ""}
                      >
                        {newFieldsToCreate.includes(idx) ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Include
                          </>
                        ) : (
                          'Add Field'
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
                {newFieldsToCreate.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-sm text-emerald-800">
                      ✓ {newFieldsToCreate.length} new field{newFieldsToCreate.length > 1 ? 's' : ''} will be added to the database
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirm and Proceed */}
        <Card className="border-2 border-indigo-300">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
                {detectedFields.length > 0 ? '3' : '2'}
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">Confirm Mappings</CardTitle>
                <CardDescription>
                  Review the summary and proceed to data extraction
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Validation warnings */}
            <div className="space-y-2">
              {!columnMapping.company_name && importMode !== 'contacts' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    No Company Name mapped - firm data will not be imported
                  </p>
                </div>
              )}
              {!columnMapping.full_name && !columnMapping.first_name && importMode !== 'firms' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    No contact name mapped - contact data will not be imported
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Records to process:</span>
                <span className="font-semibold text-slate-900">{extractedData.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Import mode:</span>
                <Badge variant="secondary">{importMode === 'both' ? 'Firms & Contacts' : importMode === 'firms' ? 'Firms Only' : 'Contacts Only'}</Badge>
              </div>
              {newFieldsToCreate.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">New fields to create:</span>
                  <span className="font-semibold text-emerald-600">{newFieldsToCreate.length}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={resetImport}>
                Start Over
              </Button>
              <Button 
                onClick={() => {
                  setMappingConfirmed(true);
                  setStep(3);
                }}
                className="bg-indigo-600 hover:bg-indigo-700"
                disabled={
                  (importMode === 'firms' && !columnMapping.company_name) ||
                  (importMode === 'contacts' && !columnMapping.full_name && !columnMapping.first_name) ||
                  (importMode === 'both' && !columnMapping.company_name && !columnMapping.full_name && !columnMapping.first_name)
                }
              >
                Confirm & Preview Data
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <Card className="border-2 border-indigo-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-indigo-600" />
              <div className="flex-1">
                <CardTitle>Data Preview - Ready to Extract</CardTitle>
                <CardDescription>
                  Review {extractedData.length} records before extracting and importing to database
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    {Object.entries(columnMapping)
                      .filter(([_, v]) => v)
                      .slice(0, 6)
                      .map(([key, _]) => {
                        const mapping = [...investorColumnMappings, ...contactColumnMappings]
                          .find(m => m.key === key);
                        return <TableHead key={key}>{mapping?.label || key}</TableHead>;
                      })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extractedData.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      {Object.entries(columnMapping)
                        .filter(([_, v]) => v)
                        .slice(0, 6)
                        .map(([key, sourceCol]) => (
                          <TableCell key={key} className="max-w-48 truncate">
                            {row[sourceCol] || '—'}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {extractedData.length > 10 && (
              <p className="text-sm text-slate-500 mt-2">
                Showing 10 of {extractedData.length} records
              </p>
            )}

            {/* Call to action */}
            <div className="bg-indigo-50 border-2 border-indigo-300 rounded-lg p-6 mt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-indigo-900 mb-1">Ready to Extract & Import Data</h3>
                  <p className="text-sm text-indigo-700 mb-4">
                    Click the button below to extract data from your file and populate the investor database. 
                    This process will create {extractedData.length} records based on your mappings.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(2)}>
                      ← Back to Mapping
                    </Button>
                    <Button 
                      onClick={handleImport}
                      size="lg"
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Extract & Import {extractedData.length} Records
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Importing */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importProgress === 100 ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Import Complete
                </>
              ) : (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  Importing Data...
                </>
              )}
            </CardTitle>
            <CardDescription>
              {importProgress === 100 
                ? 'All records have been processed' 
                : `Processing ${extractedData.length} records...`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Progress</span>
                <span className="font-medium text-slate-900">{importProgress}%</span>
              </div>
              <Progress value={importProgress} className="h-2" />
            </div>
            
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full mx-auto mb-2">
                  <Building2 className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-2xl font-bold text-indigo-600">{importResults.firms}</p>
                <p className="text-sm text-slate-500">Firms</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mx-auto mb-2">
                  <Users className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-600">{importResults.contacts}</p>
                <p className="text-sm text-slate-500">Contacts</p>
              </div>
              {importResults.failed > 0 && (
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-2">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-red-600">{importResults.failed}</p>
                  <p className="text-sm text-slate-500">Failed</p>
                </div>
              )}
            </div>

            {importProgress === 100 && (
              <div className="space-y-4">
                <div className="flex justify-center gap-3 pt-6 border-t">
                  <Button onClick={resetImport} variant="outline">
                    Import More Data
                  </Button>
                  <Button 
                    onClick={enrichInvestorProfiles}
                    disabled={enriching}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {enriching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enriching... {enrichmentProgress}%
                      </>
                    ) : (
                      'Enrich with AI Research'
                    )}
                  </Button>
                </div>
                
                {enriching && (
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <Progress value={enrichmentProgress} className="h-2" />
                    <p className="text-xs text-indigo-700 mt-2 text-center">
                      AI is researching investor profiles from the web...
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}