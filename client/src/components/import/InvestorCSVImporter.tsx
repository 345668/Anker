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
  Building2,
  Users,
  ChevronDown,
  ChevronUp,
  Sparkles,
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
import { apiRequest } from "@/lib/queryClient";

interface ColumnMapping {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

const investorColumnMappings: ColumnMapping[] = [
  { key: "company_name", label: "Company/Firm Name", required: true, aliases: ["Company Name", "Firm Name", "Family Office Name", "Fund Name", "Organization", "VC Name", "Investor Name"] },
  { key: "firm_type", label: "Investor Type", aliases: ["Investor Type", "Fund Type", "Type", "Organization Type", "Family Office Structure", "VC Type"] },
  { key: "website", label: "Website", aliases: ["Website", "Family Office Website Address", "URL", "Company Website", "Site"] },
  { key: "linkedin_url", label: "Firm LinkedIn", aliases: ["Firm LinkedIn Address", "Corporate Linkedin Address", "Company LinkedIn", "LinkedIn", "LinkedIn URL"] },
  { key: "firm_description", label: "Description", aliases: ["Firm Description", "Family Office Description", "Description", "About", "Bio"] },
  { key: "investment_thesis", label: "Investment Thesis", aliases: ["Investment Thesis", "Thesis", "Strategy", "Focus"] },
  { key: "investment_focus", label: "Investment Focus", aliases: ["Investment Focus", "Focus Areas", "Sector Focus", "Sectors"] },
  { key: "investment_stages", label: "Investment Stage", aliases: ["Investment Stage", "Stage", "Preferred Stage", "Stages", "Stage Focus"] },
  { key: "preferred_geography", label: "Preferred Geography", aliases: ["Preferred Geography", "Geography", "Regions", "Location Focus", "Geographic Focus"] },
  { key: "check_size_min", label: "Min Check Size", aliases: ["Check Size Min", "Min Investment", "Minimum Check", "Min Check"] },
  { key: "check_size_max", label: "Max Check Size", aliases: ["Check Size Max", "Max Investment", "Maximum Check", "Max Check", "Avg Check Size"] },
  { key: "typical_investment", label: "Typical Check Size", aliases: ["Typical Investment", "Typical Check", "Average Check", "Check Size", "Investment Size", "Ticket Size", "Typical Ticket", "Average Investment"] },
  { key: "aum", label: "AUM", aliases: ["AUM", "Assets Under Management", "Fund Size", "Firm Size", "Family Office Size"] },
  { key: "city", label: "City", aliases: ["City", "Family Office City", "Location"] },
  { key: "country", label: "Country", aliases: ["Country", "Family Office Country", "Nation"] },
  { key: "notes", label: "Notes", aliases: ["Additional Notes", "Notes", "Comments", "Remarks"] },
];

const contactColumnMappings: ColumnMapping[] = [
  { key: "full_name", label: "Full Name", required: true, aliases: ["Contact Full Name", "Full Name", "Name", "Contact Name", "Person Name"] },
  { key: "first_name", label: "First Name", aliases: ["Contact First Name", "First Name", "Given Name"] },
  { key: "last_name", label: "Last Name", aliases: ["Contact Last Name", "Last Name", "Family Name", "Surname"] },
  { key: "title", label: "Job Title", aliases: ["Contact Title", "Contact Job Title", "Title", "Position", "Role", "Job Title"] },
  { key: "email", label: "Email", required: true, aliases: ["Work Email", "Email", "Contact Primary Email", "Primary E-Mail", "Business Email", "E-mail"] },
  { key: "phone", label: "Phone", aliases: ["Primary Phone Number", "Phone", "Contact Phone", "Mobile", "Phone Number"] },
  { key: "linkedin_url", label: "LinkedIn", aliases: ["Personal LinkedIn Address", "Contact LinkedIn Profile", "LinkedIn Profile", "Contact LinkedIn", "LinkedIn"] },
  { key: "firm_name", label: "Company", aliases: ["Company", "Firm", "Organization", "Company Name", "Employer"] },
  { key: "location", label: "Location", aliases: ["Contact Location", "Location", "City", "Address"] },
  { key: "notes", label: "Notes", aliases: ["Notes", "Comments", "Bio", "Description"] },
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
  type?: "firms" | "contacts" | "both";
  onImportComplete?: () => void;
}

export default function InvestorCSVImporter({ type = "both", onImportComplete }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(1);
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [extractedData, setExtractedData] = useState<Record<string, any>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ firms: 0, contacts: 0, failed: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importMode, setImportMode] = useState<"firms" | "contacts" | "both">(
    type === "firms" ? "firms" : type === "contacts" ? "contacts" : "both"
  );

  const normalizeString = (str: string): string => {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  const findBestMatch = (column: string, mappings: ColumnMapping[]): string | null => {
    const normalized = normalizeString(column);
    
    for (const mapping of mappings) {
      if (normalizeString(mapping.label) === normalized) {
        return mapping.key;
      }
      for (const alias of mapping.aliases) {
        if (normalizeString(alias) === normalized) {
          return mapping.key;
        }
      }
    }
    
    for (const mapping of mappings) {
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
    setIsProcessing(true);

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
        
        reader.onerror = () => {
          reject(new Error("Failed to read file"));
        };
        
        reader.readAsArrayBuffer(selectedFile);
      });

      if (data.length === 0) {
        toast({
          title: "Empty file",
          description: "The file contains no data rows",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      const columns = Object.keys(data[0]);
      setSourceColumns(columns);
      setExtractedData(data);

      const mappings = importMode === "contacts" ? contactColumnMappings : investorColumnMappings;
      const autoMapping: Record<string, string> = {};
      
      for (const column of columns) {
        const match = findBestMatch(column, mappings);
        if (match) {
          autoMapping[column] = match;
        }
      }
      
      setColumnMapping(autoMapping);
      setStep(2);
      
      toast({
        title: "File parsed successfully",
        description: `Found ${data.length} rows and ${columns.length} columns`,
      });
    } catch (error: any) {
      toast({
        title: "Parse error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const normalizeFirmType = (type: string): string => {
    if (!type) return "";
    const normalized = firmTypeMapping[type];
    if (normalized) return normalized;
    
    const upperType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    return firmTypeMapping[upperType] || type;
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      setStep(4);
      setImportProgress(0);
      setImportResults({ firms: 0, contacts: 0, failed: 0 });

      const mappedData = extractedData.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [sourceCol, targetKey] of Object.entries(columnMapping)) {
          if (targetKey && row[sourceCol] !== undefined) {
            let value = row[sourceCol];
            
            if (targetKey === "firm_type") {
              value = normalizeFirmType(String(value));
            }
            if (targetKey === "check_size_min" || targetKey === "check_size_max" || targetKey === "aum") {
              const numStr = String(value).replace(/[^0-9.]/g, "");
              value = numStr ? parseFloat(numStr) : null;
            }
            
            mapped[targetKey] = value;
          }
        }
        return mapped;
      });

      const endpoint = importMode === "contacts" 
        ? "/api/admin/import/contacts" 
        : "/api/admin/import/investors";

      const res = await apiRequest("POST", endpoint, { 
        records: mappedData,
        mode: importMode 
      });
      return res.json();
    },
    onSuccess: (data) => {
      setImportResults({
        firms: data.firmsCreated || 0,
        contacts: data.contactsCreated || 0,
        failed: data.failed || 0,
      });
      setImportProgress(100);
      
      toast({
        title: "Import completed",
        description: `Created ${data.firmsCreated || 0} firms, ${data.contactsCreated || 0} contacts. Failed: ${data.failed || 0}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      
      onImportComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetImporter = () => {
    setFile(null);
    setStep(1);
    setSourceColumns([]);
    setExtractedData([]);
    setColumnMapping({});
    setImportProgress(0);
    setImportResults({ firms: 0, contacts: 0, failed: 0 });
  };

  const activeMappings = importMode === "contacts" ? contactColumnMappings : investorColumnMappings;
  const mappedCount = Object.values(columnMapping).filter(Boolean).length;
  const requiredMapped = activeMappings
    .filter((m) => m.required)
    .every((m) => Object.values(columnMapping).includes(m.key));

  return (
    <div className="space-y-6">
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <Select value={importMode} onValueChange={(v) => setImportMode(v as any)}>
              <SelectTrigger className="w-[200px] border-white/20 text-white bg-white/5" data-testid="select-import-mode">
                <SelectValue placeholder="Import type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="firms">Investment Firms</SelectItem>
                <SelectItem value="contacts">Contacts</SelectItem>
                <SelectItem value="both">Both (Auto-detect)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label
            className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-white/40 transition-colors bg-white/5"
            data-testid="csv-dropzone"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {isProcessing ? (
                <>
                  <Loader2 className="w-10 h-10 mb-3 text-[rgb(142,132,247)] animate-spin" />
                  <p className="text-white/60">Processing file...</p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 mb-3 text-white/40" />
                  <p className="mb-2 text-sm text-white/60">
                    <span className="font-semibold text-white">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-white/40">CSV, XLSX, XLS (max 50MB)</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              disabled={isProcessing}
              data-testid="csv-file-input"
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Column Mapping</h3>
              <p className="text-white/60 text-sm">
                {mappedCount} of {sourceColumns.length} columns mapped
              </p>
            </div>
            <Badge className={requiredMapped ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]" : "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]"}>
              {requiredMapped ? "Required fields mapped" : "Missing required fields"}
            </Badge>
          </div>

          <div className="max-h-[400px] overflow-y-auto border border-white/10 rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Source Column</TableHead>
                  <TableHead className="text-white/60">Sample Value</TableHead>
                  <TableHead className="text-white/60">Maps To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceColumns.map((col) => (
                  <TableRow key={col} className="border-white/10">
                    <TableCell className="text-white font-medium">{col}</TableCell>
                    <TableCell className="text-white/60 max-w-[200px] truncate">
                      {extractedData[0]?.[col] || "-"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={columnMapping[col] || "skip"}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, [col]: v === "skip" ? "" : v })}
                      >
                        <SelectTrigger className="w-[180px] border-white/20 text-white bg-white/5" data-testid={`map-${col}`}>
                          <SelectValue placeholder="Skip" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Skip this column</SelectItem>
                          {activeMappings.map((m) => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.label} {m.required && "*"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Button variant="outline" onClick={resetImporter} className="border-white/20 text-white" data-testid="button-back">
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!requiredMapped}
              className="bg-[rgb(142,132,247)]"
              data-testid="button-preview"
            >
              Preview Import
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Preview</h3>
              <p className="text-white/60 text-sm">
                Ready to import {extractedData.length} records
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white/10 text-white/60">
                <Building2 className="w-3 h-3 mr-1" />
                {importMode === "contacts" ? "Contacts" : "Firms"}
              </Badge>
            </div>
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="text-white/60" data-testid="button-show-preview">
                {showAdvanced ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                {showAdvanced ? "Hide" : "Show"} sample data
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 max-h-[300px] overflow-auto border border-white/10 rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      {Object.entries(columnMapping)
                        .filter(([_, v]) => v)
                        .slice(0, 5)
                        .map(([_, targetKey]) => {
                          const mapping = activeMappings.find((m) => m.key === targetKey);
                          return (
                            <TableHead key={targetKey} className="text-white/60">
                              {mapping?.label || targetKey}
                            </TableHead>
                          );
                        })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extractedData.slice(0, 5).map((row, idx) => (
                      <TableRow key={idx} className="border-white/10">
                        {Object.entries(columnMapping)
                          .filter(([_, v]) => v)
                          .slice(0, 5)
                          .map(([sourceCol, targetKey]) => (
                            <TableCell key={targetKey} className="text-white/80 max-w-[150px] truncate">
                              {row[sourceCol] || "-"}
                            </TableCell>
                          ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-between pt-4">
            <Button variant="outline" onClick={() => setStep(2)} className="border-white/20 text-white" data-testid="button-back-mapping">
              Back to Mapping
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              className="bg-[rgb(142,132,247)]"
              data-testid="button-start-import"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Start Import
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="text-center">
            {importProgress < 100 ? (
              <>
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-[rgb(142,132,247)] animate-spin" />
                <h3 className="text-lg font-semibold text-white">Importing...</h3>
              </>
            ) : (
              <>
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-[rgb(196,227,230)]" />
                <h3 className="text-lg font-semibold text-white">Import Complete</h3>
              </>
            )}
          </div>

          <Progress value={importProgress} className="h-2" />

          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4 text-center">
                <Building2 className="w-6 h-6 mx-auto mb-2 text-[rgb(142,132,247)]" />
                <p className="text-2xl font-bold text-white">{importResults.firms}</p>
                <p className="text-white/60 text-sm">Firms Created</p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-[rgb(196,227,230)]" />
                <p className="text-2xl font-bold text-white">{importResults.contacts}</p>
                <p className="text-white/60 text-sm">Contacts Created</p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4 text-center">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-[rgb(251,194,213)]" />
                <p className="text-2xl font-bold text-white">{importResults.failed}</p>
                <p className="text-white/60 text-sm">Failed</p>
              </CardContent>
            </Card>
          </div>

          {importProgress >= 100 && (
            <div className="flex justify-center pt-4">
              <Button onClick={resetImporter} className="bg-[rgb(142,132,247)]" data-testid="button-import-another">
                Import Another File
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
