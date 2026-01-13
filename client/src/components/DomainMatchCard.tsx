import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Mail,
  Star,
  AlertTriangle,
  Film,
  Home,
  Briefcase,
  MapPin,
  DollarSign,
  Activity,
  Target,
  TrendingUp,
  Users,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Match, InvestmentFirm, Investor, Startup } from "@shared/schema";

interface FactorBreakdown {
  label: string;
  weight: string;
  score: number;
  explanation: string;
  icon: typeof Building2;
  color: string;
}

interface DomainMatchCardProps {
  match: Match;
  firm: InvestmentFirm | undefined;
  investor: Investor | undefined;
  startup: Startup | undefined;
  onSave: (match: Match) => void;
  onPass: (match: Match) => void;
  onContact?: (match: Match) => void;
  index: number;
}

function detectDomain(startup: Startup | undefined): 'film' | 'real_estate' | 'general' {
  if (!startup) return 'general';
  
  const industries = (startup.industries as string[] || []).map(i => i.toLowerCase());
  const description = (startup.description || '').toLowerCase();
  const combined = industries.join(' ') + ' ' + description;

  const strongFilmKeywords = ['film', 'movie', 'cinema', 'slate financing', 'theatrical'];
  const filmKeywords = ['entertainment', 'production', 'studio', 'streaming', 'content', 'media', 'screenplay'];
  
  const strongREKeywords = ['real estate', 'multifamily', 'reit', 'property development'];
  const reKeywords = ['property', 'residential', 'commercial', 'industrial', 'construction', 'bridge loan', 'mezzanine'];

  const hasStrongFilm = strongFilmKeywords.some(k => combined.includes(k));
  const hasStrongRE = strongREKeywords.some(k => combined.includes(k));
  
  const filmScore = filmKeywords.filter(k => combined.includes(k)).length;
  const reScore = reKeywords.filter(k => combined.includes(k)).length;

  if (hasStrongFilm || filmScore >= 2) return 'film';
  if (hasStrongRE || reScore >= 2) return 'real_estate';
  return 'general';
}

function getFilmFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    {
      label: "Semantic Fit",
      weight: "35%",
      score: breakdown.semanticFit || breakdown.industry || 75,
      explanation: "Investor thesis alignment with your film financing needs",
      icon: Target,
      color: "rgb(142,132,247)",
    },
    {
      label: "Stage Compatibility",
      weight: "20%",
      score: breakdown.stageCompatibility || breakdown.stage || 85,
      explanation: "Development stage matches investor risk profile",
      icon: TrendingUp,
      color: "rgb(251,194,213)",
    },
    {
      label: "Deal Structure",
      weight: "15%",
      score: breakdown.economicFit || breakdown.checkSize || 80,
      explanation: "Revenue share, equity, or debt structure compatibility",
      icon: DollarSign,
      color: "rgb(196,227,230)",
    },
    {
      label: "Geography",
      weight: "10%",
      score: breakdown.geographicPracticality || breakdown.location || 90,
      explanation: "Distribution market coverage alignment",
      icon: MapPin,
      color: "rgb(254,212,92)",
    },
    {
      label: "Investor Type",
      weight: "5%",
      score: breakdown.investorTypeLogic || breakdown.investorType || 95,
      explanation: firm?.type ? `${firm.type} matches project expectations` : "Investor type fit",
      icon: Users,
      color: "rgb(142,132,247)",
    },
    {
      label: "Activity Score",
      weight: "5%",
      score: breakdown.investorBehavior || 85,
      explanation: "Recent film deal activity and engagement",
      icon: Activity,
      color: "rgb(251,194,213)",
    },
  ];
}

function getRealEstateFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    {
      label: "Property Type",
      weight: "30%",
      score: breakdown.semanticFit || breakdown.industry || 90,
      explanation: "Property type alignment with investor focus",
      icon: Home,
      color: "rgb(142,132,247)",
    },
    {
      label: "Stage / Deal Type",
      weight: "25%",
      score: breakdown.stageCompatibility || breakdown.stage || 85,
      explanation: "Development stage compatibility",
      icon: Briefcase,
      color: "rgb(251,194,213)",
    },
    {
      label: "Geography",
      weight: "20%",
      score: breakdown.geographicPracticality || breakdown.location || 95,
      explanation: "Market/region preference alignment",
      icon: MapPin,
      color: "rgb(196,227,230)",
    },
    {
      label: "Check Size",
      weight: "15%",
      score: breakdown.economicFit || breakdown.checkSize || 80,
      explanation: "Investment size within typical range",
      icon: DollarSign,
      color: "rgb(254,212,92)",
    },
    {
      label: "Investor Type",
      weight: "10%",
      score: breakdown.investorTypeLogic || breakdown.investorType || 100,
      explanation: firm?.type ? `${firm.type} focused investor` : "Investor type fit",
      icon: Users,
      color: "rgb(142,132,247)",
    },
  ];
}

function getGeneralFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    {
      label: "Industry Match",
      weight: "30%",
      score: breakdown.industry || breakdown.semanticFit || 80,
      explanation: "Sector alignment with investor focus",
      icon: Target,
      color: "rgb(142,132,247)",
    },
    {
      label: "Stage Match",
      weight: "25%",
      score: breakdown.stage || breakdown.stageCompatibility || 85,
      explanation: "Investment stage compatibility",
      icon: TrendingUp,
      color: "rgb(251,194,213)",
    },
    {
      label: "Location",
      weight: "20%",
      score: breakdown.location || breakdown.geographicPracticality || 75,
      explanation: "Geographic fit and market access",
      icon: MapPin,
      color: "rgb(196,227,230)",
    },
    {
      label: "Check Size",
      weight: "15%",
      score: breakdown.checkSize || breakdown.economicFit || 70,
      explanation: "Alignment with typical investment range",
      icon: DollarSign,
      color: "rgb(254,212,92)",
    },
    {
      label: "Investor Type",
      weight: "10%",
      score: breakdown.investorType || breakdown.investorTypeLogic || 90,
      explanation: "Fit between stage and investor type",
      icon: Users,
      color: "rgb(142,132,247)",
    },
  ];
}

function generateSemanticExplanation(
  domain: 'film' | 'real_estate' | 'general',
  match: Match,
  firm: InvestmentFirm | undefined,
  startup: Startup | undefined
): string {
  const firmName = firm?.name || "This investor";
  const firmType = firm?.type || "firm";
  
  if (domain === 'film') {
    const sectors = (firm?.sectors as string[] || []).slice(0, 2).join(", ") || "film financing";
    return `${firmName} specializes in ${sectors}, typically using revenue participation or preferred equity structures. Your project aligns with their risk and stage profile, making this a strong potential match.`;
  }
  
  if (domain === 'real_estate') {
    const location = firm?.hqLocation || firm?.location || "various markets";
    const sectors = (firm?.sectors as string[] || []).slice(0, 2).join(", ") || "real estate";
    return `${firmName} focuses on ${sectors} in ${location}. Your capital request and project structure align closely with their investment thesis, suggesting high compatibility.`;
  }
  
  const industries = (startup?.industries as string[] || []).slice(0, 2).join(", ") || "your sector";
  return `${firmName} is a ${firmType} actively investing in ${industries}. Their stage preference and check size range align well with your funding needs.`;
}

function getMatchAlerts(
  match: Match,
  firm: InvestmentFirm | undefined,
  startup: Startup | undefined
): { type: 'warning' | 'info'; message: string }[] {
  const alerts: { type: 'warning' | 'info'; message: string }[] = [];
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  if ((breakdown.checkSize || breakdown.economicFit || 100) < 60) {
    alerts.push({ type: 'warning', message: "Check size slightly outside preferred range" });
  }
  
  if ((breakdown.location || breakdown.geographicPracticality || 100) < 50) {
    alerts.push({ type: 'warning', message: "Geographic preference mismatch" });
  }
  
  if ((breakdown.stage || breakdown.stageCompatibility || 100) < 70) {
    alerts.push({ type: 'info', message: "Stage compatibility could improve with negotiation" });
  }
  
  return alerts;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "rgb(196,227,230)";
  if (score >= 60) return "rgb(254,212,92)";
  if (score >= 40) return "rgb(251,194,213)";
  return "rgb(255,100,100)";
}

function getDomainIcon(domain: 'film' | 'real_estate' | 'general') {
  if (domain === 'film') return Film;
  if (domain === 'real_estate') return Home;
  return Building2;
}

function getDomainLabel(domain: 'film' | 'real_estate' | 'general'): string {
  if (domain === 'film') return "Film/Entertainment";
  if (domain === 'real_estate') return "Real Estate";
  return "General";
}

export default function DomainMatchCard({
  match,
  firm,
  investor,
  startup,
  onSave,
  onPass,
  onContact,
  index,
}: DomainMatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  const domain = detectDomain(startup);
  const DomainIcon = getDomainIcon(domain);
  
  const factors = domain === 'film' 
    ? getFilmFactors(match, firm)
    : domain === 'real_estate'
      ? getRealEstateFactors(match, firm)
      : getGeneralFactors(match, firm);
  
  const semanticExplanation = generateSemanticExplanation(domain, match, firm, startup);
  const alerts = getMatchAlerts(match, firm, startup);
  
  const investorName = investor 
    ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
    : null;
  
  const score = match.matchScore || 0;
  const scoreColor = getScoreColor(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors overflow-hidden"
      data-testid={`card-domain-match-${match.id}`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
            >
              <Building2 className="w-6 h-6 text-[rgb(142,132,247)]" />
            </div>
            <div>
              <h3 className="font-medium text-white">
                {firm?.name || "Unknown Firm"}
              </h3>
              {investorName && (
                <p className="text-sm text-white/50">
                  {investorName}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div 
              className="text-2xl font-semibold"
              style={{ color: scoreColor }}
            >
              {score}%
            </div>
            <Badge 
              variant="outline"
              className="text-[10px] border-white/20"
              style={{ color: scoreColor }}
            >
              <DomainIcon className="w-3 h-3 mr-1" />
              {getDomainLabel(domain)}
            </Badge>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-white/40 mb-2">
            <span>Overall Match Score</span>
            <span>{score}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ 
                background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}88)` 
              }}
            />
          </div>
        </div>

        <p className="text-sm text-white/60 mb-4 line-clamp-2">
          {semanticExplanation}
        </p>

        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {alerts.map((alert, i) => (
              <Badge 
                key={i}
                variant="outline"
                className={`text-xs ${
                  alert.type === 'warning' 
                    ? 'border-[rgb(254,212,92)]/50 text-[rgb(254,212,92)]' 
                    : 'border-[rgb(142,132,247)]/50 text-[rgb(142,132,247)]'
                }`}
              >
                {alert.type === 'warning' && <AlertTriangle className="w-3 h-3 mr-1" />}
                {alert.type === 'info' && <Lightbulb className="w-3 h-3 mr-1" />}
                {alert.message}
              </Badge>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-white/60 hover:text-white hover:bg-white/5 mb-2"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-factors-${match.id}`}
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              Hide Factor Breakdown
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-2" />
              Why This Match?
            </>
          )}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 space-y-3 border-t border-white/10 pt-4">
              <h4 className="text-xs font-medium text-white/70 uppercase tracking-wider mb-3">
                Factor Breakdown
              </h4>
              {factors.map((factor, i) => {
                const FactorIcon = factor.icon;
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FactorIcon 
                          className="w-4 h-4" 
                          style={{ color: factor.color }}
                        />
                        <span className="text-sm text-white/80">{factor.label}</span>
                        <span className="text-xs text-white/40">({factor.weight})</span>
                      </div>
                      <span 
                        className="text-sm font-medium"
                        style={{ color: getScoreColor(factor.score) }}
                      >
                        {factor.score}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${factor.score}%` }}
                        transition={{ duration: 0.5, delay: i * 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: factor.color }}
                      />
                    </div>
                    <p className="text-xs text-white/40">{factor.explanation}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 p-4 border-t border-white/10 bg-white/[0.02]">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 h-10 rounded-xl text-[rgb(196,227,230)] hover:bg-[rgb(196,227,230)]/10"
          onClick={() => onSave(match)}
          disabled={match.status === "saved"}
          data-testid={`button-save-${match.id}`}
        >
          <Star className="w-4 h-4 mr-2" />
          Save
        </Button>
        {onContact && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-10 rounded-xl text-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/10"
            onClick={() => onContact(match)}
            data-testid={`button-contact-${match.id}`}
          >
            <Mail className="w-4 h-4 mr-2" />
            Contact
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 h-10 rounded-xl text-white/50 hover:bg-white/5"
          onClick={() => onPass(match)}
          disabled={match.status === "passed"}
          data-testid={`button-pass-${match.id}`}
        >
          <XCircle className="w-4 h-4 mr-2" />
          Pass
        </Button>
      </div>
    </motion.div>
  );
}
