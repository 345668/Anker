import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { 
  TrendingUp, 
  DollarSign, 
  Building2, 
  Users, 
  Briefcase,
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  FileText,
  Calendar,
  Mail,
  Phone,
  Globe,
  CheckCircle,
  Clock,
  X
} from "lucide-react";
import { Link } from "wouter";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

const LP_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "family_office", label: "Family Office" },
  { value: "pension", label: "Pension Fund" },
  { value: "endowment", label: "Endowment" },
  { value: "foundation", label: "Foundation" },
  { value: "fund_of_funds", label: "Fund of Funds" },
  { value: "sovereign_wealth", label: "Sovereign Wealth" },
  { value: "insurance", label: "Insurance" },
  { value: "corporate", label: "Corporate" },
  { value: "hni", label: "High Net Worth Individual" },
];

function formatCurrency(amount: number): string {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

interface LpEntity {
  id: string;
  name: string;
  type: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  status: string;
  kycStatus: string;
  accreditedInvestor: boolean;
  qualifiedPurchaser: boolean;
  createdAt: string;
}

interface LpForm {
  name: string;
  type: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  country: string;
  status: string;
}

const defaultLpForm: LpForm = {
  name: "",
  type: "individual",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  country: "",
  status: "active",
};

function getKycBadge(status: string) {
  if (status === "approved") return <Badge className="bg-green-500/20 text-green-400 border-0 text-xs"><CheckCircle className="w-3 h-3 mr-1" />KYC Approved</Badge>;
  if (status === "expired") return <Badge className="bg-red-500/20 text-red-400 border-0 text-xs"><X className="w-3 h-3 mr-1" />KYC Expired</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-0 text-xs"><Clock className="w-3 h-3 mr-1" />KYC Pending</Badge>;
}

function getLpTypeLabel(type: string) {
  return LP_TYPES.find(t => t.value === type)?.label || type;
}

export default function InstitutionalDashboard() {
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);
  const [addLpOpen, setAddLpOpen] = useState(false);
  const [lpForm, setLpForm] = useState<LpForm>(defaultLpForm);
  const { toast } = useToast();

  const { data: myFirm, isLoading: loadingFirm } = useQuery<any>({
    queryKey: ["/api/institutional/my-firm"],
  });

  const firmId = selectedFirmId || myFirm?.firm?.id || myFirm?.team?.id;

  const { data: firmAnalytics, isLoading: loadingAnalytics } = useQuery<any>({
    queryKey: ["/api/institutional/firms", firmId, "analytics"],
    enabled: !!firmId,
  });

  const { data: funds } = useQuery<any>({
    queryKey: ["/api/institutional/firms", firmId, "funds"],
    enabled: !!firmId,
  });

  const { data: lps = [], isLoading: loadingLps } = useQuery<LpEntity[]>({
    queryKey: ["/api/institutional/firms", firmId, "lps"],
    enabled: !!firmId,
  });

  const createLpMutation = useMutation({
    mutationFn: async (data: LpForm) => {
      const res = await apiRequest("POST", `/api/institutional/firms/${firmId}/lps`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/firms", firmId, "lps"] });
      setAddLpOpen(false);
      setLpForm(defaultLpForm);
      toast({ title: "LP added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add LP", variant: "destructive" });
    },
  });

  const overview = firmAnalytics?.overview || {
    totalFunds: 0,
    totalAum: 0,
    totalInvested: 0,
    totalValue: 0,
    portfolioCompanies: 0,
    activeInvestments: 0,
    tvpi: 0
  };

  const sectorData = Object.entries(firmAnalytics?.allocations?.bySector || {}).map(([name, value]) => ({
    name,
    value: value as number
  }));

  const fundSummaries = firmAnalytics?.funds || [];

  const recentInvestments = firmAnalytics?.recentInvestments || [];

  if (loadingFirm) {
    return (
      <AppLayout 
        title="Institutional Dashboard" 
        subtitle="Loading your firm profile..."
        videoUrl={videoBackgrounds.dashboard}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-white/60">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!firmId) {
    return (
      <AppLayout 
        title="Institutional Dashboard" 
        subtitle="Firm-level portfolio management and analytics"
        videoUrl={videoBackgrounds.dashboard}
      >
        <div className="max-w-3xl mx-auto py-12 px-6">
          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardHeader>
              <CardTitle className="text-white">No Firm Association Found</CardTitle>
              <CardDescription className="text-white/60">
                You need to be associated with an investment firm to access the institutional dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-white/80">
                To get started, you can:
              </p>
              <ul className="list-disc list-inside space-y-2 text-white/70">
                <li>Create a new investment firm team</li>
                <li>Request an invitation from an existing firm</li>
                <li>Contact your administrator for access</li>
              </ul>
              <div className="flex gap-3 pt-4">
                <Link href="/app/teams">
                  <Button className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-create-team">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Investment Firm
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="Institutional Dashboard" 
      subtitle="Firm-level portfolio management and analytics"
      videoUrl={videoBackgrounds.dashboard}
    >
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-white/70">Total AUM</CardTitle>
              <DollarSign className="w-4 h-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white" data-testid="text-total-aum">
                {formatCurrency(overview.totalAum)}
              </div>
              <p className="text-xs text-white/50 mt-1">
                Across {overview.totalFunds} funds
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-white/70">Total Value</CardTitle>
              <TrendingUp className="w-4 h-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white" data-testid="text-total-value">
                {formatCurrency(overview.totalValue)}
              </div>
              <div className="flex items-center gap-1 text-xs mt-1">
                {overview.tvpi >= 1 ? (
                  <>
                    <ArrowUpRight className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">{overview.tvpi.toFixed(2)}x TVPI</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-3 h-3 text-red-400" />
                    <span className="text-red-400">{overview.tvpi.toFixed(2)}x TVPI</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-white/70">Portfolio Companies</CardTitle>
              <Building2 className="w-4 h-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white" data-testid="text-portfolio-count">
                {overview.portfolioCompanies}
              </div>
              <p className="text-xs text-white/50 mt-1">
                {overview.activeInvestments} active investments
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-white/70">Capital Deployed</CardTitle>
              <Briefcase className="w-4 h-4 text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white" data-testid="text-capital-deployed">
                {formatCurrency(overview.totalInvested)}
              </div>
              <Progress 
                value={overview.totalAum > 0 ? (overview.totalInvested / overview.totalAum) * 100 : 0} 
                className="h-2 mt-2 bg-white/10"
              />
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-[rgb(30,30,30)] border border-white/10">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500/20" data-testid="tab-overview">
              Overview
            </TabsTrigger>
            <TabsTrigger value="funds" className="data-[state=active]:bg-purple-500/20" data-testid="tab-funds">
              Funds
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="data-[state=active]:bg-purple-500/20" data-testid="tab-portfolio">
              Portfolio
            </TabsTrigger>
            <TabsTrigger value="lps" className="data-[state=active]:bg-purple-500/20" data-testid="tab-lps">
              LPs
              {lps.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-purple-500/30 text-purple-300 text-xs">
                  {lps.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-purple-400" />
                    Sector Allocation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sectorData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPieChart>
                        <Pie
                          data={sectorData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {sectorData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgb(30,30,30)', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-white/50">
                      No sector data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    Fund Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fundSummaries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={fundSummaries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                        <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                        <RechartsTooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgb(30,30,30)', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="tvpi" fill="#8b5cf6" name="TVPI" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-white/50">
                      No fund data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-[rgb(30,30,30)] border-white/10">
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-white">Recent Investments</CardTitle>
                  <CardDescription className="text-white/60">Latest portfolio activity</CardDescription>
                </div>
                <Link href="/app/fund-management">
                  <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="button-view-all-investments">
                    View All
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {recentInvestments.length > 0 ? (
                  <div className="space-y-4">
                    {recentInvestments.slice(0, 5).map((investment: any) => (
                      <div key={investment.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{investment.companyName}</p>
                            <p className="text-sm text-white/60">{investment.roundType || 'Investment'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-white">{formatCurrency(investment.investedAmount)}</p>
                          <p className="text-sm text-white/60">
                            {new Date(investment.investmentDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/50">
                    No recent investments
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="funds" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Your Funds</h3>
                <p className="text-white/60">Manage your investment funds</p>
              </div>
              <Link href="/app/fund-management">
                <Button className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-create-fund">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Fund
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fundSummaries.length > 0 ? (
                fundSummaries.map((fund: any) => (
                  <Card key={fund.id} className="bg-[rgb(30,30,30)] border-white/10 hover-elevate cursor-pointer">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-white text-lg">{fund.name}</CardTitle>
                        <Badge variant={fund.status === 'active' ? 'default' : 'secondary'}>
                          {fund.status}
                        </Badge>
                      </div>
                      <CardDescription className="text-white/60">
                        Vintage {fund.vintage || 'N/A'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-white/50">Invested</p>
                          <p className="font-semibold text-white">{formatCurrency(fund.invested)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-white/50">Current Value</p>
                          <p className="font-semibold text-white">{formatCurrency(fund.currentValue)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/60">{fund.portfolioCount} companies</span>
                        <span className={`text-sm font-medium ${fund.tvpi >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                          {fund.tvpi.toFixed(2)}x TVPI
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="bg-[rgb(30,30,30)] border-white/10 col-span-full">
                  <CardContent className="py-12 text-center">
                    <Briefcase className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60">No funds created yet</p>
                    <p className="text-sm text-white/40 mt-2">Create your first fund to start tracking investments</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="portfolio" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Portfolio Companies</h3>
                <p className="text-white/60">All investments across your funds</p>
              </div>
              <Link href="/app/fund-management">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" data-testid="button-add-investment">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Investment
                </Button>
              </Link>
            </div>

            <Card className="bg-[rgb(30,30,30)] border-white/10">
              <CardContent className="p-0">
                {recentInvestments.length > 0 ? (
                  <div className="divide-y divide-white/10">
                    {recentInvestments.map((investment: any) => (
                      <div key={investment.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{investment.companyName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {investment.roundType || 'Investment'}
                              </Badge>
                              {investment.sector && (
                                <Badge variant="secondary" className="text-xs">
                                  {investment.sector}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-white">{formatCurrency(investment.investedAmount)}</p>
                          <p className="text-sm text-white/60">
                            {investment.multipleOnInvestment ? `${investment.multipleOnInvestment.toFixed(2)}x` : '--'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Building2 className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60">No portfolio companies yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lps" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Limited Partners</h3>
                <p className="text-white/60">Manage your LP relationships and reporting</p>
              </div>
              <div className="flex gap-2">
                <Link href="/app/lp-reporting">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" data-testid="button-generate-report">
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Report
                  </Button>
                </Link>
                <Button
                  onClick={() => setAddLpOpen(true)}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black"
                  data-testid="button-add-lp"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add LP
                </Button>
              </div>
            </div>

            {loadingLps ? (
              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardContent className="py-12 text-center text-white/60">Loading LPs...</CardContent>
              </Card>
            ) : lps.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{lps.length}</p>
                        <p className="text-xs text-white/50">Total LPs</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{lps.filter(l => l.kycStatus === "approved").length}</p>
                        <p className="text-xs text-white/50">KYC Approved</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{lps.filter(l => l.accreditedInvestor).length}</p>
                        <p className="text-xs text-white/50">Accredited</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-[rgb(30,30,30)] border-white/10">
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/10">
                      {lps.map((lp) => (
                        <div key={lp.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors" data-testid={`row-lp-${lp.id}`}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-white/10 flex items-center justify-center">
                              <Users className="w-5 h-5 text-white/70" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{lp.name}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs text-white/50">{getLpTypeLabel(lp.type)}</span>
                                {lp.country && <span className="text-xs text-white/40">· {lp.country}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden md:flex flex-col items-end gap-1">
                              {lp.contactEmail && (
                                <div className="flex items-center gap-1 text-xs text-white/50">
                                  <Mail className="w-3 h-3" />
                                  {lp.contactEmail}
                                </div>
                              )}
                              {lp.contactPhone && (
                                <div className="flex items-center gap-1 text-xs text-white/40">
                                  <Phone className="w-3 h-3" />
                                  {lp.contactPhone}
                                </div>
                              )}
                            </div>
                            {getKycBadge(lp.kycStatus)}
                            <Badge variant={lp.status === "active" ? "default" : "secondary"} className="text-xs">
                              {lp.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardContent className="py-16 text-center">
                  <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/60 font-medium">No Limited Partners yet</p>
                  <p className="text-sm text-white/40 mt-2 mb-6">Track commitments, capital calls, and distributions</p>
                  <Button
                    onClick={() => setAddLpOpen(true)}
                    className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black"
                    data-testid="button-add-lp-empty"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First LP
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/app/fund-management">
            <Card className="bg-[rgb(30,30,30)] border-white/10 hover-elevate cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Fund Management</p>
                  <p className="text-sm text-white/60">Create and manage funds</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/app/portfolio-analytics">
            <Card className="bg-[rgb(30,30,30)] border-white/10 hover-elevate cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Analytics</p>
                  <p className="text-sm text-white/60">Deep portfolio insights</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/app/lp-reporting">
            <Card className="bg-[rgb(30,30,30)] border-white/10 hover-elevate cursor-pointer">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-white">LP Reporting</p>
                  <p className="text-sm text-white/60">Generate quarterly reports</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Add LP Dialog */}
      <Dialog open={addLpOpen} onOpenChange={setAddLpOpen}>
        <DialogContent className="bg-[rgb(30,30,30)] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Limited Partner</DialogTitle>
            <DialogDescription className="text-white/60">
              Record a new LP relationship for your firm
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/80">LP Name <span className="text-red-400">*</span></Label>
              <Input
                value={lpForm.name}
                onChange={e => setLpForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Acme Family Office"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                data-testid="input-lp-name"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Type <span className="text-red-400">*</span></Label>
              <Select value={lpForm.type} onValueChange={v => setLpForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white" data-testid="select-lp-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LP_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/80">Contact Name</Label>
                <Input
                  value={lpForm.contactName}
                  onChange={e => setLpForm(f => ({ ...f, contactName: e.target.value }))}
                  placeholder="Jane Smith"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-lp-contact-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">Country</Label>
                <Input
                  value={lpForm.country}
                  onChange={e => setLpForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="United States"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-lp-country"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Contact Email</Label>
              <Input
                value={lpForm.contactEmail}
                onChange={e => setLpForm(f => ({ ...f, contactEmail: e.target.value }))}
                type="email"
                placeholder="jane@family-office.com"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                data-testid="input-lp-email"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Contact Phone</Label>
              <Input
                value={lpForm.contactPhone}
                onChange={e => setLpForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+1 555-000-0000"
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                data-testid="input-lp-phone"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">Status</Label>
              <Select value={lpForm.status} onValueChange={v => setLpForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white" data-testid="select-lp-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddLpOpen(false); setLpForm(defaultLpForm); }}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createLpMutation.mutate(lpForm)}
              disabled={!lpForm.name || !lpForm.type || createLpMutation.isPending}
              className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black"
              data-testid="button-submit-lp"
            >
              {createLpMutation.isPending ? "Adding..." : "Add LP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
