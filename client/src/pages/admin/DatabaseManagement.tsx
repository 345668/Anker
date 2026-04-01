import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Database, Users, Building2, Target, Trash2, RefreshCw, Search, AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import type { Investor, Startup, Contact } from "@shared/schema";

async function downloadExport(endpoint: string, filename: string, toast: (opts: any) => void) {
  try {
    const res = await fetch(endpoint, { credentials: "include" });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    toast({ title: "Export failed", description: err.message, variant: "destructive" });
  }
}

export default function DatabaseManagement() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvestors, setSelectedInvestors] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/database/stats"],
    retry: 1,
  });

  const { data: investorsResponse, isLoading: investorsLoading, error: investorsError } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
    retry: 1,
  });
  const investors = investorsResponse?.data ?? [];

  const { data: startupsResponse, isLoading: startupsLoading, error: startupsError } = useQuery<{ data: Startup[], total: number }>({
    queryKey: ["/api/startups"],
    retry: 1,
  });
  const startups = startupsResponse?.data ?? [];

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequest("DELETE", "/api/admin/database/investors", { ids });
    },
    onSuccess: (data: any) => {
      toast({ title: "Deleted successfully", description: `${data.deleted} records removed` });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/database/stats"] });
      setSelectedInvestors(new Set());
      setDeleteConfirmOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredInvestors = investors.filter(inv => {
    const query = searchQuery.toLowerCase();
    return (
      inv.firstName?.toLowerCase().includes(query) ||
      inv.lastName?.toLowerCase().includes(query) ||
      inv.email?.toLowerCase().includes(query)
    );
  });

  const hasError = statsError || investorsError || startupsError;

  const toggleInvestorSelection = (id: string) => {
    const newSelected = new Set(selectedInvestors);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInvestors(newSelected);
  };

  const toggleAllInvestors = () => {
    if (selectedInvestors.size === filteredInvestors.length) {
      setSelectedInvestors(new Set());
    } else {
      setSelectedInvestors(new Set(filteredInvestors.map(inv => inv.id)));
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Database</h1>
          <p className="text-white/60">Manage entities, contacts, and investor firms</p>
        </div>

        {hasError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">Error loading data</p>
              <p className="text-red-400/70 text-sm">
                {(statsError as Error)?.message || (investorsError as Error)?.message || (startupsError as Error)?.message || "Unknown error"}
              </p>
            </div>
          </div>
        )}

        {statsLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {Object.entries(stats).map(([key, value]) => (
              <div 
                key={key}
                className="bg-white/5 rounded-xl p-4 border border-white/10"
              >
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-white/50 text-sm capitalize">{key}</div>
              </div>
            ))}
          </div>
        ) : null}

        <Tabs defaultValue="investors" className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger 
              value="investors" 
              className="data-[state=active]:bg-[rgb(142,132,247)]/20 data-[state=active]:text-[rgb(142,132,247)]"
            >
              <Users className="w-4 h-4 mr-2" />
              Investors
            </TabsTrigger>
            <TabsTrigger 
              value="startups"
              className="data-[state=active]:bg-[rgb(142,132,247)]/20 data-[state=active]:text-[rgb(142,132,247)]"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Startups
            </TabsTrigger>
            <TabsTrigger
              value="exports"
              className="data-[state=active]:bg-[rgb(142,132,247)]/20 data-[state=active]:text-[rgb(142,132,247)]"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Exports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="investors" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  placeholder="Search investors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
              {selectedInvestors.size > 0 && (
                <Button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="bg-[rgb(251,194,213)] hover:bg-[rgb(251,194,213)]/80 text-black"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected ({selectedInvestors.size})
                </Button>
              )}
            </div>

            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-0">
                {investorsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 text-[rgb(142,132,247)] animate-spin" />
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-4 py-3 w-12">
                          <Checkbox
                            checked={selectedInvestors.size === filteredInvestors.length && filteredInvestors.length > 0}
                            onCheckedChange={toggleAllInvestors}
                            className="border-white/20"
                          />
                        </th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Name</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Email</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Title</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvestors.map((investor) => (
                        <tr 
                          key={investor.id} 
                          className={`border-b border-white/5 ${selectedInvestors.has(investor.id) ? 'bg-[rgb(142,132,247)]/10' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selectedInvestors.has(investor.id)}
                              onCheckedChange={() => toggleInvestorSelection(investor.id)}
                              className="border-white/20"
                            />
                          </td>
                          <td className="px-4 py-3 text-white">
                            {investor.firstName} {investor.lastName}
                          </td>
                          <td className="px-4 py-3 text-white/60">{investor.email}</td>
                          <td className="px-4 py-3 text-white/60">{investor.title}</td>
                          <td className="px-4 py-3">
                            {investor.source && (
                              <span className={`
                                px-2 py-1 rounded-full text-xs
                                ${investor.source === 'folk' ? 'bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]' : ''}
                                ${investor.source === 'manual' ? 'bg-white/10 text-white/60' : ''}
                              `}>
                                {investor.source}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="startups" className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-0">
                {startupsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 text-[rgb(142,132,247)] animate-spin" />
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Name</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Stage</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Location</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {startups.map((startup) => (
                        <tr key={startup.id} className="border-b border-white/5">
                          <td className="px-4 py-3 text-white">{startup.name}</td>
                          <td className="px-4 py-3 text-white/60">{startup.stage}</td>
                          <td className="px-4 py-3 text-white/60">{startup.location}</td>
                          <td className="px-4 py-3">
                            <span className={`
                              px-2 py-1 rounded-full text-xs
                              ${startup.isPublic ? 'bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]' : 'bg-white/10 text-white/40'}
                            `}>
                              {startup.isPublic ? 'Public' : 'Private'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exports" className="space-y-6">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-white">Full Database Exports</h2>
              <p className="text-white/50 text-sm mt-1">
                Download the entire database for each entity as a CSV file. Exports include all fields and run directly against the live database.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Investors */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">Investors</CardTitle>
                      <CardDescription className="text-white/40 text-xs">Individual investor records</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-white/50 text-xs mb-4 leading-relaxed">
                    All investor profiles including name, email, type, stages, sectors, check size, LinkedIn, Folk ID, and enrichment status.
                  </p>
                  <div className="text-white/30 text-xs mb-4">
                    {stats?.investors?.toLocaleString() ?? "—"} records
                  </div>
                  <Button
                    className="w-full bg-[rgb(142,132,247)]/20 hover:bg-[rgb(142,132,247)]/30 text-[rgb(142,132,247)] border border-[rgb(142,132,247)]/30"
                    disabled={exporting === "investors"}
                    data-testid="button-export-investors-csv"
                    onClick={async () => {
                      setExporting("investors");
                      const date = new Date().toISOString().split("T")[0];
                      await downloadExport("/api/admin/export/investors", `investors_${date}.csv`, toast);
                      setExporting(null);
                    }}
                  >
                    {exporting === "investors"
                      ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Exporting…</>
                      : <><Download className="w-4 h-4 mr-2" /> Export Investors CSV</>
                    }
                  </Button>
                </CardContent>
              </Card>

              {/* Investment Firms */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(196,227,230)]/20 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-[rgb(196,227,230)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">Investment Firms</CardTitle>
                      <CardDescription className="text-white/40 text-xs">All firm records (full database)</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-white/50 text-xs mb-4 leading-relaxed">
                    All investment firm profiles including name, type, classification, AUM, check sizes, sectors, stages, location, and enrichment status.
                  </p>
                  <div className="text-white/30 text-xs mb-4">
                    {stats?.firms?.toLocaleString() ?? "—"} records
                  </div>
                  <Button
                    className="w-full bg-[rgb(196,227,230)]/10 hover:bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border border-[rgb(196,227,230)]/30"
                    disabled={exporting === "firms"}
                    data-testid="button-export-firms-csv"
                    onClick={async () => {
                      setExporting("firms");
                      const date = new Date().toISOString().split("T")[0];
                      await downloadExport("/api/admin/export/investment-firms", `investment_firms_${date}.csv`, toast);
                      setExporting(null);
                    }}
                  >
                    {exporting === "firms"
                      ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Exporting…</>
                      : <><Download className="w-4 h-4 mr-2" /> Export Firms CSV</>
                    }
                  </Button>
                </CardContent>
              </Card>

              {/* Family Offices */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <Database className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-base">Family Offices</CardTitle>
                      <CardDescription className="text-white/40 text-xs">Filtered family office firms</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-white/50 text-xs mb-4 leading-relaxed">
                    Investment firms classified as Single Family Office, Multi-Family Office, or Family Office — filtered from the full firm database.
                  </p>
                  <div className="text-white/30 text-xs mb-4">
                    Subset of {stats?.firms?.toLocaleString() ?? "—"} total firms
                  </div>
                  <Button
                    className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    disabled={exporting === "family-offices"}
                    data-testid="button-export-family-offices-csv"
                    onClick={async () => {
                      setExporting("family-offices");
                      const date = new Date().toISOString().split("T")[0];
                      await downloadExport("/api/admin/export/family-offices", `family_offices_${date}.csv`, toast);
                      setExporting(null);
                    }}
                  >
                    {exporting === "family-offices"
                      ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Exporting…</>
                      : <><Download className="w-4 h-4 mr-2" /> Export Family Offices CSV</>
                    }
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
              <p className="text-white/40 text-xs leading-relaxed">
                These exports query the live database directly and may take a few seconds for large datasets. The resulting CSV file will be downloaded to your browser automatically.
                All exports are admin-only and not accessible to regular users.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="bg-[rgb(30,30,30)] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Delete Investors</DialogTitle>
              <DialogDescription className="text-white/60">
                Are you sure you want to delete {selectedInvestors.size} investor(s)? 
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteConfirmOpen(false)}
                className="border-white/20 text-white"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedInvestors))}
                disabled={bulkDeleteMutation.isPending}
                className="bg-[rgb(251,194,213)] hover:bg-[rgb(251,194,213)]/80 text-black"
              >
                {bulkDeleteMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
