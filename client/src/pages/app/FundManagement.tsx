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
  Plus, 
  Building2, 
  TrendingUp, 
  DollarSign,
  Calendar,
  Edit,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const fundFormSchema = z.object({
  name: z.string().min(1, "Fund name is required"),
  description: z.string().optional(),
  fundType: z.string().default("venture"),
  status: z.string().default("fundraising"),
  vintage: z.coerce.number().optional(),
  targetSize: z.coerce.number().optional(),
  managementFee: z.coerce.number().optional(),
  carriedInterest: z.coerce.number().optional(),
  investmentPeriod: z.coerce.number().optional(),
  fundLife: z.coerce.number().optional(),
});

const investmentFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  investmentDate: z.string().min(1, "Investment date is required"),
  investedAmount: z.coerce.number().min(1, "Investment amount is required"),
  roundType: z.string().optional(),
  ownershipPercentage: z.coerce.number().optional(),
  preMoneyValuation: z.coerce.number().optional(),
  postMoneyValuation: z.coerce.number().optional(),
  currentValuation: z.coerce.number().optional(),
  sector: z.string().optional(),
  notes: z.string().optional(),
});

type FundFormValues = z.infer<typeof fundFormSchema>;
type InvestmentFormValues = z.infer<typeof investmentFormSchema>;

function formatCurrency(amount: number): string {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

export default function FundManagement() {
  const [createFundOpen, setCreateFundOpen] = useState(false);
  const [createInvestmentOpen, setCreateInvestmentOpen] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: myFirm } = useQuery<any>({
    queryKey: ["/api/institutional/my-firm"],
  });

  const firmId = myFirm?.firm?.id || myFirm?.team?.id;

  const { data: funds, isLoading: loadingFunds } = useQuery<any>({
    queryKey: ["/api/institutional/firms", firmId, "funds"],
    enabled: !!firmId,
  });

  const { data: investments, isLoading: loadingInvestments } = useQuery<any>({
    queryKey: ["/api/institutional/funds", selectedFundId, "investments"],
    enabled: !!selectedFundId,
  });

  const fundForm = useForm<FundFormValues>({
    resolver: zodResolver(fundFormSchema),
    defaultValues: {
      name: "",
      description: "",
      fundType: "venture",
      status: "fundraising",
      vintage: new Date().getFullYear(),
      managementFee: 2,
      carriedInterest: 20,
      investmentPeriod: 5,
      fundLife: 10,
    },
  });

  const investmentForm = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentFormSchema),
    defaultValues: {
      companyName: "",
      investmentDate: new Date().toISOString().split('T')[0],
      investedAmount: 0,
      roundType: "seed",
    },
  });

  const createFundMutation = useMutation({
    mutationFn: async (data: FundFormValues) => {
      const response = await apiRequest("POST", `/api/institutional/firms/${firmId}/funds`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/firms", firmId, "funds"] });
      setCreateFundOpen(false);
      fundForm.reset();
      toast({ title: "Fund created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create fund", variant: "destructive" });
    },
  });

  const createInvestmentMutation = useMutation({
    mutationFn: async (data: InvestmentFormValues) => {
      const payload = {
        ...data,
        investmentDate: new Date(data.investmentDate).toISOString(),
      };
      const response = await apiRequest("POST", `/api/institutional/funds/${selectedFundId}/investments`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/funds", selectedFundId, "investments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/firms", firmId, "analytics"] });
      setCreateInvestmentOpen(false);
      investmentForm.reset();
      toast({ title: "Investment recorded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to record investment", variant: "destructive" });
    },
  });

  const deleteFundMutation = useMutation({
    mutationFn: async (fundId: string) => {
      await apiRequest("DELETE", `/api/institutional/funds/${fundId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/firms", firmId, "funds"] });
      toast({ title: "Fund deleted successfully" });
    },
  });

  const deleteInvestmentMutation = useMutation({
    mutationFn: async (investmentId: string) => {
      await apiRequest("DELETE", `/api/institutional/investments/${investmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/institutional/funds", selectedFundId, "investments"] });
      toast({ title: "Investment deleted successfully" });
    },
  });

  if (!firmId) {
    return (
      <AppLayout 
        title="Fund Management" 
        subtitle="Create and manage investment funds"
        videoUrl={videoBackgrounds.deals}
      >
        <div className="max-w-3xl mx-auto py-12 px-6">
          <Card className="bg-[rgb(30,30,30)] border-white/10">
            <CardContent className="py-12 text-center">
              <Briefcase className="w-12 h-12 text-white/30 mx-auto mb-4" />
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
      title="Fund Management" 
      subtitle="Create and manage investment funds"
      videoUrl={videoBackgrounds.deals}
    >
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Your Funds</h2>
            <p className="text-white/60">Manage your investment vehicles and portfolio</p>
          </div>
          <Dialog open={createFundOpen} onOpenChange={setCreateFundOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-create-fund">
                <Plus className="w-4 h-4 mr-2" />
                Create Fund
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[rgb(30,30,30)] border-white/10 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Fund</DialogTitle>
                <DialogDescription className="text-white/60">
                  Set up a new investment fund to track your portfolio
                </DialogDescription>
              </DialogHeader>
              <Form {...fundForm}>
                <form onSubmit={fundForm.handleSubmit((data) => createFundMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={fundForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fund Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Fund I" className="bg-white/5 border-white/20" data-testid="input-fund-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={fundForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Fund investment thesis and focus..." className="bg-white/5 border-white/20" data-testid="input-fund-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={fundForm.control}
                      name="fundType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fund Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-fund-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="venture">Venture Capital</SelectItem>
                              <SelectItem value="growth">Growth Equity</SelectItem>
                              <SelectItem value="seed">Seed Fund</SelectItem>
                              <SelectItem value="opportunity">Opportunity Fund</SelectItem>
                              <SelectItem value="buyout">Buyout</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={fundForm.control}
                      name="vintage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vintage Year</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" className="bg-white/5 border-white/20" data-testid="input-vintage" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={fundForm.control}
                    name="targetSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Fund Size ($)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" placeholder="50000000" className="bg-white/5 border-white/20" data-testid="input-target-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={fundForm.control}
                      name="managementFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Management Fee (%)</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" step="0.1" className="bg-white/5 border-white/20" data-testid="input-mgmt-fee" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={fundForm.control}
                      name="carriedInterest"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Carried Interest (%)</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" step="0.1" className="bg-white/5 border-white/20" data-testid="input-carry" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreateFundOpen(false)} className="border-white/20">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createFundMutation.isPending} className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-submit-fund">
                      {createFundMutation.isPending ? "Creating..." : "Create Fund"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingFunds ? (
            <div className="col-span-full text-center py-12 text-white/60">Loading funds...</div>
          ) : (funds as any[])?.length > 0 ? (
            (funds as any[]).map((fund: any) => (
              <Card 
                key={fund.id} 
                className={`bg-[rgb(30,30,30)] border-white/10 cursor-pointer transition-all ${selectedFundId === fund.id ? 'ring-2 ring-purple-500' : 'hover-elevate'}`}
                onClick={() => setSelectedFundId(fund.id)}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-white">{fund.name}</CardTitle>
                    <CardDescription className="text-white/60">
                      {fund.fundType} • Vintage {fund.vintage || 'N/A'}
                    </CardDescription>
                  </div>
                  <Badge variant={fund.status === 'active' ? 'default' : 'secondary'}>
                    {fund.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-white/50">Target Size</p>
                      <p className="font-semibold text-white">{fund.targetSize ? formatCurrency(fund.targetSize) : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-white/50">Committed</p>
                      <p className="font-semibold text-white">{fund.committedCapital ? formatCurrency(fund.committedCapital) : '$0'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-white/60 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this fund?")) deleteFundMutation.mutate(fund.id);
                      }}
                      data-testid={`button-delete-fund-${fund.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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

        {selectedFundId && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Portfolio Investments</h3>
                <p className="text-white/60">Investments in {(funds as any[])?.find((f: any) => f.id === selectedFundId)?.name}</p>
              </div>
              <Dialog open={createInvestmentOpen} onOpenChange={setCreateInvestmentOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-add-investment">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Investment
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[rgb(30,30,30)] border-white/10 text-white max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Record Investment</DialogTitle>
                    <DialogDescription className="text-white/60">
                      Add a new portfolio company investment
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...investmentForm}>
                    <form onSubmit={investmentForm.handleSubmit((data) => createInvestmentMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={investmentForm.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Acme Inc" className="bg-white/5 border-white/20" data-testid="input-company-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={investmentForm.control}
                          name="investmentDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Investment Date</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" className="bg-white/5 border-white/20" data-testid="input-investment-date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={investmentForm.control}
                          name="roundType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Round Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-round-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                                  <SelectItem value="seed">Seed</SelectItem>
                                  <SelectItem value="series_a">Series A</SelectItem>
                                  <SelectItem value="series_b">Series B</SelectItem>
                                  <SelectItem value="series_c">Series C+</SelectItem>
                                  <SelectItem value="bridge">Bridge</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={investmentForm.control}
                        name="investedAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Investment Amount ($)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" placeholder="1000000" className="bg-white/5 border-white/20" data-testid="input-investment-amount" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={investmentForm.control}
                          name="preMoneyValuation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pre-Money Valuation ($)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" className="bg-white/5 border-white/20" data-testid="input-pre-money" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={investmentForm.control}
                          name="ownershipPercentage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ownership (%)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.1" className="bg-white/5 border-white/20" data-testid="input-ownership" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={investmentForm.control}
                        name="sector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sector</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-sector">
                                  <SelectValue placeholder="Select sector" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="saas">SaaS</SelectItem>
                                <SelectItem value="fintech">Fintech</SelectItem>
                                <SelectItem value="healthtech">Healthtech</SelectItem>
                                <SelectItem value="ai_ml">AI/ML</SelectItem>
                                <SelectItem value="ecommerce">E-commerce</SelectItem>
                                <SelectItem value="marketplace">Marketplace</SelectItem>
                                <SelectItem value="deeptech">Deep Tech</SelectItem>
                                <SelectItem value="consumer">Consumer</SelectItem>
                                <SelectItem value="enterprise">Enterprise</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={investmentForm.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Investment notes..." className="bg-white/5 border-white/20" data-testid="input-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCreateInvestmentOpen(false)} className="border-white/20">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createInvestmentMutation.isPending} className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black" data-testid="button-submit-investment">
                          {createInvestmentMutation.isPending ? "Recording..." : "Record Investment"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="bg-[rgb(30,30,30)] border-white/10">
              <CardContent className="p-0">
                {loadingInvestments ? (
                  <div className="py-12 text-center text-white/60">Loading investments...</div>
                ) : (investments as any[])?.length > 0 ? (
                  <div className="divide-y divide-white/10">
                    {(investments as any[]).map((investment: any) => (
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
                              <span className="text-xs text-white/50">
                                {new Date(investment.investmentDate).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-medium text-white">{formatCurrency(investment.investedAmount)}</p>
                            <p className="text-sm text-white/60">
                              {investment.ownershipPercentage ? `${investment.ownershipPercentage}%` : '--'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-white">
                              {investment.currentValuation ? formatCurrency(investment.currentValuation) : '--'}
                            </p>
                            <p className={`text-sm ${investment.multipleOnInvestment >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                              {investment.multipleOnInvestment ? `${investment.multipleOnInvestment.toFixed(2)}x` : '--'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Delete this investment?")) deleteInvestmentMutation.mutate(investment.id);
                            }}
                            data-testid={`button-delete-investment-${investment.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-white/60" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Building2 className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60">No investments in this fund yet</p>
                    <p className="text-sm text-white/40 mt-2">Add your first portfolio company</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
