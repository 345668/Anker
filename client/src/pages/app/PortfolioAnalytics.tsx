import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  DollarSign, 
  Building2, 
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Layers,
  Globe
} from "lucide-react";
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
  Legend,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";

const COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];

function formatCurrency(amount: number): string {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

export default function PortfolioAnalytics() {
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);

  const { data: myFirm } = useQuery<any>({
    queryKey: ["/api/institutional/my-firm"],
  });

  const firmId = myFirm?.firm?.id || myFirm?.team?.id;

  const { data: firmAnalytics, isLoading: loadingFirmAnalytics } = useQuery<any>({
    queryKey: ["/api/institutional/firms", firmId, "analytics"],
    enabled: !!firmId,
  });

  const { data: funds } = useQuery<any>({
    queryKey: ["/api/institutional/firms", firmId, "funds"],
    enabled: !!firmId,
  });

  const { data: fundAnalytics, isLoading: loadingFundAnalytics } = useQuery<any>({
    queryKey: ["/api/institutional/funds", selectedFundId, "analytics"],
    enabled: !!selectedFundId,
  });

  const analytics = selectedFundId ? fundAnalytics : firmAnalytics;
  const isLoading = selectedFundId ? loadingFundAnalytics : loadingFirmAnalytics;

  const sectorData = Object.entries(analytics?.allocations?.bySector || {}).map(([name, value]) => ({
    name,
    value: value as number
  }));

  const roundData = Object.entries(analytics?.allocations?.byRound || {}).map(([name, value]) => ({
    name: name.replace('_', ' ').toUpperCase(),
    value: value as number
  }));

  const topPerformers = analytics?.topPerformers || [];

  const fundSummaries = firmAnalytics?.funds || [];

  if (!firmId) {
    return (
      <AppLayout 
        title="Portfolio Analytics" 
        subtitle="Deep insights into your portfolio performance"
        videoUrl={videoBackgrounds.dashboard}
      >
        <div className="max-w-3xl mx-auto py-12 px-6">
          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 text-white/30 mx-auto mb-4" />
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
      title="Portfolio Analytics" 
      subtitle="Deep insights into your portfolio performance"
      videoUrl={videoBackgrounds.dashboard}
    >
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Analytics Dashboard</h2>
            <p className="text-white/60">Comprehensive portfolio insights and performance metrics</p>
          </div>
          <Select 
            value={selectedFundId || "all"} 
            onValueChange={(v) => setSelectedFundId(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-[200px] bg-white/5 border-white/20 text-white" data-testid="select-fund-filter">
              <SelectValue placeholder="All Funds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Funds</SelectItem>
              {(funds as any[])?.map((fund: any) => (
                <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-white/60">Loading analytics...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-white/70">Total Value</CardTitle>
                  <DollarSign className="w-4 h-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white" data-testid="text-analytics-total-value">
                    {formatCurrency(analytics?.portfolio?.totalValue || analytics?.overview?.totalValue || 0)}
                  </div>
                  <div className="flex items-center gap-1 text-xs mt-1 text-green-400">
                    <ArrowUpRight className="w-3 h-3" />
                    <span>{((analytics?.performance?.tvpi || analytics?.overview?.tvpi || 0) * 100 - 100).toFixed(1)}% return</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-white/70">TVPI</CardTitle>
                  <TrendingUp className="w-4 h-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white" data-testid="text-analytics-tvpi">
                    {(analytics?.performance?.tvpi || analytics?.overview?.tvpi || 0).toFixed(2)}x
                  </div>
                  <p className="text-xs text-white/50 mt-1">Total Value to Paid-In</p>
                </CardContent>
              </Card>

              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-white/70">DPI</CardTitle>
                  <Target className="w-4 h-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white" data-testid="text-analytics-dpi">
                    {(analytics?.performance?.dpi || 0).toFixed(2)}x
                  </div>
                  <p className="text-xs text-white/50 mt-1">Distributions to Paid-In</p>
                </CardContent>
              </Card>

              <Card className="bg-[rgb(30,30,30)] border-white/10">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-medium text-white/70">Portfolio</CardTitle>
                  <Building2 className="w-4 h-4 text-orange-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white" data-testid="text-analytics-portfolio">
                    {analytics?.portfolio?.portfolioCount || analytics?.overview?.portfolioCompanies || 0}
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    {analytics?.portfolio?.activeCount || analytics?.overview?.activeInvestments || 0} active
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="allocation" className="space-y-6">
              <TabsList className="bg-[rgb(30,30,30)] border border-white/10">
                <TabsTrigger value="allocation" className="data-[state=active]:bg-purple-500/20" data-testid="tab-allocation">
                  Allocation
                </TabsTrigger>
                <TabsTrigger value="performance" className="data-[state=active]:bg-purple-500/20" data-testid="tab-performance">
                  Performance
                </TabsTrigger>
                <TabsTrigger value="funds" className="data-[state=active]:bg-purple-500/20" data-testid="tab-funds-compare">
                  Fund Comparison
                </TabsTrigger>
              </TabsList>

              <TabsContent value="allocation" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-purple-400" />
                        Sector Allocation
                      </CardTitle>
                      <CardDescription className="text-white/60">Investment distribution by sector</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {sectorData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <RechartsPieChart>
                            <Pie
                              data={sectorData}
                              cx="50%"
                              cy="50%"
                              innerRadius={80}
                              outerRadius={110}
                              paddingAngle={2}
                              dataKey="value"
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
                            <Legend 
                              formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</span>}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-white/50">
                          No sector data available
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Layers className="w-5 h-5 text-blue-400" />
                        Stage Allocation
                      </CardTitle>
                      <CardDescription className="text-white/60">Investment distribution by round</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {roundData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={roundData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
                            <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} width={80} />
                            <RechartsTooltip 
                              contentStyle={{ 
                                backgroundColor: 'rgb(30,30,30)', 
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px'
                              }}
                              formatter={(value: number) => formatCurrency(value)}
                            />
                            <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-white/50">
                          No stage data available
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-6">
                <Card className="bg-[rgb(30,30,30)] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                      Top Performers
                    </CardTitle>
                    <CardDescription className="text-white/60">Best performing portfolio companies by MOIC</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topPerformers.length > 0 ? (
                      <div className="space-y-4">
                        {topPerformers.map((company: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                            <div className="flex items-center gap-4">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                                index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-600' : 'bg-white/20'
                              }`}>
                                {index + 1}
                              </div>
                              <div>
                                <p className="font-medium text-white">{company.name}</p>
                                <p className="text-sm text-white/60">
                                  Invested: {formatCurrency(company.invested)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-green-400">{company.moic?.toFixed(2)}x</p>
                              <p className="text-sm text-white/60">
                                Value: {formatCurrency(company.value)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-white/50">
                        No performance data available yet
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">Average MOIC</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-white">
                        {(analytics?.performance?.averageMoic || 0).toFixed(2)}x
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">Exited Companies</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-white">
                        {analytics?.portfolio?.exitedCount || 0}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[rgb(30,30,30)] border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white/70">Write-offs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-white">
                        {analytics?.portfolio?.writtenOffCount || 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="funds" className="space-y-6">
                <Card className="bg-[rgb(30,30,30)] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                      Fund Performance Comparison
                    </CardTitle>
                    <CardDescription className="text-white/60">Compare TVPI across all funds</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {fundSummaries.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
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
                          <Legend 
                            formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</span>}
                          />
                          <Bar dataKey="tvpi" fill="#8b5cf6" name="TVPI" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[350px] flex items-center justify-center text-white/50">
                        No fund data available for comparison
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {fundSummaries.map((fund: any) => (
                    <Card key={fund.id} className="bg-[rgb(30,30,30)] border-white/10">
                      <CardHeader className="pb-2">
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
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-white/50">Invested</p>
                            <p className="font-semibold text-white">{formatCurrency(fund.invested)}</p>
                          </div>
                          <div>
                            <p className="text-white/50">Current Value</p>
                            <p className="font-semibold text-white">{formatCurrency(fund.currentValue)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                          <span className="text-sm text-white/60">{fund.portfolioCount} companies</span>
                          <span className={`text-lg font-bold ${fund.tvpi >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                            {fund.tvpi.toFixed(2)}x
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}
