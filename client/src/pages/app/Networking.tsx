import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  Users, 
  Sparkles, 
  Send, 
  Building2, 
  Target, 
  Calendar, 
  Network,
  Mail,
  ChevronRight
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { Startup, Match, InvestmentFirm, Contact, Outreach, Investor } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

function StatCard({ icon: Icon, label, value, color, delay = 0 }: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="p-6 rounded-2xl border border-white/10 bg-white/5"
    >
      <div className="flex items-center gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-light text-white">{value}</p>
          <p className="text-sm text-white/50">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

function AnkerTabsTrigger({ value, children, icon: Icon }: { value: string; children: React.ReactNode; icon: React.ElementType }) {
  return (
    <TabsTrigger
      value={value}
      className="relative h-12 px-6 rounded-full flex items-center gap-2 text-white/60 
        data-[state=active]:text-white data-[state=active]:bg-gradient-to-r 
        data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)]
        hover:text-white/80 transition-all duration-300"
    >
      <Icon className="h-4 w-4" />
      <span className="font-light">{children}</span>
    </TabsTrigger>
  );
}

function MatchCard({ match, firm, investor, onSelect }: { 
  match: Match; 
  firm?: InvestmentFirm; 
  investor?: Investor;
  onSelect: () => void;
}) {
  const investorName = investor 
    ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
    : null;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
      className="group relative p-5 rounded-2xl border border-white/10 bg-white/5 hover:border-[rgb(142,132,247)]/50 transition-colors"
      data-testid={`card-suggestion-${match.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-white">{firm?.name || "Unknown Firm"}</p>
            {investorName && (
              <p className="text-sm text-white/50">{investorName}</p>
            )}
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          (match.matchScore || 0) >= 80 
            ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
            : "bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]"
        }`}>
          {match.matchScore}%
        </div>
      </div>
      
      {match.matchReasons && match.matchReasons.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {match.matchReasons.slice(0, 2).map((reason, i) => (
            <span key={i} className="px-3 py-1 text-xs rounded-full bg-white/5 text-white/70 border border-white/10">
              {reason}
            </span>
          ))}
        </div>
      )}
      
      <button 
        onClick={onSelect}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all duration-300"
        data-testid={`button-request-intro-${match.id}`}
      >
        <Mail className="w-4 h-4" />
        <span className="text-sm font-light">Request Introduction</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function EmptyState({ icon: Icon, title, description, action, actionLabel }: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-16"
    >
      <div 
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
      >
        <Icon className="w-10 h-10 text-[rgb(142,132,247)]" />
      </div>
      <h3 className="text-xl font-light text-white mb-2">{title}</h3>
      <p className="text-white/50 text-sm mb-6 text-center max-w-md">{description}</p>
      {action && actionLabel && (
        <button
          onClick={action}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

export default function NetworkingPage() {
  const { user } = useAuth();
  const [introMessage, setIntroMessage] = useState("");
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);

  const { data: startups = [], isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const { data: firmsResponse, isLoading: firmsLoading } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms"],
  });
  const firms = firmsResponse?.data ?? [];

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: outreaches = [], isLoading: outreachesLoading } = useQuery<Outreach[]>({
    queryKey: ["/api/outreaches"],
  });

  const { data: investorsResponse, isLoading: investorsLoading } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
  });
  const investors = investorsResponse?.data ?? [];

  const pageLoading = startupsLoading || matchesLoading || firmsLoading || contactsLoading || outreachesLoading || investorsLoading;

  const stats = useMemo(() => {
    const startupsCount = startups?.length ?? 0;
    const matchesCount = matches?.length ?? 0;
    const outreachesCount = outreaches?.length ?? 0;
    const activeThreads = outreaches.filter((o) =>
      ["draft", "pitch_sent", "opened", "replied", "call_scheduled"].includes(String(o.stage))
    ).length;

    return { startupsCount, matchesCount, outreachesCount, activeThreads };
  }, [startups, matches, outreaches]);

  const topMatches = useMemo(() => {
    return matches
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 6);
  }, [matches]);

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const investorsMap = useMemo(
    () => investors.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, Investor>),
    [investors]
  );

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Networking Workspace"
      subtitle="AI-powered suggestions, warm introductions, and intelligent networking tools"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.networking}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <StatCard icon={Building2} label="Startups" value={stats.startupsCount} color="rgb(142,132,247)" delay={0.1} />
            <StatCard icon={Sparkles} label="Matches" value={stats.matchesCount} color="rgb(251,194,213)" delay={0.2} />
            <StatCard icon={Send} label="Outreaches" value={stats.outreachesCount} color="rgb(196,227,230)" delay={0.3} />
            <StatCard icon={Users} label="Active Threads" value={stats.activeThreads} color="rgb(254,212,92)" delay={0.4} />
          </div>

          {/* Main Tabs Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Tabs defaultValue="suggestions" className="w-full">
              <TabsList className="w-full flex flex-wrap gap-2 p-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
                <AnkerTabsTrigger value="suggestions" icon={Sparkles}>Suggestions</AnkerTabsTrigger>
                <AnkerTabsTrigger value="introductions" icon={Send}>Introductions</AnkerTabsTrigger>
                <AnkerTabsTrigger value="similar" icon={Building2}>Similar</AnkerTabsTrigger>
                <AnkerTabsTrigger value="meetings" icon={Calendar}>Meetings</AnkerTabsTrigger>
              </TabsList>

              <TabsContent value="suggestions" className="m-0">
                <div className="mb-6 flex items-center gap-3">
                  <div className="px-4 py-2 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white text-xs font-medium">
                    AI Powered
                  </div>
                  <span className="text-white font-light">Top Investor Matches</span>
                </div>
                
                {topMatches.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    <EmptyState
                      icon={Target}
                      title="No matches yet"
                      description="Generate investor matches from the Matches page to see personalized suggestions here"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {topMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        firm={firmsMap[match.firmId || ""]}
                        investor={investorsMap[match.investorId || ""]}
                        onSelect={() => setSelectedInvestor(investorsMap[match.investorId || ""])}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="introductions" className="m-0">
                <div className="mb-6 flex items-center gap-3">
                  <div className="px-4 py-2 rounded-full border border-white/20 bg-white/5 text-white text-xs font-medium">
                    Composer
                  </div>
                  <span className="text-white font-light">Warm Introduction Request</span>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-light text-white/70 mb-3 block">
                        Target Investor
                      </label>
                      <Input
                        placeholder="Search for an investor..."
                        className="h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                        data-testid="input-target-investor"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-light text-white/70 mb-3 block">
                        Introduction Message
                      </label>
                      <Textarea
                        placeholder="Write a brief introduction about why you'd like to connect..."
                        value={introMessage}
                        onChange={(e) => setIntroMessage(e.target.value)}
                        className="min-h-[140px] rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]"
                        data-testid="input-intro-message"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button 
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/20 bg-white/5 text-white font-light hover:bg-white/10 transition-colors"
                        data-testid="button-ai-generate"
                      >
                        <Sparkles className="w-4 h-4" />
                        AI Generate
                      </button>
                      <button 
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium hover:opacity-90 transition-opacity"
                        data-testid="button-send-request"
                      >
                        <Send className="w-4 h-4" />
                        Send Request
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="similar" className="m-0">
                <div className="mb-6 flex items-center gap-3">
                  <div className="px-4 py-2 rounded-full border border-white/20 bg-white/5 text-white text-xs font-medium">
                    Discovery
                  </div>
                  <span className="text-white font-light">Similar Company Investors</span>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <EmptyState
                    icon={Network}
                    title="Find Similar Investors"
                    description="Discover investors who have funded companies similar to yours"
                    actionLabel="Analyze Similar Companies"
                  />
                </div>
              </TabsContent>

              <TabsContent value="meetings" className="m-0">
                <div className="mb-6 flex items-center gap-3">
                  <div className="px-4 py-2 rounded-full border border-white/20 bg-white/5 text-white text-xs font-medium">
                    Calendar
                  </div>
                  <span className="text-white font-light">Upcoming Meetings</span>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <EmptyState
                    icon={Calendar}
                    title="No upcoming meetings"
                    description="Schedule meetings with investors through your outreach campaigns"
                    actionLabel="Schedule Meeting"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
