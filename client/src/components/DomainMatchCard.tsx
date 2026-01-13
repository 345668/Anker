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
  Zap,
  ShoppingBag,
  Sparkles,
  Utensils,
  Factory,
  Truck,
  Leaf,
  Recycle,
  Wallet,
  LineChart,
  Monitor,
  Heart,
  Gamepad2,
  GraduationCap,
  Landmark,
  Shield,
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

type DomainType = 
  | 'film' | 'real_estate' | 'biotech' | 'medtech' | 'deeptech' | 'saas' | 'cpg'
  | 'fashion' | 'beauty' | 'food_beverage' | 'manufacturing' | 'logistics'
  | 'cleantech' | 'sustainable_materials' | 'fintech' | 'wealth_management'
  | 'enterprise_saas' | 'digital_health' | 'gaming' | 'edtech' | 'govtech' | 'cybersecurity'
  | 'general';

function detectDomain(startup: Startup | undefined): DomainType {
  if (!startup) return 'general';
  
  const industries = (startup.industries as string[] || []).map(i => i.toLowerCase());
  const description = (startup.description || '').toLowerCase();
  const combined = industries.join(' ') + ' ' + description;

  // Domain definitions synced with backend (server/services/enhanced-matchmaking.ts)
  // Priority order matters - more specific domains checked first
  const domainDefinitions: { domain: DomainType; strong: string[]; keywords: string[] }[] = [
    // Healthcare & Life Sciences (highest priority)
    { domain: 'biotech', strong: ['biotech', 'biotechnology', 'gene therapy', 'crispr', 'mrna', 'cell therapy', 'gene editing'], 
      keywords: ['pharmaceutical', 'drug discovery', 'clinical trial', 'preclinical', 'therapeutic', 'biologics', 'oncology', 'rare disease', 'immunotherapy'] },
    { domain: 'medtech', strong: ['medtech', 'medical device', 'medical devices', 'diagnostics'], 
      keywords: ['healthcare device', 'clinical', 'diagnostic', 'wearable health', 'surgical', 'implant', 'imaging'] },
    { domain: 'digital_health', strong: ['digital health', 'telehealth', 'telemedicine', 'mental health app', 'wellness tech'], 
      keywords: ['health app', 'fitness app', 'patient', 'remote care', 'health platform', 'therapy app'] },
    
    // Technology
    { domain: 'cybersecurity', strong: ['cybersecurity', 'cyber security', 'infosec', 'threat detection', 'security software'], 
      keywords: ['security', 'encryption', 'compliance', 'privacy', 'vulnerability', 'penetration testing', 'soc', 'siem'] },
    { domain: 'deeptech', strong: ['deep tech', 'deeptech', 'web3', 'blockchain', 'defi', 'cryptocurrency', 'quantum'], 
      keywords: ['artificial intelligence', 'machine learning', 'robotics', 'autonomous', 'iot', 'protocol', 'decentralized', 'smart contract'] },
    { domain: 'fintech', strong: ['fintech', 'insurtech', 'neobank', 'digital banking', 'payment platform', 'crypto exchange'], 
      keywords: ['payment', 'lending', 'insurance tech', 'trading', 'wealth', 'banking', 'financial services', 'regtech'] },
    { domain: 'saas', strong: ['saas', 'software as a service', 'vertical saas', 'b2b saas', 'enterprise saas'], 
      keywords: ['subscription', 'arr', 'mrr', 'recurring revenue', 'cloud software', 'platform'] },
    { domain: 'enterprise_saas', strong: ['enterprise software', 'erp', 'hr tech', 'collaboration software', 'productivity tools'], 
      keywords: ['enterprise', 'workflow', 'automation', 'crm', 'hrm', 'project management'] },
    
    // Consumer & Retail
    { domain: 'cpg', strong: ['cpg', 'consumer packaged goods', 'fmcg', 'consumer goods', 'household products'], 
      keywords: ['beverage', 'food and beverage', 'personal care', 'household', 'plant-based', 'dtc', 'direct to consumer'] },
    { domain: 'fashion', strong: ['fashion', 'apparel', 'footwear', 'clothing brand', 'sustainable fashion'], 
      keywords: ['clothing', 'shoes', 'accessories', 'textile', 'designer', 'streetwear', 'luxury fashion'] },
    { domain: 'beauty', strong: ['beauty', 'skincare', 'cosmetics', 'clean beauty', 'personal care brand'], 
      keywords: ['makeup', 'haircare', 'wellness', 'beauty brand', 'self-care', 'grooming'] },
    
    // Media & Entertainment
    { domain: 'film', strong: ['film', 'movie', 'cinema', 'slate financing', 'theatrical', 'film production'], 
      keywords: ['entertainment', 'production', 'studio', 'streaming', 'content', 'media', 'screenplay'] },
    { domain: 'gaming', strong: ['gaming', 'esports', 'game studio', 'video game', 'interactive media'], 
      keywords: ['game', 'player', 'console', 'mobile gaming', 'pc gaming', 'metaverse', 'virtual world'] },
    
    // Real Assets
    { domain: 'real_estate', strong: ['real estate', 'multifamily', 'reit', 'property development', 'proptech'], 
      keywords: ['property', 'residential', 'commercial', 'industrial', 'construction', 'bridge loan', 'mezzanine'] },
    { domain: 'cleantech', strong: ['cleantech', 'clean energy', 'renewable energy', 'solar', 'wind energy', 'climate tech'], 
      keywords: ['sustainability', 'carbon', 'green energy', 'battery', 'ev', 'energy storage', 'carbon capture'] },
    { domain: 'sustainable_materials', strong: ['sustainable materials', 'circular economy', 'bioplastics', 'recycling tech'], 
      keywords: ['sustainable packaging', 'biodegradable', 'upcycling', 'waste', 'materials science'] },
    
    // Industrial & Logistics
    { domain: 'manufacturing', strong: ['manufacturing', 'industrial tech', 'smart factory', 'additive manufacturing', '3d printing'], 
      keywords: ['robotics', 'automation', 'factory', 'production', 'industrial', 'machinery'] },
    { domain: 'logistics', strong: ['logistics', 'supply chain', 'fleet management', 'delivery tech', 'mobility'], 
      keywords: ['shipping', 'freight', 'warehouse', 'last mile', 'transportation', 'trucking', 'fleet'] },
    
    // Food & Hospitality
    { domain: 'food_beverage', strong: ['restaurant tech', 'ghost kitchen', 'food tech', 'food delivery', 'food platform'], 
      keywords: ['restaurant', 'cuisine', 'catering', 'hospitality', 'food service', 'kitchen'] },
    
    // Other Specialized
    { domain: 'edtech', strong: ['edtech', 'education technology', 'learning platform', 'online learning', 'e-learning'], 
      keywords: ['education', 'learning', 'training', 'school', 'university', 'student', 'curriculum', 'lms'] },
    { domain: 'govtech', strong: ['govtech', 'civic tech', 'smart city', 'government tech', 'public sector'], 
      keywords: ['government', 'civic', 'public services', 'municipal', 'regulatory', 'compliance'] },
    { domain: 'wealth_management', strong: ['wealth management', 'robo-advisor', 'portfolio management', 'asset management'], 
      keywords: ['investment', 'wealth', 'portfolio', 'financial advisor', 'retirement', 'pension'] },
  ];

  // Check each domain in priority order (matches backend)
  for (const { domain, strong, keywords } of domainDefinitions) {
    const hasStrong = strong.some(k => combined.includes(k));
    const keywordScore = keywords.filter(k => combined.includes(k)).length;
    if (hasStrong || keywordScore >= 2) return domain;
  }

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

function getBiotechFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    { label: "Science/Tech Fit", weight: "30%", score: breakdown.semanticFit || 85, explanation: "Therapeutic platform alignment", icon: Target, color: "rgb(142,132,247)" },
    { label: "Development Stage", weight: "25%", score: breakdown.stageCompatibility || 80, explanation: "Clinical phase compatibility", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Indication/Market", weight: "15%", score: breakdown.geographicPracticality || 75, explanation: "Therapeutic area fit", icon: Activity, color: "rgb(196,227,230)" },
    { label: "Check Size", weight: "15%", score: breakdown.economicFit || 70, explanation: "Investment range alignment", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorTypeLogic || 85, explanation: firm?.type ? `${firm.type} biotech focus` : "Investor type fit", icon: Users, color: "rgb(142,132,247)" },
    { label: "Deal Structure", weight: "5%", score: 80, explanation: "Equity/co-development compatibility", icon: Briefcase, color: "rgb(251,194,213)" },
  ];
}

function getMedtechFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    { label: "Technology Fit", weight: "25%", score: breakdown.semanticFit || 85, explanation: "Device/diagnostic alignment", icon: Target, color: "rgb(142,132,247)" },
    { label: "Regulatory Stage", weight: "25%", score: breakdown.stageCompatibility || 80, explanation: "FDA/CE clearance stage", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Market/Use Case", weight: "20%", score: breakdown.geographicPracticality || 75, explanation: "Healthcare market fit", icon: Activity, color: "rgb(196,227,230)" },
    { label: "Check Size", weight: "15%", score: breakdown.economicFit || 70, explanation: "Investment range alignment", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorTypeLogic || 85, explanation: firm?.type ? `${firm.type} medtech focus` : "Investor type fit", icon: Users, color: "rgb(142,132,247)" },
    { label: "Deal Structure", weight: "5%", score: 80, explanation: "Regulatory pathway compatibility", icon: Briefcase, color: "rgb(251,194,213)" },
  ];
}

function getDeeptechFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    { label: "Technology Thesis", weight: "35%", score: breakdown.semanticFit || 85, explanation: "Core technology alignment", icon: Zap, color: "rgb(142,132,247)" },
    { label: "Development Stage", weight: "20%", score: breakdown.stageCompatibility || 80, explanation: "R&D/commercialization phase", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Market/Use Case", weight: "15%", score: breakdown.geographicPracticality || 75, explanation: "Target market fit", icon: Target, color: "rgb(196,227,230)" },
    { label: "Check Size", weight: "15%", score: breakdown.economicFit || 70, explanation: "Investment range alignment", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorTypeLogic || 85, explanation: firm?.type ? `${firm.type} deep tech focus` : "Investor type fit", icon: Users, color: "rgb(142,132,247)" },
    { label: "Deal Structure", weight: "5%", score: 80, explanation: "Equity/token compatibility", icon: Briefcase, color: "rgb(251,194,213)" },
  ];
}

function getSaasFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    { label: "Product/Vertical Fit", weight: "30%", score: breakdown.semanticFit || 85, explanation: "Vertical SaaS alignment", icon: Target, color: "rgb(142,132,247)" },
    { label: "Stage Match", weight: "25%", score: breakdown.stageCompatibility || 80, explanation: "Seed to Series C compatibility", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Market Alignment", weight: "15%", score: breakdown.geographicPracticality || 75, explanation: "Enterprise/SMB focus", icon: Activity, color: "rgb(196,227,230)" },
    { label: "Check Size", weight: "15%", score: breakdown.economicFit || 70, explanation: "ARR-aligned ticket size", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorTypeLogic || 85, explanation: firm?.type ? `${firm.type} SaaS focus` : "Investor type fit", icon: Users, color: "rgb(142,132,247)" },
    { label: "Deal Structure", weight: "5%", score: 80, explanation: "Equity/revenue share fit", icon: Briefcase, color: "rgb(251,194,213)" },
  ];
}

function getCpgFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    { label: "Product Category", weight: "30%", score: breakdown.semanticFit || 85, explanation: "F&B/personal care alignment", icon: Target, color: "rgb(142,132,247)" },
    { label: "Stage Match", weight: "25%", score: breakdown.stageCompatibility || 80, explanation: "Growth/commercial stage", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Distribution Fit", weight: "15%", score: breakdown.geographicPracticality || 75, explanation: "DTC/retail channel alignment", icon: Activity, color: "rgb(196,227,230)" },
    { label: "Check Size", weight: "15%", score: breakdown.economicFit || 70, explanation: "Investment range alignment", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorTypeLogic || 85, explanation: firm?.type ? `${firm.type} CPG focus` : "Investor type fit", icon: Users, color: "rgb(142,132,247)" },
    { label: "Deal Structure", weight: "5%", score: 80, explanation: "Equity/royalty compatibility", icon: Briefcase, color: "rgb(251,194,213)" },
  ];
}

function getGeneralFactors(match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  
  return [
    { label: "Industry Match", weight: "30%", score: breakdown.industry || breakdown.semanticFit || 80, explanation: "Sector alignment with investor focus", icon: Target, color: "rgb(142,132,247)" },
    { label: "Stage Match", weight: "25%", score: breakdown.stage || breakdown.stageCompatibility || 85, explanation: "Investment stage compatibility", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Location", weight: "20%", score: breakdown.location || breakdown.geographicPracticality || 75, explanation: "Geographic fit and market access", icon: MapPin, color: "rgb(196,227,230)" },
    { label: "Check Size", weight: "15%", score: breakdown.checkSize || breakdown.economicFit || 70, explanation: "Alignment with typical investment range", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorType || breakdown.investorTypeLogic || 90, explanation: "Fit between stage and investor type", icon: Users, color: "rgb(142,132,247)" },
  ];
}

function generateSemanticExplanation(
  domain: DomainType,
  match: Match,
  firm: InvestmentFirm | undefined,
  startup: Startup | undefined
): string {
  const firmName = firm?.name || "This investor";
  const firmType = firm?.type || "firm";
  const sectors = (firm?.sectors as string[] || []).slice(0, 2).join(", ");
  const domainLabel = getDomainLabel(domain);
  
  const explanations: Record<DomainType, string> = {
    film: `${firmName} specializes in ${sectors || "film financing"}, typically using revenue participation or preferred equity. Your project aligns with their risk profile.`,
    real_estate: `${firmName} focuses on ${sectors || "real estate"} investments. Your capital request and project structure align closely with their thesis.`,
    biotech: `${firmName} invests in ${sectors || "life sciences"}, with focus on therapeutic platforms at your development stage. Strong alignment in clinical phase.`,
    medtech: `${firmName} specializes in ${sectors || "medical technology"}, supporting companies through regulatory pathways. Good fit for your device focus.`,
    deeptech: `${firmName} backs ${sectors || "deep tech"} ventures, with expertise in AI/blockchain/quantum technologies. Your tech stack aligns with their thesis.`,
    saas: `${firmName} invests in ${sectors || "vertical SaaS"} companies, with focus on recurring revenue models. Your ARR profile matches their criteria.`,
    cpg: `${firmName} focuses on ${sectors || "consumer brands"}, supporting growth through DTC and retail channels. Your product category aligns well.`,
    fashion: `${firmName} invests in ${sectors || "fashion/apparel"} brands, with expertise in sustainable fashion and D2C growth. Your brand positioning fits well.`,
    beauty: `${firmName} focuses on ${sectors || "beauty/personal care"} brands, supporting clean beauty and wellness innovations. Strong category alignment.`,
    food_beverage: `${firmName} invests in ${sectors || "food & beverage"} concepts, with expertise in restaurant tech and food innovation. Good fit for your model.`,
    manufacturing: `${firmName} backs ${sectors || "industrial tech"} companies, with focus on smart manufacturing and automation. Your tech approach aligns well.`,
    logistics: `${firmName} invests in ${sectors || "logistics/mobility"} ventures, supporting supply chain innovation. Your solution fits their portfolio focus.`,
    cleantech: `${firmName} focuses on ${sectors || "clean energy"} investments, backing sustainability and climate solutions. Strong thesis alignment.`,
    sustainable_materials: `${firmName} invests in ${sectors || "sustainable materials"} innovations, supporting circular economy solutions. Good fit for your approach.`,
    fintech: `${firmName} backs ${sectors || "fintech"} companies, with expertise in payments, lending, and insurance tech. Your product fits their thesis.`,
    wealth_management: `${firmName} invests in ${sectors || "wealth tech"} platforms, with focus on asset management innovation. Good fit for your solution.`,
    enterprise_saas: `${firmName} focuses on ${sectors || "enterprise software"}, backing productivity and workflow solutions. Your platform fits their criteria.`,
    digital_health: `${firmName} invests in ${sectors || "digital health"} companies, supporting telehealth and wellness innovation. Strong thesis alignment.`,
    gaming: `${firmName} backs ${sectors || "gaming/eSports"} ventures, with expertise in interactive media and metaverse. Your product fits their focus.`,
    edtech: `${firmName} focuses on ${sectors || "education technology"}, supporting learning platforms and ed-tech innovation. Good fit for your solution.`,
    govtech: `${firmName} invests in ${sectors || "govtech"} companies, with focus on smart cities and civic innovation. Your solution aligns with their thesis.`,
    cybersecurity: `${firmName} backs ${sectors || "cybersecurity"} ventures, with expertise in enterprise security. Your security solution fits their portfolio.`,
    general: `${firmName} is a ${firmType} actively investing in your sector. Their stage preference and check size range align well with your funding needs.`,
  };
  
  return explanations[domain] || explanations.general;
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

function getDomainIcon(domain: DomainType) {
  const icons: Record<DomainType, typeof Building2> = {
    film: Film, real_estate: Home, biotech: Activity, medtech: Activity, deeptech: Zap,
    saas: Target, cpg: TrendingUp, fashion: ShoppingBag, beauty: Sparkles, food_beverage: Utensils,
    manufacturing: Factory, logistics: Truck, cleantech: Leaf, sustainable_materials: Recycle,
    fintech: Wallet, wealth_management: LineChart, enterprise_saas: Monitor, digital_health: Heart,
    gaming: Gamepad2, edtech: GraduationCap, govtech: Landmark, cybersecurity: Shield, general: Building2,
  };
  return icons[domain] || Building2;
}

function getDomainLabel(domain: DomainType): string {
  const labels: Record<DomainType, string> = {
    film: "Film/Entertainment", real_estate: "Real Estate", biotech: "Biotech/Pharma",
    medtech: "MedTech", deeptech: "Deep Tech/Web3", saas: "Vertical SaaS", cpg: "CPG/Consumer",
    fashion: "Fashion/Apparel", beauty: "Beauty/Personal Care", food_beverage: "Food & Beverage",
    manufacturing: "Manufacturing", logistics: "Logistics/Mobility", cleantech: "CleanTech",
    sustainable_materials: "Sustainable Materials", fintech: "FinTech", wealth_management: "Wealth Management",
    enterprise_saas: "Enterprise SaaS", digital_health: "Digital Health", gaming: "Gaming/eSports",
    edtech: "EdTech", govtech: "GovTech", cybersecurity: "Cybersecurity", general: "General",
  };
  return labels[domain] || "General";
}

function getGenericDomainFactors(domain: DomainType, match: Match, firm: InvestmentFirm | undefined): FactorBreakdown[] {
  const metadata = match.metadata as any;
  const breakdown = metadata?.breakdown || {};
  const label = getDomainLabel(domain);
  const domainScore = metadata?.domainScore || {};
  
  // Use backend breakdown keys (semanticFit, stageCompatibility, economicFit, geographicPracticality, investorBehavior, investorTypeLogic, networkWarmth)
  return [
    { label: "Industry Fit", weight: "35%", score: breakdown.semanticFit || domainScore.semanticFit || 80, 
      explanation: `${label} thesis alignment`, icon: Target, color: "rgb(142,132,247)" },
    { label: "Stage Match", weight: "20%", score: breakdown.stageCompatibility || 80, 
      explanation: "Investment stage compatibility", icon: TrendingUp, color: "rgb(251,194,213)" },
    { label: "Check Size", weight: "15%", score: breakdown.economicFit || 75, 
      explanation: "Check size range alignment", icon: DollarSign, color: "rgb(254,212,92)" },
    { label: "Geography", weight: "10%", score: breakdown.geographicPracticality || 80, 
      explanation: "Market/geographic alignment", icon: MapPin, color: "rgb(196,227,230)" },
    { label: "Investor Behavior", weight: "10%", score: breakdown.investorBehavior || 75, 
      explanation: "Activity level and profile completeness", icon: Activity, color: "rgb(142,132,247)" },
    { label: "Investor Type", weight: "10%", score: breakdown.investorTypeLogic || 85, 
      explanation: firm?.type ? `${firm.type} alignment` : "Investor type fit", icon: Users, color: "rgb(251,194,213)" },
  ];
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
  
  const factors = (() => {
    switch (domain) {
      case 'film': return getFilmFactors(match, firm);
      case 'real_estate': return getRealEstateFactors(match, firm);
      case 'biotech': return getBiotechFactors(match, firm);
      case 'medtech': return getMedtechFactors(match, firm);
      case 'deeptech': return getDeeptechFactors(match, firm);
      case 'saas': return getSaasFactors(match, firm);
      case 'cpg': return getCpgFactors(match, firm);
      case 'fashion':
      case 'beauty':
      case 'food_beverage':
      case 'manufacturing':
      case 'logistics':
      case 'cleantech':
      case 'sustainable_materials':
      case 'fintech':
      case 'wealth_management':
      case 'enterprise_saas':
      case 'digital_health':
      case 'gaming':
      case 'edtech':
      case 'govtech':
      case 'cybersecurity':
        return getGenericDomainFactors(domain, match, firm);
      default: return getGeneralFactors(match, firm);
    }
  })();
  
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
