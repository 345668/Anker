import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  Users,
  Download,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

interface MissingRecord {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  emails?: string[];
  jobTitle?: string;
  companies?: { name: string }[];
}

interface ScanResult {
  totalInFolk: number;
  existingInLocal: number;
  missing: number;
  missingRecords: MissingRecord[];
}

export default function MissingRecordsScanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  const groupsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/folk/groups"],
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/folk/scan-missing", { groupId: selectedGroup });
      return res.json();
    },
    onSuccess: (data: ScanResult) => {
      setScanResult(data);
      setSelectedRecords(new Set(data.missingRecords.map((r) => r.id)));
      toast({
        title: "Scan complete",
        description: `Found ${data.missing} missing records out of ${data.totalInFolk} in Folk`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fillMutation = useMutation({
    mutationFn: async () => {
      const recordsToFill = scanResult?.missingRecords.filter((r) => selectedRecords.has(r.id)) || [];
      const res = await apiRequest("POST", "/api/admin/folk/fill-missing", { missingRecords: recordsToFill });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import complete",
        description: `Created ${data.created} records, ${data.failed} failed`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      setScanResult(null);
      setSelectedRecords(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleRecord = (id: string) => {
    const newSet = new Set(selectedRecords);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRecords(newSet);
  };

  const toggleAll = () => {
    if (selectedRecords.size === scanResult?.missingRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(scanResult?.missingRecords.map((r) => r.id)));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-[rgb(142,132,247)]" />
            Find Missing Records
          </CardTitle>
          <CardDescription className="text-white/60">
            Scan Folk CRM to find records that haven't been imported yet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-[300px] border-white/20 text-white bg-white/5" data-testid="select-scan-group">
                <SelectValue placeholder="Select a Folk group to scan" />
              </SelectTrigger>
              <SelectContent>
                {groupsQuery.data?.map((group: any) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={!selectedGroup || scanMutation.isPending}
              className="bg-[rgb(142,132,247)]"
              data-testid="button-scan-missing"
            >
              {scanMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Scan for Missing
            </Button>
          </div>
        </CardContent>
      </Card>

      {scanResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-[rgb(142,132,247)]" />
                <p className="text-2xl font-bold text-white">{scanResult.totalInFolk}</p>
                <p className="text-white/60 text-sm">Total in Folk</p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4 text-center">
                <CheckCircle className="w-6 h-6 mx-auto mb-2 text-[rgb(196,227,230)]" />
                <p className="text-2xl font-bold text-white">{scanResult.existingInLocal}</p>
                <p className="text-white/60 text-sm">Already Imported</p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-4 text-center">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-[rgb(251,194,213)]" />
                <p className="text-2xl font-bold text-white">{scanResult.missing}</p>
                <p className="text-white/60 text-sm">Missing Records</p>
              </CardContent>
            </Card>
          </div>

          {scanResult.missingRecords.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-white">Missing Records</CardTitle>
                  <CardDescription className="text-white/60">
                    {selectedRecords.size} of {scanResult.missingRecords.length} selected
                  </CardDescription>
                </div>
                <Button
                  onClick={() => fillMutation.mutate()}
                  disabled={selectedRecords.size === 0 || fillMutation.isPending}
                  className="bg-[rgb(142,132,247)]"
                  data-testid="button-fill-missing"
                >
                  {fillMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Import Selected ({selectedRecords.size})
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto border border-white/10 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedRecords.size === scanResult.missingRecords.length}
                            onCheckedChange={toggleAll}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                        <TableHead className="text-white/60">Name</TableHead>
                        <TableHead className="text-white/60">Email</TableHead>
                        <TableHead className="text-white/60">Title</TableHead>
                        <TableHead className="text-white/60">Company</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scanResult.missingRecords.map((record) => (
                        <TableRow key={record.id} className="border-white/10">
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.has(record.id)}
                              onCheckedChange={() => toggleRecord(record.id)}
                              data-testid={`checkbox-record-${record.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-white">
                            {record.fullName ||
                              `${record.firstName || ""} ${record.lastName || ""}`.trim() ||
                              "Unknown"}
                          </TableCell>
                          <TableCell className="text-white/60">
                            {record.emails?.[0] || "-"}
                          </TableCell>
                          <TableCell className="text-white/60">
                            {record.jobTitle || "-"}
                          </TableCell>
                          <TableCell className="text-white/60">
                            {record.companies?.[0]?.name || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
