import { useState, useCallback } from "react";
import { Upload, Database, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ImportResult {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

const INVESTMENT_FIRMS_COLUMNS = [
  "id", "name", "website", "description", "location", "aum", "stages", "sectors",
  "check_size_min", "check_size_max", "logo", "logo_url", "firm_classification",
  "enrichment_status", "last_enrichment_date", "folk_id", "type", "portfolio_count",
  "linkedin_url", "twitter_url", "source", "hq_location", "industry", "emails",
  "phones", "addresses", "urls", "funding_raised", "last_funding_date",
  "foundation_year", "employee_range", "status", "typical_check_size", "created_at"
];

const INVESTORS_COLUMNS = [
  "id", "first_name", "last_name", "email", "phone", "title", "linkedin_url",
  "twitter_url", "avatar", "bio", "stages", "sectors", "location", "is_active",
  "folk_id", "source", "investor_type", "investor_state", "investor_country",
  "fund_hq", "hq_location", "funding_stage", "typical_investment",
  "num_lead_investments", "total_investments", "recent_investments",
  "status", "website", "address", "enrichment_status", "last_enrichment_date", "created_at"
];

export default function DirectImporter({ onImportComplete }: { onImportComplete?: () => void }) {
  const { toast } = useToast();
  const [targetTable, setTargetTable] = useState<"investment_firms" | "investors">("investment_firms");
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const expectedColumns = targetTable === "investment_firms" ? INVESTMENT_FIRMS_COLUMNS : INVESTORS_COLUMNS;

  const parseCSV = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return { headers: [], data: [] };

    const parseRow = (row: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          if (inQuotes && row[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]);
    const data = lines.slice(1).map(line => {
      const values = parseRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] || "";
      });
      return row;
    });

    return { headers, data };
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, data } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvData(data);
    };
    reader.readAsText(selectedFile);
  }, [parseCSV]);

  const handleImport = async () => {
    if (!csvData.length) return;

    setIsImporting(true);
    setProgress(0);
    setResult(null);

    try {
      const response = await apiRequest("POST", "/api/admin/import/direct", {
        table: targetTable,
        data: csvData
      });

      const importResult = response as unknown as ImportResult;
      setResult(importResult);
      setProgress(100);

      if (importResult.success) {
        toast({
          title: "Import Complete",
          description: `Created: ${importResult.created}, Updated: ${importResult.updated}, Failed: ${importResult.failed}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
        queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
        onImportComplete?.();
      } else {
        toast({
          title: "Import Failed",
          description: importResult.errors?.[0] || "An error occurred",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message || "Failed to import data",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const matchingColumns = csvHeaders.filter(h => expectedColumns.includes(h));
  const unmatchedCsvHeaders = csvHeaders.filter(h => !expectedColumns.includes(h));
  const missingDbColumns = expectedColumns.filter(c => !csvHeaders.includes(c));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 border border-white/10">
          <Database className="w-6 h-6 text-[rgb(142,132,247)]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Direct Database Import</h3>
          <p className="text-white/60 text-sm">
            Import CSV files with exact 1:1 column mapping to database tables. 
            No AI processing - columns must match exactly.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-white/80 mb-3 block">Select Target Table</Label>
          <RadioGroup
            value={targetTable}
            onValueChange={(v) => setTargetTable(v as "investment_firms" | "investors")}
            className="flex gap-4"
          >
            <div className={cn(
              "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
              targetTable === "investment_firms" 
                ? "bg-[rgb(142,132,247)]/20 border-[rgb(142,132,247)]/50" 
                : "bg-white/5 border-white/10 hover:border-white/20"
            )}>
              <RadioGroupItem value="investment_firms" id="firms" />
              <Label htmlFor="firms" className="cursor-pointer text-white">
                Investment Firms
              </Label>
            </div>
            <div className={cn(
              "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
              targetTable === "investors" 
                ? "bg-[rgb(142,132,247)]/20 border-[rgb(142,132,247)]/50" 
                : "bg-white/5 border-white/10 hover:border-white/20"
            )}>
              <RadioGroupItem value="investors" id="investors" />
              <Label htmlFor="investors" className="cursor-pointer text-white">
                Investors
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label className="text-white/80 mb-3 block">Upload CSV File</Label>
          <div className="relative">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              data-testid="input-direct-csv"
            />
            <div className={cn(
              "flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all",
              file ? "bg-green-500/10 border-green-500/30" : "bg-white/5 border-white/20 hover:border-white/40"
            )}>
              {file ? (
                <>
                  <FileSpreadsheet className="w-6 h-6 text-green-400" />
                  <span className="text-white">{file.name}</span>
                  <span className="text-white/60">({csvData.length} rows)</span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-white/60" />
                  <span className="text-white/60">Drop CSV file here or click to browse</span>
                </>
              )}
            </div>
          </div>
        </div>

        {csvHeaders.length > 0 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-sm font-medium text-white mb-3">Column Mapping Preview</h4>
              
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">Matching Columns ({matchingColumns.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {matchingColumns.map(col => (
                      <span key={col} className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-300 border border-green-500/30">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>

                {unmatchedCsvHeaders.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-yellow-400">CSV Columns Not in DB ({unmatchedCsvHeaders.length}) - Will be ignored</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {unmatchedCsvHeaders.slice(0, 10).map(col => (
                        <span key={col} className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                          {col}
                        </span>
                      ))}
                      {unmatchedCsvHeaders.length > 10 && (
                        <span className="px-2 py-1 text-xs rounded bg-white/10 text-white/60">
                          +{unmatchedCsvHeaders.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {missingDbColumns.length > 0 && matchingColumns.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-blue-400">DB Columns Not in CSV ({missingDbColumns.length}) - Will use defaults</span>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                      {missingDbColumns.slice(0, 10).map(col => (
                        <span key={col} className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {col}
                        </span>
                      ))}
                      {missingDbColumns.length > 10 && (
                        <span className="px-2 py-1 text-xs rounded bg-white/10 text-white/60">
                          +{missingDbColumns.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-white/60 text-center">Importing {csvData.length} records...</p>
              </div>
            )}

            {result && (
              <div className={cn(
                "p-4 rounded-xl border",
                result.success ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {result.success ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={result.success ? "text-green-400" : "text-red-400"}>
                    {result.success ? "Import Successful" : "Import Failed"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-white/60">Created:</span>{" "}
                    <span className="text-white">{result.created}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Updated:</span>{" "}
                    <span className="text-white">{result.updated}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Failed:</span>{" "}
                    <span className="text-white">{result.failed}</span>
                  </div>
                </div>
                {result.errors?.length > 0 && (
                  <div className="mt-3 text-sm text-red-300">
                    {result.errors.slice(0, 3).map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                    {result.errors.length > 3 && (
                      <div className="text-white/60">+{result.errors.length - 3} more errors</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={isImporting || matchingColumns.length === 0}
              className="w-full rounded-xl bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium"
              data-testid="button-direct-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Import {csvData.length} Records to {targetTable === "investment_firms" ? "Investment Firms" : "Investors"}
                </>
              )}
            </Button>
          </div>
        )}

        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
          <h4 className="text-sm font-medium text-white mb-2">Expected Columns for {targetTable === "investment_firms" ? "Investment Firms" : "Investors"}</h4>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {expectedColumns.map(col => (
              <span key={col} className="px-2 py-0.5 text-xs rounded bg-white/10 text-white/70">
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
