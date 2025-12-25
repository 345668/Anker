import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  Database,
  FileJson,
  ChevronRight,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FieldDefinition {
  id: string;
  groupId: string;
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  sampleValues: any[];
  occurrenceCount: number;
  isCustomField: boolean;
}

interface FieldMapping {
  id: string;
  groupId: string;
  folkFieldKey: string;
  targetTable: string;
  targetColumn: string | null;
  storeInJson: boolean;
  transformType: string | null;
  aiConfidence: number | null;
  aiReason: string | null;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface Props {
  groupId: string;
  entityType?: "person" | "company";
  onMappingsApproved?: () => void;
}

const INVESTOR_COLUMNS = [
  "firstName", "lastName", "email", "phone", "title", "company",
  "linkedinUrl", "personLinkedinUrl", "website", "investorType",
  "investorState", "investorCountry", "fundHQ", "hqLocation",
  "fundingStage", "typicalInvestment", "numLeadInvestments",
  "totalInvestments", "recentInvestments", "status", "bio", "notes"
];

const INVESTMENT_FIRM_COLUMNS = [
  "name", "description", "website", "linkedinUrl", "email", "phone",
  "fundingRaised", "lastFundingDate", "foundationYear", "employeeRange",
  "industry", "hqLocation", "status", "notes"
];

export default function FieldMappingPanel({ groupId, entityType = "person", onMappingsApproved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"idle" | "discovering" | "mapping" | "reviewing">("idle");
  
  const targetTable = entityType === "company" ? "investmentFirms" : "investors";
  const availableColumns = entityType === "company" ? INVESTMENT_FIRM_COLUMNS : INVESTOR_COLUMNS;

  const definitionsQuery = useQuery<FieldDefinition[]>({
    queryKey: ["/api/admin/folk/field-definitions", groupId],
    enabled: !!groupId,
  });

  const mappingsQuery = useQuery<FieldMapping[]>({
    queryKey: ["/api/admin/folk/field-mappings", groupId],
    enabled: !!groupId,
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/folk/discover-fields", { groupId, entityType });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Fields discovered",
        description: `Found ${data.fieldsDiscovered} fields in this group`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/field-definitions", groupId] });
      setStep("mapping");
    },
    onError: (error: Error) => {
      toast({
        title: "Discovery failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateMappingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/folk/generate-mappings", { 
        groupId, 
        targetTable 
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AI mappings generated",
        description: `${data.suggestions.length} field mappings suggested`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/field-mappings", groupId] });
      setStep("reviewing");
    },
    onError: (error: Error) => {
      toast({
        title: "Mapping generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMappingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FieldMapping> }) => {
      const res = await apiRequest("PATCH", `/api/admin/folk/field-mappings/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/field-mappings", groupId] });
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/folk/field-mappings/${groupId}/approve-all`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Mappings approved",
        description: `${data.approvedCount} mappings approved and ready for import`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/field-mappings", groupId] });
      onMappingsApproved?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const definitions = definitionsQuery.data || [];
  const mappings = mappingsQuery.data || [];
  const approvedCount = mappings.filter(m => m.isApproved).length;
  const hasAllApproved = approvedCount === mappings.length && mappings.length > 0;

  const handleStartDiscovery = () => {
    setStep("discovering");
    discoverMutation.mutate();
  };

  const handleGenerateMappings = () => {
    setStep("mapping");
    generateMappingsMutation.mutate();
  };

  const handleMappingChange = (mappingId: string, targetColumn: string | null) => {
    updateMappingMutation.mutate({
      id: mappingId,
      data: {
        targetColumn,
        storeInJson: targetColumn === null,
      },
    });
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;
    if (confidence >= 80) return <Badge className="bg-green-500/20 text-green-400 text-xs">High</Badge>;
    if (confidence >= 50) return <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Medium</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 text-xs">Low</Badge>;
  };

  if (step === "idle" && definitions.length === 0) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="w-5 h-5 text-[rgb(142,132,247)]" />
            Smart Field Mapping
          </CardTitle>
          <CardDescription className="text-white/60">
            Use AI to automatically detect and map fields from Folk CRM to your database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center">
              <Database className="w-8 h-8 text-[rgb(142,132,247)]" />
            </div>
            <p className="text-white/70 text-center max-w-md">
              First, let's analyze the Folk group to discover all available fields.
              AI will then suggest the best column mappings.
            </p>
            <Button
              onClick={handleStartDiscovery}
              disabled={discoverMutation.isPending}
              className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
              data-testid="button-discover-fields"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Discover Fields
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "discovering" || discoverMutation.isPending) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Loader2 className="w-5 h-5 animate-spin text-[rgb(142,132,247)]" />
            Discovering Fields...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 gap-4">
            <Progress value={50} className="w-64 h-2" />
            <p className="text-white/60">Analyzing Folk CRM data structure...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (definitions.length > 0 && mappings.length === 0) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
            {definitions.length} Fields Discovered
          </CardTitle>
          <CardDescription className="text-white/60">
            Now let AI suggest the best column mappings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 max-h-48 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {definitions.map((def) => (
                <Badge
                  key={def.id}
                  variant="outline"
                  className="border-white/20 text-white/80"
                >
                  {def.fieldName}
                  <span className="ml-1 text-white/40 text-xs">({def.fieldType})</span>
                </Badge>
              ))}
            </div>
          </div>
          <Button
            onClick={handleGenerateMappings}
            disabled={generateMappingsMutation.isPending}
            className="w-full bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
            data-testid="button-generate-mappings"
          >
            {generateMappingsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI is thinking...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate AI Mappings
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Database className="w-5 h-5 text-[rgb(142,132,247)]" />
              Field Mappings
            </CardTitle>
            <CardDescription className="text-white/60">
              Review and adjust how Folk fields map to your database
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-white/20 text-white/80">
              {approvedCount}/{mappings.length} approved
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                discoverMutation.mutate();
                generateMappingsMutation.mutate();
              }}
              disabled={discoverMutation.isPending || generateMappingsMutation.isPending}
              className="border-white/20 text-white/80"
              data-testid="button-refresh-mappings"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
          {mappings.map((mapping) => {
            const definition = definitions.find(d => d.fieldKey === mapping.folkFieldKey);
            return (
              <div
                key={mapping.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 flex-wrap"
              >
                <div className="flex-1 min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">
                      {definition?.fieldName || mapping.folkFieldKey}
                    </span>
                    {definition?.isCustomField && (
                      <Badge className="bg-purple-500/20 text-purple-400 text-xs">Custom</Badge>
                    )}
                  </div>
                  {definition?.sampleValues && definition.sampleValues.length > 0 && (
                    <p className="text-xs text-white/40 truncate mt-0.5">
                      e.g. {String(definition.sampleValues[0]).slice(0, 30)}
                    </p>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-white/30" />

                <div className="flex items-center gap-2 min-w-[200px]">
                  <Select
                    value={mapping.targetColumn || "__json__"}
                    onValueChange={(value) => 
                      handleMappingChange(mapping.id, value === "__json__" ? null : value)
                    }
                  >
                    <SelectTrigger 
                      className="w-[180px] bg-white/5 border-white/20 text-white"
                      data-testid={`select-mapping-${mapping.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__json__">
                        <div className="flex items-center gap-2">
                          <FileJson className="w-4 h-4 text-orange-400" />
                          Store in JSON
                        </div>
                      </SelectItem>
                      {INVESTOR_COLUMNS.map((col) => (
                        <SelectItem key={col} value={col}>
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-400" />
                            {col}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  {getConfidenceBadge(mapping.aiConfidence)}
                  {mapping.isApproved ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center gap-4 pt-4 border-t border-white/10 flex-wrap">
          <p className="text-sm text-white/60">
            {hasAllApproved 
              ? "All mappings approved. Ready to import!" 
              : "Review mappings and approve to proceed with import"
            }
          </p>
          <div className="flex gap-2 flex-wrap">
            {hasAllApproved ? (
              <Button
                onClick={() => onMappingsApproved?.()}
                className="bg-[rgb(196,227,230)] text-black hover:bg-[rgb(196,227,230)]/80"
                data-testid="button-run-import"
              >
                <Download className="w-4 h-4 mr-2" />
                Run Import
              </Button>
            ) : (
              <Button
                onClick={() => approveAllMutation.mutate()}
                disabled={approveAllMutation.isPending}
                className="bg-[rgb(196,227,230)] text-black hover:bg-[rgb(196,227,230)]/80"
                data-testid="button-approve-all-mappings"
              >
                {approveAllMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Approve All & Import
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
