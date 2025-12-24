import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Database,
  Users,
  Building2,
  Search,
  GitMerge,
  Archive,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

interface ImportStage {
  id: string;
  label: string;
  status: "pending" | "processing" | "completed" | "error";
  count?: number;
  details?: string;
}

interface ImportResults {
  created: number;
  updated: number;
  merged: number;
  archived: number;
  skipped: number;
  failed: number;
  total: number;
}

interface ColumnMapping {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

const allColumnMappings: ColumnMapping[] = [
  { key: "company_name", label: "Company/Firm Name", aliases: ["Company Name", "Firm Name", "Family Office Name", "Fund Name", "Organization", "VC Name", "Investor Name", "Company"] },
  { key: "full_name", label: "Contact Name", aliases: ["Contact Full Name", "Full Name", "Name", "Contact Name", "Person Name"] },
  { key: "first_name", label: "First Name", aliases: ["Contact First Name", "First Name", "Given Name"] },
  { key: "last_name", label: "Last Name", aliases: ["Contact Last Name", "Last Name", "Family Name", "Surname"] },
  { key: "email", label: "Email", aliases: ["Work Email", "Email", "Contact Primary Email", "Primary E-Mail", "Business Email", "E-mail"] },
  { key: "phone", label: "Phone", aliases: ["Primary Phone Number", "Phone", "Contact Phone", "Mobile", "Phone Number"] },
  { key: "title", label: "Job Title", aliases: ["Contact Title", "Contact Job Title", "Title", "Position", "Role", "Job Title"] },
  { key: "firm_type", label: "Investor Type", aliases: ["Investor Type", "Fund Type", "Type", "Organization Type", "Family Office Structure", "VC Type"] },
  { key: "website", label: "Website", aliases: ["Website", "Family Office Website Address", "URL", "Company Website", "Site"] },
  { key: "linkedin_url", label: "LinkedIn", aliases: ["Firm LinkedIn Address", "Corporate Linkedin Address", "Company LinkedIn", "LinkedIn", "LinkedIn URL", "Personal LinkedIn Address", "Contact LinkedIn Profile"] },
  { key: "description", label: "Description", aliases: ["Firm Description", "Family Office Description", "Description", "About", "Bio"] },
  { key: "investment_focus", label: "Investment Focus", aliases: ["Investment Focus", "Focus Areas", "Sector Focus", "Sectors"] },
  { key: "investment_stages", label: "Investment Stage", aliases: ["Investment Stage", "Stage", "Preferred Stage", "Stages", "Stage Focus"] },
  { key: "check_size_min", label: "Min Check Size", aliases: ["Check Size Min", "Min Investment", "Minimum Check", "Min Check"] },
  { key: "check_size_max", label: "Max Check Size", aliases: ["Check Size Max", "Max Investment", "Maximum Check", "Max Check", "Avg Check Size"] },
  { key: "aum", label: "AUM", aliases: ["AUM", "Assets Under Management", "Fund Size", "Firm Size", "Family Office Size"] },
  { key: "city", label: "City", aliases: ["City", "Family Office City", "Location"] },
  { key: "country", label: "Country", aliases: ["Country", "Family Office Country", "Nation"] },
  { key: "notes", label: "Notes", aliases: ["Additional Notes", "Notes", "Comments", "Remarks"] },
];

const firmTypeMapping: Record<string, string> = {
  "VC": "Venture Capital",
  "Venture Capital": "Venture Capital",
  "CVC": "Corporate Venture Capital",
  "Corporate VC": "Corporate Venture Capital",
  "Corporate Venture Capital": "Corporate Venture Capital",
  "Family Office": "Family Office",
  "Single Family Office": "Family Office",
  "Multi-Family Office": "Family Office",
  "Angel": "Angel Investor",
  "Angel Investor": "Angel Investor",
  "Angel Group": "Angel Group/Network",
  "Angel Network": "Angel Group/Network",
  "Syndicate": "Syndicate",
  "Fund of Funds": "Fund of Funds",
  "FoF": "Fund of Funds",
  "PE": "Private Equity",
  "Private Equity": "Private Equity",
  "Growth Equity": "Growth Equity",
  "Hedge Fund": "Hedge Fund",
  "Accelerator": "Accelerator/Incubator",
  "Incubator": "Accelerator/Incubator",
  "Micro VC": "Micro VC",
  "Impact": "Impact/ESG Fund",
  "ESG": "Impact/ESG Fund",
};

interface Props {
  onImportComplete?: () => void;
}

export default function UnifiedSmartImporter({ onImportComplete }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [extractedData, setExtractedData] = useState<Record<string, any>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<ImportStage[]>([]);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [overallProgress, setOverallProgress] = useState(0);

  const normalizeString = (str: string): string => {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  const findBestMatch = (column: string): string | null => {
    const normalized = normalizeString(column);
    
    for (const mapping of allColumnMappings) {
      if (normalizeString(mapping.label) === normalized) {
        return mapping.key;
      }
      for (const alias of mapping.aliases) {
        if (normalizeString(alias) === normalized) {
          return mapping.key;
        }
      }
    }
    
    for (const mapping of allColumnMappings) {
      if (normalized.includes(normalizeString(mapping.key))) {
        return mapping.key;
      }
      for (const alias of mapping.aliases) {
        if (normalized.includes(normalizeString(alias))) {
          return mapping.key;
        }
      }
    }
    
    return null;
  };

  const normalizeFirmType = (type: string): string => {
    if (!type) return "";
    const normalized = firmTypeMapping[type];
    if (normalized) return normalized;
    const upperType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return firmTypeMapping[upperType] || type;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const maxSize = 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      toast({
        title: "File too large",
        description: `Maximum size is 50MB. Your file is ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB.`,
        variant: "destructive",
      });
      return;
    }

    const validTypes = [".csv", ".xlsx", ".xls"];
    const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();
    if (!validTypes.includes(fileExt)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);

    try {
      const data = await new Promise<Record<string, any>[]>((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          try {
            const arrayBuffer = e.target?.result;
            const workbook = XLSX.read(arrayBuffer, { type: "buffer" });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
              reject(new Error("No sheets found in file"));
              return;
            }
            
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            resolve(jsonData as Record<string, any>[]);
          } catch (err: any) {
            reject(new Error(`Failed to parse spreadsheet: ${err.message}`));
          }
        };
        
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(selectedFile);
      });

      if (data.length === 0) {
        toast({
          title: "Empty file",
          description: "The file contains no data rows",
          variant: "destructive",
        });
        return;
      }

      const columns = Object.keys(data[0]);
      const autoMapping: Record<string, string> = {};
      
      for (const column of columns) {
        const match = findBestMatch(column);
        if (match) {
          autoMapping[column] = match;
        }
      }
      
      setColumnMapping(autoMapping);
      setExtractedData(data);
      
      toast({
        title: "File ready",
        description: `Found ${data.length} rows. Click Import to start.`,
      });
    } catch (error: any) {
      toast({
        title: "Parse error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateStage = (stageId: string, updates: Partial<ImportStage>) => {
    setStages(prev => prev.map(s => 
      s.id === stageId ? { ...s, ...updates } : s
    ));
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      setIsImporting(true);
      setResults(null);
      setOverallProgress(0);

      const initialStages: ImportStage[] = [
        { id: "parsing", label: "Parsing Data", status: "pending" },
        { id: "classifying", label: "Classifying Records", status: "pending" },
        { id: "deduplicating", label: "Checking Duplicates", status: "pending" },
        { id: "filling", label: "Filling Missing Fields", status: "pending" },
        { id: "importing", label: "Importing to Database", status: "pending" },
        { id: "archiving", label: "Archiving Duplicates", status: "pending" },
      ];
      setStages(initialStages);

      // Stage 1: Parse and map data
      setCurrentStage("parsing");
      updateStage("parsing", { status: "processing" });
      setOverallProgress(5);

      const mappedRecords = extractedData.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [sourceCol, targetKey] of Object.entries(columnMapping)) {
          if (targetKey && row[sourceCol] !== undefined) {
            let value = row[sourceCol];
            if (targetKey === "firm_type") {
              value = normalizeFirmType(String(value));
            }
            mapped[targetKey] = value;
          }
        }
        return mapped;
      });

      updateStage("parsing", { status: "completed", count: mappedRecords.length, details: `${mappedRecords.length} records parsed` });
      setOverallProgress(15);

      // Stage 2: Classify records (firms vs contacts)
      setCurrentStage("classifying");
      updateStage("classifying", { status: "processing" });

      const firms: Record<string, any>[] = [];
      const contacts: Record<string, any>[] = [];

      for (const record of mappedRecords) {
        if (record.company_name) {
          firms.push(record);
        }
        if (record.full_name || (record.first_name && record.last_name) || record.email) {
          contacts.push(record);
        }
      }

      updateStage("classifying", { 
        status: "completed", 
        count: firms.length + contacts.length,
        details: `${firms.length} firms, ${contacts.length} contacts`
      });
      setOverallProgress(25);

      // Stage 3-6: Send to server for smart import
      setCurrentStage("deduplicating");
      updateStage("deduplicating", { status: "processing" });
      setOverallProgress(35);

      const response = await apiRequest("POST", "/api/admin/import/smart", {
        records: mappedRecords,
        firms,
        contacts,
      });

      const result = await response.json();

      // Update remaining stages based on server response
      updateStage("deduplicating", { 
        status: "completed",
        count: result.duplicatesFound || 0,
        details: `${result.duplicatesFound || 0} duplicates found`
      });
      setOverallProgress(55);

      setCurrentStage("filling");
      updateStage("filling", { 
        status: "completed",
        count: result.fieldsFilled || 0,
        details: `${result.fieldsFilled || 0} fields filled`
      });
      setOverallProgress(70);

      setCurrentStage("importing");
      updateStage("importing", { 
        status: "completed",
        count: result.created + result.updated,
        details: `${result.created} created, ${result.updated} updated`
      });
      setOverallProgress(85);

      setCurrentStage("archiving");
      updateStage("archiving", { 
        status: "completed",
        count: result.archived || 0,
        details: `${result.archived || 0} duplicates archived`
      });
      setOverallProgress(100);

      setResults({
        created: result.created || 0,
        updated: result.updated || 0,
        merged: result.merged || 0,
        archived: result.archived || 0,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
        total: mappedRecords.length,
      });

      setCurrentStage(null);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicates"] });
      toast({
        title: "Import complete",
        description: "Your data has been imported successfully.",
      });
      onImportComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
      if (currentStage) {
        updateStage(currentStage, { status: "error" });
      }
    },
    onSettled: () => {
      setIsImporting(false);
    },
  });

  const resetImporter = () => {
    setFile(null);
    setExtractedData([]);
    setColumnMapping({});
    setStages([]);
    setResults(null);
    setCurrentStage(null);
    setOverallProgress(0);
  };

  const getStageIcon = (stage: ImportStage) => {
    switch (stage.id) {
      case "parsing": return <FileSpreadsheet className="w-4 h-4" />;
      case "classifying": return <Database className="w-4 h-4" />;
      case "deduplicating": return <Search className="w-4 h-4" />;
      case "filling": return <GitMerge className="w-4 h-4" />;
      case "importing": return <Upload className="w-4 h-4" />;
      case "archiving": return <Archive className="w-4 h-4" />;
      default: return <Database className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: ImportStage["status"]) => {
    switch (status) {
      case "completed": return "text-[rgb(196,227,230)]";
      case "processing": return "text-[rgb(254,212,92)]";
      case "error": return "text-[rgb(251,194,213)]";
      default: return "text-white/40";
    }
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
            <Upload className="w-5 h-5 text-[rgb(142,132,247)]" />
          </div>
          <div>
            <CardTitle className="text-white">Smart Data Import</CardTitle>
            <CardDescription className="text-white/50">
              Import CSV/Excel files with automatic deduplication and field merging
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isImporting && !results && (
          <>
            <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center hover:border-white/40 transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                id="smart-file-upload"
                data-testid="input-smart-file-upload"
              />
              <label htmlFor="smart-file-upload" className="cursor-pointer">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-white/40" />
                <p className="text-white/80 mb-2">
                  {file ? file.name : "Drop your file here or click to browse"}
                </p>
                <p className="text-white/40 text-sm">
                  Supports CSV, XLSX, XLS (max 50MB)
                </p>
              </label>
            </div>

            {file && extractedData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                    <div>
                      <p className="text-white font-medium">{file.name}</p>
                      <p className="text-white/50 text-sm">
                        {extractedData.length} rows ready to import
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                      {Object.keys(columnMapping).length} columns mapped
                    </Badge>
                  </div>
                </div>

                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending}
                  className="w-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(196,227,230)] hover:opacity-90 text-white"
                  data-testid="button-import"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {isImporting && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Overall Progress</span>
                <span className="text-white">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-3" />
            </div>

            <div className="space-y-3">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    stage.status === "processing" 
                      ? "bg-[rgb(254,212,92)]/10 border border-[rgb(254,212,92)]/30" 
                      : "bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={getStatusColor(stage.status)}>
                      {stage.status === "processing" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : stage.status === "completed" ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : stage.status === "error" ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        getStageIcon(stage)
                      )}
                    </div>
                    <span className={`text-sm ${stage.status === "pending" ? "text-white/40" : "text-white"}`}>
                      {stage.label}
                    </span>
                  </div>
                  {stage.details && (
                    <span className="text-sm text-white/50">{stage.details}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-[rgb(196,227,230)]/10 border border-[rgb(196,227,230)]/30">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-[rgb(196,227,230)]" />
                <span className="text-white font-medium">Import Complete</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-[rgb(196,227,230)]">{results.created}</div>
                  <div className="text-xs text-white/50">Created</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-[rgb(142,132,247)]">{results.updated}</div>
                  <div className="text-xs text-white/50">Updated</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-[rgb(254,212,92)]">{results.merged}</div>
                  <div className="text-xs text-white/50">Merged</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-white/60">{results.archived}</div>
                  <div className="text-xs text-white/50">Archived</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-white/40">{results.skipped}</div>
                  <div className="text-xs text-white/50">Skipped</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white/5">
                  <div className="text-2xl font-bold text-[rgb(251,194,213)]">{results.failed}</div>
                  <div className="text-xs text-white/50">Failed</div>
                </div>
              </div>
            </div>

            <Button
              onClick={resetImporter}
              variant="outline"
              className="w-full border-white/20 text-white"
              data-testid="button-import-another"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Import Another File
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
