import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Database, Users, Building2, Target, Trash2, RefreshCw, Search } from "lucide-react";
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

export default function DatabaseManagement() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvestors, setSelectedInvestors] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/database/stats"],
  });

  const { data: investorsResponse, isLoading: investorsLoading } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
  });
  const investors = investorsResponse?.data;

  const { data: startups, isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups"],
  });

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

  const filteredInvestors = investors?.filter(inv => {
    const query = searchQuery.toLowerCase();
    return (
      inv.firstName?.toLowerCase().includes(query) ||
      inv.lastName?.toLowerCase().includes(query) ||
      inv.email?.toLowerCase().includes(query)
    );
  });

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
    if (selectedInvestors.size === filteredInvestors?.length) {
      setSelectedInvestors(new Set());
    } else {
      setSelectedInvestors(new Set(filteredInvestors?.map(inv => inv.id)));
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Database</h1>
          <p className="text-white/60">Manage entities, contacts, and investor firms</p>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {stats && Object.entries(stats).map(([key, value]) => (
              <div 
                key={key}
                className="bg-white/5 rounded-xl p-4 border border-white/10"
              >
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-white/50 text-sm capitalize">{key}</div>
              </div>
            ))}
          </div>
        )}

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
                            checked={selectedInvestors.size === filteredInvestors?.length && filteredInvestors?.length > 0}
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
                      {filteredInvestors?.map((investor) => (
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
                      {startups?.map((startup) => (
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
