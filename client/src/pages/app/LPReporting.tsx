import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText,
  Download,
  Send,
  Calendar,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Trash2,
  TrendingUp,
  DollarSign,
  Users,
  Building2
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const reportFormSchema = z.object({
  title: z.string().min(1, "Report title is required"),
  reportType: z.string().min(1, "Report type is required"),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().optional(),
});

type ReportFormValues = z.infer<typeof reportFormSchema>;

function formatCurrency(amount: number): string {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "draft": return "bg-gray-500";
    case "pending_review": return "bg-yellow-500";
    case "approved": return "bg-green-500";
    case "published": return "bg-blue-500";
    default: return "bg-gray-500";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "draft": return <Clock className="w-4 h-4" />;
    case "pending_review": return <AlertCircle className="w-4 h-4" />;
    case "approved": return <CheckCircle className="w-4 h-4" />;
    case "published": return <Send className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

export default function LPReporting() {
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: myFirm } = useQuery<any>({
    queryKey: ["/api/institutional/my-firm"],
  });

  const firmId = myFirm?.firm?.id || myFirm?.team?.id;

  const { data: funds } = useQuery<any>({
    queryKey: ["/api/institutional/firms", firmId, "funds"],
    enabled: !!firmId,
  });

  const { data: reports, isLoading: loadingReports } = useQuery<any>({
    queryKey: ["/api/institutional/funds", selectedFundId, "reports"],
    enabled: !!selectedFundId,
  });

  const { data: fundAnalytics } = useQuery<any>({
    queryKey: ["/api/institutional/funds", selectedFundId, "analytics"],
    enabled: !!selectedFundId,
  });

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      title: "",
      reportType: "quarterly",
      periodStart: "",
      periodEnd: "",
      notes: "",
    },
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: ReportFormValues) => {
      const payload = {
        ...data,
        periodStart: data.periodStart ? new Date(data.periodStart).toISOString() : undefined,
        periodEnd: data.periodEnd ? new Date(data.periodEnd).toISOString() : undefined,
      };
      const response = await apiRequest("POST", `/api/institutional/funds/${selectedFundId}/reports`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/funds", selectedFundId, "reports"] });
      setCreateReportOpen(false);
      form.reset();
      toast({ title: "Report created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create report", variant: "destructive" });
    },
  });

  const updateReportStatusMutation = useMutation({
    mutationFn: async ({ reportId, status }: { reportId: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/institutional/reports/${reportId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/funds", selectedFundId, "reports"] });
      toast({ title: "Report status updated" });
    },
  });

  const analytics = fundAnalytics || {};

  if (!firmId) {
    return (
      <AppLayout 
        title="LP Reporting" 
        subtitle="Generate reports for your Limited Partners"
        videoUrl={videoBackgrounds.lpFunds}
      >
        <div className="max-w-3xl mx-auto py-12 px-6">
          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
              <p className="text-white/60">No firm association found</p>
              <p className="text-sm text-white/40 mt-2">Please set up your investment firm first</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="LP Reporting" 
      subtitle="Generate and manage reports for your Limited Partners"
      videoUrl={videoBackgrounds.lpFunds}
    >
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">LP Reports</h2>
            <p className="text-white/60">Create quarterly reports, capital call notices, and distributions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="bg-[rgb(30,30,30)] border-white/10 lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-white text-lg">Select Fund</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(funds as any[])?.map((fund: any) => (
                <div
                  key={fund.id}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedFundId === fund.id 
                      ? 'bg-purple-500/20 border border-purple-500/50' 
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                  onClick={() => setSelectedFundId(fund.id)}
                  data-testid={`button-select-fund-${fund.id}`}
                >
                  <p className="font-medium text-white">{fund.name}</p>
                  <p className="text-sm text-white/60">Vintage {fund.vintage || 'N/A'}</p>
                </div>
              )) || (
                <p className="text-white/50 text-sm">No funds available</p>
              )}
            </CardContent>
          </Card>

          <div className="lg:col-span-3 space-y-6">
            {selectedFundId ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">NAV</CardTitle>
                      <DollarSign className="w-4 h-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-white">
                        {formatCurrency(analytics.portfolio?.totalValue || 0)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">TVPI</CardTitle>
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-white">
                        {(analytics.performance?.tvpi || 0).toFixed(2)}x
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">DPI</CardTitle>
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-white">
                        {(analytics.performance?.dpi || 0).toFixed(2)}x
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">Portfolio</CardTitle>
                      <Building2 className="w-4 h-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-white">
                        {analytics.portfolio?.portfolioCount || 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Report History</h3>
                  <Dialog open={createReportOpen} onOpenChange={setCreateReportOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-create-report">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Report
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[rgb(30,30,30)] border-white/10 text-white max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Create LP Report</DialogTitle>
                        <DialogDescription className="text-white/60">
                          Generate a new report for Limited Partners
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit((data) => createReportMutation.mutate(data))} className="space-y-4">
                          <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Report Title</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Q4 2024 Quarterly Report" className="bg-white/5 border-white/20" data-testid="input-report-title" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="reportType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Report Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-report-type">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="quarterly">Quarterly Report</SelectItem>
                                    <SelectItem value="annual">Annual Report</SelectItem>
                                    <SelectItem value="capital_call">Capital Call Notice</SelectItem>
                                    <SelectItem value="distribution">Distribution Notice</SelectItem>
                                    <SelectItem value="k1">K-1 Tax Document</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="periodStart"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Period Start</FormLabel>
                                  <FormControl>
                                    <Input {...field} type="date" className="bg-white/5 border-white/20" data-testid="input-period-start" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="periodEnd"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Period End</FormLabel>
                                  <FormControl>
                                    <Input {...field} type="date" className="bg-white/5 border-white/20" data-testid="input-period-end" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Textarea {...field} placeholder="Additional notes for this report..." className="bg-white/5 border-white/20" data-testid="input-report-notes" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateReportOpen(false)} className="border-white/20">
                              Cancel
                            </Button>
                            <Button type="submit" disabled={createReportMutation.isPending} className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-submit-report">
                              {createReportMutation.isPending ? "Creating..." : "Create Report"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Card className="bg-[rgb(30,30,30)] border-white/10">
                  <CardContent className="p-0">
                    {loadingReports ? (
                      <div className="py-12 text-center text-white/60">Loading reports...</div>
                    ) : (reports as any[])?.length > 0 ? (
                      <div className="divide-y divide-white/10">
                        {(reports as any[]).map((report: any) => (
                          <div key={report.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <p className="font-medium text-white">{report.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {report.reportType}
                                  </Badge>
                                  <Badge className={`text-xs ${getStatusColor(report.status)}`}>
                                    {getStatusIcon(report.status)}
                                    <span className="ml-1">{report.status}</span>
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm text-white/60">
                                  {new Date(report.createdAt).toLocaleDateString()}
                                </p>
                                {report.periodEnd && (
                                  <p className="text-xs text-white/40">
                                    Period ending {new Date(report.periodEnd).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {report.status === "draft" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateReportStatusMutation.mutate({ reportId: report.id, status: "pending_review" })}
                                    className="text-white/60 hover:text-white"
                                    data-testid={`button-submit-review-${report.id}`}
                                  >
                                    Submit for Review
                                  </Button>
                                )}
                                {report.status === "pending_review" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateReportStatusMutation.mutate({ reportId: report.id, status: "approved" })}
                                    className="text-white/60 hover:text-white"
                                    data-testid={`button-approve-${report.id}`}
                                  >
                                    Approve
                                  </Button>
                                )}
                                {report.status === "approved" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateReportStatusMutation.mutate({ reportId: report.id, status: "published" })}
                                    className="text-white/60 hover:text-white"
                                    data-testid={`button-publish-${report.id}`}
                                  >
                                    <Send className="w-4 h-4 mr-1" />
                                    Publish
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-white/60 hover:text-white"
                                  data-testid={`button-download-${report.id}`}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
                        <p className="text-white/60">No reports yet</p>
                        <p className="text-sm text-white/40 mt-2">Create your first LP report</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-[rgb(30,30,30)] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Report Templates</CardTitle>
                    <CardDescription className="text-white/60">Quick-start templates for common LP communications</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover-elevate cursor-pointer">
                        <FileText className="w-8 h-8 text-purple-400 mb-3" />
                        <p className="font-medium text-white">Quarterly Report</p>
                        <p className="text-sm text-white/50 mt-1">Fund performance summary</p>
                      </div>
                      <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover-elevate cursor-pointer">
                        <DollarSign className="w-8 h-8 text-green-400 mb-3" />
                        <p className="font-medium text-white">Capital Call</p>
                        <p className="text-sm text-white/50 mt-1">Request capital from LPs</p>
                      </div>
                      <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover-elevate cursor-pointer">
                        <TrendingUp className="w-8 h-8 text-blue-400 mb-3" />
                        <p className="font-medium text-white">Distribution Notice</p>
                        <p className="text-sm text-white/50 mt-1">Return capital to LPs</p>
                      </div>
                      <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover-elevate cursor-pointer">
                        <Calendar className="w-8 h-8 text-orange-400 mb-3" />
                        <p className="font-medium text-white">Annual Letter</p>
                        <p className="text-sm text-white/50 mt-1">Year-end review</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
                  <p className="text-white/60">Select a fund to view and create reports</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
