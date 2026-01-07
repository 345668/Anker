import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  Upload, FileText, Sparkles, Loader2, AlertCircle, CheckCircle,
  TrendingUp, Target, Lightbulb, Star, BarChart3, Briefcase, Download,
  X, Plus, Shield, FileSpreadsheet, HelpCircle, Users, DollarSign,
  AlertTriangle, Eye, Building2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { extractTextFromPDF } from "@/lib/pdf-parser";
import AppLayout from "@/components/AppLayout";
import jsPDF from "jspdf";

interface UploadedFiles {
  pitchDeck: File | null;
  dataRoom: File[];
  financials: File[];
  faqs: File[];
}

interface ExtractedStartupInfo {
  companyName?: string;
  tagline?: string;
  description?: string;
  industries?: string[];
  stage?: string;
  problem?: string;
  solution?: string;
  targetMarket?: string;
  businessModel?: string;
  traction?: string;
  team?: string;
  askAmount?: string;
  useOfFunds?: string;
}

interface DeckQuality {
  overallScore: number;
  visualDesign: number;
  narrative: number;
  dataPresentation: number;
  strengths: string[];
  weaknesses: string[];
  slideRatings: Array<{
    slide: string;
    score: number;
    feedback: string;
  }>;
}

interface MarketOpportunity {
  tamClaimed: string;
  tamRealistic: string;
  samEstimate: string;
  marketGrowth: string;
  assessment: string;
  redFlags: string[];
  score: number;
}

interface UnitEconomics {
  cac: string;
  ltv: string;
  ltvCacRatio: number;
  paybackPeriod: string;
  assessment: string;
}

interface BusinessModelAnalysis {
  revenueStreams: string[];
  unitEconomics: UnitEconomics;
  scalability: string;
  concerns: string[];
  score: number;
}

interface TeamMember {
  name: string;
  role: string;
  background: string;
  assessment: string;
}

interface TeamAnalysis {
  founders: TeamMember[];
  gaps: string[];
  strengths: string[];
  score: number;
}

interface Competitor {
  name: string;
  advantage: string;
  disadvantage: string;
}

interface CompetitiveAnalysis {
  competitors: Competitor[];
  differentiation: string;
  moat: string;
  concerns: string[];
  score: number;
}

interface FinancialProjections {
  year1: number;
  year2: number;
  year3: number;
  year4: number;
  year5: number;
}

interface FinancialAnalysis {
  currentRevenue: string;
  burnRate: string;
  runway: string;
  askAmount: string;
  valuation: string;
  projections: FinancialProjections;
  projectionsAssessment: string;
  concerns: string[];
  score: number;
}

interface DataRoomFindings {
  quality: string;
  missingDocuments: string[];
  concerningFindings: string[];
  positiveFindings: string[];
}

interface Risk {
  category: string;
  description: string;
  severity: string;
  mitigation: string;
}

interface PerspectiveEvaluation {
  evaluatorType: "vc" | "mbb" | "business_owner";
  evaluatorName: string;
  evaluatorDescription: string;
  overallScore: number;
  grade: string;
  sections: Array<{
    name: string;
    score: number;
    feedback: string;
    suggestions: string[];
  }>;
  strengths: string[];
  weaknesses: string[];
  keyRecommendations: string[];
  investmentReadiness: string;
  summary: string;
}

interface BestPracticeCheck {
  category: string;
  practices: string[];
  status: "met" | "partial" | "missing";
}

interface EnhancedAnalysis {
  companyName: string;
  sector: string;
  foundingDate: string;
  stage: string;
  executiveSummary: string;
  criticalAssessment: string;
  investmentThesis: string;
  deckQuality: DeckQuality;
  marketOpportunity: MarketOpportunity;
  businessModel: BusinessModelAnalysis;
  team: TeamAnalysis;
  competitive: CompetitiveAnalysis;
  financials: FinancialAnalysis;
  dataRoomFindings: DataRoomFindings;
  risks: Risk[];
  redFlags: string[];
  strengths: string[];
  concerns: string[];
  recommendation: string;
  recommendationRationale: string;
  investmentStructure: string;
  overallScore: number;
  confidenceLevel: string;
  nextSteps: string[];
}

interface FullAnalysis {
  extractedInfo: ExtractedStartupInfo;
  evaluations: PerspectiveEvaluation[];
  bestPractices: BestPracticeCheck[];
  overallGrade: string;
  overallScore: number;
  executiveSummary: string;
  enhanced?: EnhancedAnalysis;
}

const gradeColors: Record<string, string> = {
  'A+': 'bg-emerald-500',
  'A': 'bg-emerald-500',
  'A-': 'bg-emerald-400',
  'B+': 'bg-green-500',
  'B': 'bg-green-400',
  'B-': 'bg-lime-500',
  'C+': 'bg-yellow-500',
  'C': 'bg-yellow-400',
  'C-': 'bg-orange-400',
  'D+': 'bg-orange-500',
  'D': 'bg-orange-600',
  'D-': 'bg-red-400',
  'F': 'bg-red-500',
};

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  'met': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: CheckCircle },
  'partial': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: AlertCircle },
  'missing': { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
};

const perspectiveIcons: Record<string, typeof Briefcase> = {
  'vc': TrendingUp,
  'mbb': BarChart3,
  'business_owner': Lightbulb,
};

const perspectiveColors: Record<string, string> = {
  'vc': 'rgb(142,132,247)',
  'mbb': 'rgb(196,227,230)',
  'business_owner': 'rgb(251,194,213)',
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  return 'text-red-400';
};

const getScoreBar = (score: number): string => {
  const filled = Math.round(score / 10);
  return '[' + '#'.repeat(filled) + '-'.repeat(10 - filled) + ']';
};

const getSeverityColor = (severity: string): string => {
  switch (severity.toLowerCase()) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
};

export default function PitchDeckAnalysis() {
  const { toast } = useToast();
  const pitchDeckRef = useRef<HTMLInputElement>(null);
  const dataRoomRef = useRef<HTMLInputElement>(null);
  const financialsRef = useRef<HTMLInputElement>(null);
  const faqsRef = useRef<HTMLInputElement>(null);
  
  const [files, setFiles] = useState<UploadedFiles>({
    pitchDeck: null,
    dataRoom: [],
    financials: [],
    faqs: [],
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [downloadingReport, setDownloadingReport] = useState(false);

  const downloadConsultingReport = async () => {
    if (!analysis) return;
    
    setDownloadingReport(true);
    try {
      const reportData = {
        startupName: analysis.extractedInfo.companyName || "Company",
        tagline: analysis.extractedInfo.tagline,
        overallScore: analysis.overallScore,
        sections: analysis.evaluations.map(e => ({
          name: e.evaluatorName,
          score: e.overallScore,
          feedback: e.summary || "",
        })),
        strengths: analysis.enhanced?.deckQuality?.strengths || [],
        weaknesses: analysis.enhanced?.deckQuality?.weaknesses || [],
        recommendations: analysis.enhanced?.nextSteps || [],
        risks: analysis.enhanced?.redFlags?.map(flag => ({
          risk: flag,
          level: "High",
          mitigation: "Address before next investor meeting",
        })) || [],
      };

      const response = await apiRequest("POST", "/api/reports/pitch-analysis", reportData);
      
      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(analysis.extractedInfo.companyName || "Pitch").replace(/[^a-zA-Z0-9]/g, "_")}_Consulting_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Report downloaded",
        description: "Your consulting-style PDF report has been generated.",
      });
    } catch (error) {
      console.error("Report download error:", error);
      toast({
        title: "Download failed",
        description: "Could not generate the consulting report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, category: keyof UploadedFiles) => {
    const uploadedFiles = Array.from(e.target.files || []);
    if (uploadedFiles.length === 0) return;
    
    if (category === 'pitchDeck') {
      setFiles(prev => ({ ...prev, pitchDeck: uploadedFiles[0] }));
    } else {
      setFiles(prev => ({
        ...prev,
        [category]: [...prev[category], ...uploadedFiles],
      }));
    }
  };

  const removeFile = (category: keyof UploadedFiles, index?: number) => {
    if (category === 'pitchDeck') {
      setFiles(prev => ({ ...prev, pitchDeck: null }));
    } else if (typeof index === 'number') {
      setFiles(prev => ({
        ...prev,
        [category]: (prev[category] as File[]).filter((_, i) => i !== index),
      }));
    }
  };

  const exportToPDF = () => {
    if (!analysis) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;

    const addNewPageIfNeeded = (requiredSpace: number) => {
      if (yPos + requiredSpace > pageHeight - margin - 25) {
        doc.addPage();
        doc.setFillColor(18, 18, 18);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        yPos = margin;
        return true;
      }
      return false;
    };

    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      doc.setFontSize(fontSize);
      return doc.splitTextToSize(text, maxWidth);
    };

    const addSectionHeader = (title: string, color: number[] = [142, 132, 247]) => {
      addNewPageIfNeeded(30);
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(margin, yPos, contentWidth, 12, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin + 5, yPos + 8);
      yPos += 18;
    };

    const addSubSection = (label: string, value: string | undefined, labelColor: number[] = [142, 132, 247]) => {
      if (!value || value === "Not specified") return;
      addNewPageIfNeeded(20);
      doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(label, margin + 5, yPos);
      yPos += 5;
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const lines = wrapText(value, contentWidth - 15, 9);
      for (const line of lines) {
        addNewPageIfNeeded(5);
        doc.text(line, margin + 10, yPos);
        yPos += 5;
      }
      yPos += 3;
    };

    doc.setFillColor(18, 18, 18);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setFillColor(142, 132, 247);
    doc.roundedRect(margin, yPos, contentWidth, 55, 3, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("ANKER CONSULTING", margin + 10, yPos + 15);
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("Confidential Investment Analysis", margin + 10, yPos + 28);
    
    doc.setFontSize(12);
    const companyName = analysis.extractedInfo.companyName || "Unknown Company";
    doc.text(`Client: ${companyName}`, margin + 10, yPos + 42);

    yPos += 65;

    doc.setFillColor(40, 40, 40);
    doc.roundedRect(margin, yPos, contentWidth, 35, 3, 3, 'F');
    
    doc.setFontSize(32);
    doc.setFont("helvetica", "bold");
    const gradeColor = analysis.overallGrade.startsWith('A') ? [16, 185, 129] : 
                       analysis.overallGrade.startsWith('B') ? [34, 197, 94] :
                       analysis.overallGrade.startsWith('C') ? [234, 179, 8] :
                       [239, 68, 68];
    doc.setTextColor(gradeColor[0], gradeColor[1], gradeColor[2]);
    doc.text(analysis.overallGrade, margin + 15, yPos + 25);
    
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Overall Score: ${analysis.overallScore}/100`, margin + 60, yPos + 22);
    
    if (analysis.enhanced?.recommendation) {
      doc.setFontSize(10);
      const recColor = analysis.enhanced.recommendation === 'INVEST' ? [16, 185, 129] :
                       analysis.enhanced.recommendation === 'PASS' ? [239, 68, 68] : [234, 179, 8];
      doc.setTextColor(recColor[0], recColor[1], recColor[2]);
      doc.text(`Recommendation: ${analysis.enhanced.recommendation}`, margin + 130, yPos + 22);
    }

    yPos += 45;

    doc.setTextColor(142, 132, 247);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Executive Summary", margin, yPos);
    yPos += 10;

    doc.setTextColor(180, 180, 180);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const summaryLines = wrapText(analysis.executiveSummary, contentWidth - 10, 10);
    for (const line of summaryLines) {
      addNewPageIfNeeded(6);
      doc.text(line, margin + 5, yPos);
      yPos += 6;
    }

    yPos += 15;

    if (analysis.enhanced?.criticalAssessment) {
      addSectionHeader("CRITICAL ASSESSMENT", [239, 68, 68]);
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const critLines = wrapText(analysis.enhanced.criticalAssessment, contentWidth - 10, 9);
      for (const line of critLines) {
        addNewPageIfNeeded(5);
        doc.text(line, margin + 5, yPos);
        yPos += 5;
      }
      yPos += 10;
    }

    if (analysis.enhanced?.redFlags && analysis.enhanced.redFlags.length > 0) {
      addSectionHeader("RED FLAGS", [239, 68, 68]);
      for (const flag of analysis.enhanced.redFlags) {
        addNewPageIfNeeded(8);
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(9);
        const flagLines = wrapText(`• ${flag}`, contentWidth - 15, 9);
        for (const line of flagLines) {
          doc.text(line, margin + 5, yPos);
          yPos += 5;
        }
      }
      yPos += 10;
    }

    addSectionHeader("SCORING MATRIX");
    const scores = [
      { name: "Market Opportunity", score: analysis.enhanced?.marketOpportunity?.score || 0 },
      { name: "Business Model", score: analysis.enhanced?.businessModel?.score || 0 },
      { name: "Team", score: analysis.enhanced?.team?.score || 0 },
      { name: "Competitive Position", score: analysis.enhanced?.competitive?.score || 0 },
      { name: "Financials", score: analysis.enhanced?.financials?.score || 0 },
      { name: "Deck Quality", score: analysis.enhanced?.deckQuality?.overallScore || 0 },
    ];
    
    for (const item of scores) {
      addNewPageIfNeeded(8);
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(9);
      doc.text(`${item.name}:`, margin + 5, yPos);
      doc.text(`${item.score}/100`, margin + 60, yPos);
      doc.text(getScoreBar(item.score), margin + 85, yPos);
      yPos += 6;
    }
    yPos += 10;

    addSectionHeader("COMPANY OVERVIEW");
    
    const info = analysis.extractedInfo;
    if (info.tagline) addSubSection("Tagline", info.tagline);
    if (info.description) addSubSection("Description", info.description);
    if (info.industries && info.industries.length > 0) addSubSection("Industries", info.industries.join(", "));
    if (info.stage) addSubSection("Stage", info.stage);
    addSubSection("Problem", info.problem);
    addSubSection("Solution", info.solution);
    addSubSection("Target Market", info.targetMarket);
    addSubSection("Business Model", info.businessModel);
    addSubSection("Traction", info.traction);
    addSubSection("Team", info.team);
    addSubSection("Ask Amount", info.askAmount);
    addSubSection("Use of Funds", info.useOfFunds);

    yPos += 10;

    if (analysis.enhanced?.marketOpportunity) {
      addSectionHeader("MARKET ANALYSIS", [34, 197, 94]);
      const market = analysis.enhanced.marketOpportunity;
      addSubSection("TAM (Claimed)", market.tamClaimed, [34, 197, 94]);
      addSubSection("TAM (Realistic)", market.tamRealistic, [34, 197, 94]);
      addSubSection("SAM Estimate", market.samEstimate, [34, 197, 94]);
      addSubSection("Market Growth", market.marketGrowth, [34, 197, 94]);
      addSubSection("Assessment", market.assessment, [180, 180, 180]);
      yPos += 10;
    }

    if (analysis.enhanced?.financials) {
      addSectionHeader("FINANCIAL ANALYSIS", [234, 179, 8]);
      const fin = analysis.enhanced.financials;
      addSubSection("Current Revenue", fin.currentRevenue, [234, 179, 8]);
      addSubSection("Burn Rate", fin.burnRate, [234, 179, 8]);
      addSubSection("Runway", fin.runway, [234, 179, 8]);
      addSubSection("Ask Amount", fin.askAmount, [234, 179, 8]);
      addSubSection("Valuation", fin.valuation, [234, 179, 8]);
      addSubSection("Projections Assessment", fin.projectionsAssessment, [180, 180, 180]);
      yPos += 10;
    }

    if (analysis.enhanced?.risks && analysis.enhanced.risks.length > 0) {
      addSectionHeader("RISK ASSESSMENT", [239, 68, 68]);
      for (const risk of analysis.enhanced.risks) {
        addNewPageIfNeeded(20);
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`[${risk.severity.toUpperCase()}] ${risk.category}`, margin + 5, yPos);
        yPos += 6;
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const riskLines = wrapText(risk.description, contentWidth - 15, 9);
        for (const line of riskLines) {
          doc.text(line, margin + 10, yPos);
          yPos += 5;
        }
        yPos += 3;
      }
      yPos += 10;
    }

    if (analysis.enhanced?.recommendation) {
      addSectionHeader("FINAL RECOMMENDATION", [142, 132, 247]);
      doc.setTextColor(142, 132, 247);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Recommendation: ${analysis.enhanced.recommendation}`, margin + 5, yPos);
      yPos += 10;
      
      if (analysis.enhanced.recommendationRationale) {
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const ratLines = wrapText(analysis.enhanced.recommendationRationale, contentWidth - 10, 9);
        for (const line of ratLines) {
          addNewPageIfNeeded(5);
          doc.text(line, margin + 5, yPos);
          yPos += 5;
        }
      }
      yPos += 10;
      
      if (analysis.enhanced.nextSteps && analysis.enhanced.nextSteps.length > 0) {
        doc.setTextColor(142, 132, 247);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Next Steps:", margin + 5, yPos);
        yPos += 6;
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const step of analysis.enhanced.nextSteps) {
          addNewPageIfNeeded(6);
          doc.text(`• ${step}`, margin + 10, yPos);
          yPos += 5;
        }
      }
    }

    addSectionHeader("BEST PRACTICES CHECKLIST", [196, 227, 230]);
    
    for (const bp of analysis.bestPractices) {
      addNewPageIfNeeded(25);
      const statusColor = bp.status === 'met' ? [16, 185, 129] : 
                          bp.status === 'partial' ? [234, 179, 8] : 
                          [239, 68, 68];
      const statusText = bp.status === 'met' ? 'Met' : bp.status === 'partial' ? 'Partial' : 'Missing';
      
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`[${statusText}] ${bp.category}`, margin + 5, yPos);
      yPos += 6;
      
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      for (const practice of bp.practices) {
        addNewPageIfNeeded(5);
        const lines = wrapText(`  - ${practice}`, contentWidth - 20, 8);
        for (const line of lines) {
          doc.text(line, margin + 10, yPos);
          yPos += 4;
        }
      }
      yPos += 4;
    }

    yPos += 10;

    for (const evaluation of analysis.evaluations) {
      const evalColor = evaluation.evaluatorType === 'vc' ? [142, 132, 247] :
                        evaluation.evaluatorType === 'mbb' ? [196, 227, 230] :
                        [251, 194, 213];
      
      addSectionHeader(`${evaluation.evaluatorName.toUpperCase()} PERSPECTIVE`, evalColor);
      
      doc.setFillColor(40, 40, 40);
      doc.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'F');
      doc.setTextColor(evalColor[0], evalColor[1], evalColor[2]);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(evaluation.grade, margin + 10, yPos + 14);
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(11);
      doc.text(`Score: ${evaluation.overallScore}/100`, margin + 35, yPos + 14);
      doc.setFontSize(9);
      doc.text(evaluation.investmentReadiness, margin + 90, yPos + 14);
      yPos += 28;

      if (evaluation.summary) {
        doc.setTextColor(160, 160, 160);
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        const summaryLines = wrapText(evaluation.summary, contentWidth - 10, 9);
        for (const line of summaryLines) {
          addNewPageIfNeeded(5);
          doc.text(line, margin + 5, yPos);
          yPos += 5;
        }
        yPos += 5;
      }

      if (evaluation.sections && evaluation.sections.length > 0) {
        doc.setTextColor(142, 132, 247);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Section Scores:", margin + 5, yPos);
        yPos += 7;
        
        for (const section of evaluation.sections) {
          addNewPageIfNeeded(20);
          const sectionColor = section.score >= 80 ? [16, 185, 129] : 
                               section.score >= 60 ? [234, 179, 8] : [239, 68, 68];
          doc.setTextColor(sectionColor[0], sectionColor[1], sectionColor[2]);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text(`${section.name}: ${section.score}/100`, margin + 10, yPos);
          yPos += 5;
          
          if (section.feedback) {
            doc.setTextColor(150, 150, 150);
            doc.setFont("helvetica", "normal");
            const feedbackLines = wrapText(section.feedback, contentWidth - 25, 8);
            for (const line of feedbackLines.slice(0, 2)) {
              doc.text(line, margin + 15, yPos);
              yPos += 4;
            }
          }
          yPos += 2;
        }
        yPos += 5;
      }

      if (evaluation.strengths.length > 0) {
        addNewPageIfNeeded(15);
        doc.setTextColor(16, 185, 129);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Strengths:", margin + 5, yPos);
        yPos += 6;
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const strength of evaluation.strengths) {
          addNewPageIfNeeded(10);
          const lines = wrapText(`+ ${strength}`, contentWidth - 15, 9);
          for (const line of lines) {
            doc.text(line, margin + 10, yPos);
            yPos += 5;
          }
        }
        yPos += 3;
      }

      if (evaluation.weaknesses.length > 0) {
        addNewPageIfNeeded(15);
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Areas for Improvement:", margin + 5, yPos);
        yPos += 6;
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const weakness of evaluation.weaknesses) {
          addNewPageIfNeeded(10);
          const lines = wrapText(`- ${weakness}`, contentWidth - 15, 9);
          for (const line of lines) {
            doc.text(line, margin + 10, yPos);
            yPos += 5;
          }
        }
        yPos += 3;
      }

      if (evaluation.keyRecommendations.length > 0) {
        addNewPageIfNeeded(15);
        doc.setTextColor(234, 179, 8);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Key Recommendations:", margin + 5, yPos);
        yPos += 6;
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const rec of evaluation.keyRecommendations) {
          addNewPageIfNeeded(10);
          const lines = wrapText(`> ${rec}`, contentWidth - 15, 9);
          for (const line of lines) {
            doc.text(line, margin + 10, yPos);
            yPos += 5;
          }
        }
      }

      yPos += 15;
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      doc.setFillColor(30, 30, 30);
      doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      doc.text(`Anker Consulting - Confidential`, margin, pageHeight - 12);
      doc.text(`Analysis Date: ${currentDate}`, pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
      
      doc.setDrawColor(142, 132, 247);
      doc.setLineWidth(0.5);
      doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
    }

    const fileName = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Anker_Analysis_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    toast({
      title: "PDF Exported",
      description: `Report saved as ${fileName}`,
    });
  };

  const handleAnalyze = async () => {
    if (!files.pitchDeck) {
      toast({
        title: "No pitch deck",
        description: "Please upload a pitch deck PDF.",
        variant: "destructive"
      });
      return;
    }

    setAnalyzing(true);
    setAnalysis(null);

    try {
      const allContent: { pitchDeck: string; dataRoom: string[]; financials: string[]; faqs: string[] } = {
        pitchDeck: '',
        dataRoom: [],
        financials: [],
        faqs: []
      };

      allContent.pitchDeck = await extractTextFromPDF(files.pitchDeck);

      if (allContent.pitchDeck.length < 100) {
        toast({
          title: "Could not extract text",
          description: "The PDF appears to be image-based or has very little text content.",
          variant: "destructive"
        });
        setAnalyzing(false);
        return;
      }

      for (const file of files.dataRoom) {
        try {
          const text = await extractTextFromPDF(file);
          if (text.length > 50) allContent.dataRoom.push(text);
        } catch (e) {
          console.warn(`Could not parse data room file: ${file.name}`);
        }
      }
      
      for (const file of files.financials) {
        try {
          const text = await extractTextFromPDF(file);
          if (text.length > 50) allContent.financials.push(text);
        } catch (e) {
          console.warn(`Could not parse financials file: ${file.name}`);
        }
      }
      
      for (const file of files.faqs) {
        try {
          const text = await extractTextFromPDF(file);
          if (text.length > 50) allContent.faqs.push(text);
        } catch (e) {
          console.warn(`Could not parse FAQ file: ${file.name}`);
        }
      }

      const response = await apiRequest("POST", "/api/pitch-deck/full-analysis", {
        pitchDeckContent: allContent.pitchDeck,
        dataRoomContent: allContent.dataRoom.join('\n\n---DOCUMENT BREAK---\n\n'),
        financialsContent: allContent.financials.join('\n\n---DOCUMENT BREAK---\n\n'),
        faqsContent: allContent.faqs.join('\n\n---DOCUMENT BREAK---\n\n'),
        hasDataRoom: allContent.dataRoom.length > 0,
        hasFinancials: allContent.financials.length > 0,
        hasFaqs: allContent.faqs.length > 0,
      });

      const data = await response.json();

      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        toast({
          title: "Analysis complete!",
          description: "Your pitch deck has been analyzed from multiple perspectives.",
        });
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis failed",
        description: "Could not analyze the pitch deck. Please try again.",
        variant: "destructive"
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const totalFiles = (files.pitchDeck ? 1 : 0) + files.dataRoom.length + files.financials.length + files.faqs.length;

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-light text-white">
                  Pitch Deck <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Analysis</span>
                </h1>
                <p className="text-white/50 font-light">AI-powered investment analysis by Anker Consulting</p>
              </div>
            </div>

            {!analysis && !analyzing && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[rgb(142,132,247)]" />
                        Pitch Deck (Required)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <input
                        ref={pitchDeckRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'pitchDeck')}
                        data-testid="input-pitch-deck-file"
                      />
                      
                      {files.pitchDeck ? (
                        <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-[rgb(142,132,247)]/30">
                          <div className="flex items-center gap-3">
                            <FileText className="w-8 h-8 text-[rgb(142,132,247)]" />
                            <div>
                              <p className="text-white text-sm font-medium">{files.pitchDeck.name}</p>
                              <p className="text-white/40 text-xs">{(files.pitchDeck.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFile('pitchDeck')}
                            className="text-white/50 hover:text-red-400"
                            data-testid="button-remove-pitch-deck"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => pitchDeckRef.current?.click()}
                          className="w-full h-24 border-dashed border-white/20 text-white/60 hover:bg-white/5"
                          data-testid="button-upload-deck"
                        >
                          <div className="text-center">
                            <Upload className="w-8 h-8 mx-auto mb-2" />
                            <span>Click to upload pitch deck PDF</span>
                          </div>
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Shield className="w-5 h-5 text-[rgb(196,227,230)]" />
                        Data Room (Optional)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <input
                        ref={dataRoomRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'dataRoom')}
                        data-testid="input-data-room-files"
                      />
                      
                      <div className="space-y-2 mb-3">
                        {files.dataRoom.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/5">
                            <span className="text-white/70 text-sm truncate">{file.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFile('dataRoom', idx)}
                              className="h-6 w-6 text-white/50 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      
                      <Button
                        variant="outline"
                        onClick={() => dataRoomRef.current?.click()}
                        className="w-full border-dashed border-white/20 text-white/60 hover:bg-white/5"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Data Room Documents
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-[rgb(234,179,8)]" />
                        Financial Documents (Optional)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <input
                        ref={financialsRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'financials')}
                        data-testid="input-financials-files"
                      />
                      
                      <div className="space-y-2 mb-3">
                        {files.financials.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/5">
                            <span className="text-white/70 text-sm truncate">{file.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFile('financials', idx)}
                              className="h-6 w-6 text-white/50 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      
                      <Button
                        variant="outline"
                        onClick={() => financialsRef.current?.click()}
                        className="w-full border-dashed border-white/20 text-white/60 hover:bg-white/5"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Financial Documents
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
                        FAQs / Supplementary (Optional)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <input
                        ref={faqsRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'faqs')}
                        data-testid="input-faq-files"
                      />
                      
                      <div className="space-y-2 mb-3">
                        {files.faqs.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded bg-white/5">
                            <span className="text-white/70 text-sm truncate">{file.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFile('faqs', idx)}
                              className="h-6 w-6 text-white/50 hover:text-red-400"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      
                      <Button
                        variant="outline"
                        onClick={() => faqsRef.current?.click()}
                        className="w-full border-dashed border-white/20 text-white/60 hover:bg-white/5"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add FAQ Documents
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-medium mb-1">Ready to Analyze</h3>
                        <p className="text-white/50 text-sm">
                          {totalFiles} document{totalFiles !== 1 ? 's' : ''} uploaded
                          {files.dataRoom.length > 0 && ` (including ${files.dataRoom.length} data room files)`}
                        </p>
                      </div>
                      <Button
                        onClick={handleAnalyze}
                        disabled={!files.pitchDeck}
                        className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0 px-8"
                        data-testid="button-analyze"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Analyze Documents
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-3 gap-6">
                  {[
                    { icon: TrendingUp, label: "VC Partner", desc: "Investment potential & market fit", color: 'rgb(142,132,247)' },
                    { icon: BarChart3, label: "Anker Consulting", desc: "Strategy & business model analysis", color: 'rgb(196,227,230)' },
                    { icon: Lightbulb, label: "Entrepreneur", desc: "Execution & practicality review", color: 'rgb(251,194,213)' },
                  ].map((perspective) => (
                    <Card key={perspective.label} className="bg-white/5 border-white/10">
                      <CardContent className="p-6 text-center">
                        <perspective.icon className="w-10 h-10 mx-auto mb-3" style={{ color: perspective.color }} />
                        <p className="text-white font-medium">{perspective.label}</p>
                        <p className="text-white/40 text-xs mt-1">{perspective.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {analyzing && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardContent className="p-12">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Loader2 className="w-10 h-10 text-[rgb(142,132,247)] animate-spin" />
                    </div>
                    <h2 className="text-2xl font-light text-white mb-3">Analyzing Your Documents</h2>
                    <p className="text-white/50 font-light mb-6">
                      Anker Consulting AI is evaluating {totalFiles} document{totalFiles !== 1 ? 's' : ''} from multiple expert perspectives...
                    </p>
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <Sparkles className="w-4 h-4 text-[rgb(142,132,247)]" />
                        <span>Extracting key information...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <Eye className="w-4 h-4 text-[rgb(142,132,247)]" />
                        <span>Cross-referencing data room...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <TrendingUp className="w-4 h-4 text-[rgb(142,132,247)]" />
                        <span>VC Partner investment evaluation...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <BarChart3 className="w-4 h-4 text-[rgb(196,227,230)]" />
                        <span>Anker Consulting strategic analysis...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <Lightbulb className="w-4 h-4 text-[rgb(251,194,213)]" />
                        <span>Entrepreneur practicality review...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                        <span>Identifying red flags and risks...</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {analysis && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <FileText className="w-5 h-5 text-[rgb(142,132,247)]" />
                    <span className="text-white font-medium">{files.pitchDeck?.name}</span>
                    {analysis.extractedInfo.companyName && (
                      <Badge variant="outline" className="border-white/20 text-white/70">
                        {analysis.extractedInfo.companyName}
                      </Badge>
                    )}
                    {analysis.enhanced?.recommendation && (
                      <Badge className={
                        analysis.enhanced.recommendation === 'INVEST' ? 'bg-emerald-500' :
                        analysis.enhanced.recommendation === 'PASS' ? 'bg-red-500' : 'bg-yellow-500'
                      }>
                        {analysis.enhanced.recommendation}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={downloadConsultingReport}
                      disabled={downloadingReport}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0 gap-2"
                      data-testid="button-consulting-report"
                    >
                      {downloadingReport ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {downloadingReport ? "Generating..." : "Consulting Report"}
                    </Button>
                    <Button
                      onClick={exportToPDF}
                      variant="outline"
                      className="border-white/20 text-white/70 hover:bg-white/10 gap-2"
                      data-testid="button-export-pdf"
                    >
                      <Download className="w-4 h-4" />
                      Quick PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFiles({ pitchDeck: null, dataRoom: [], financials: [], faqs: [] });
                        setAnalysis(null);
                      }}
                      className="border-white/20 text-white/70 hover:bg-white/10"
                      data-testid="button-analyze-new"
                    >
                      Analyze New Deck
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <Card className="bg-gradient-to-br from-[rgb(142,132,247)]/20 to-transparent border-[rgb(142,132,247)]/30">
                    <CardContent className="p-6 text-center">
                      <div className={`w-16 h-16 mx-auto mb-3 rounded-full ${gradeColors[analysis.overallGrade] || 'bg-gray-500'} flex items-center justify-center`}>
                        <span className="text-2xl font-bold text-white">{analysis.overallGrade}</span>
                      </div>
                      <p className="text-white font-medium">Overall Grade</p>
                      <p className="text-white/50 text-sm">{analysis.overallScore}/100</p>
                    </CardContent>
                  </Card>

                  {analysis.evaluations.map((evaluation) => {
                    const Icon = perspectiveIcons[evaluation.evaluatorType] || Briefcase;
                    const color = perspectiveColors[evaluation.evaluatorType] || 'rgb(142,132,247)';
                    return (
                      <Card key={evaluation.evaluatorType} className="bg-white/5 border-white/10">
                        <CardContent className="p-6 text-center">
                          <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
                            <Icon className="w-6 h-6" style={{ color }} />
                          </div>
                          <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white mb-2 ${gradeColors[evaluation.grade] || 'bg-gray-500'}`}>
                            {evaluation.grade}
                          </div>
                          <p className="text-white text-sm font-medium">{evaluation.evaluatorName}</p>
                          <p className="text-white/50 text-xs">{evaluation.overallScore}/100</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {analysis.enhanced?.redFlags && analysis.enhanced.redFlags.length > 0 && (
                  <Card className="bg-red-500/10 border-red-500/30">
                    <CardHeader>
                      <CardTitle className="text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Red Flags
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {analysis.enhanced.redFlags.map((flag, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10">
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <span className="text-white/80 text-sm">{flag}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="bg-white/5 border border-white/10 p-1 flex-wrap">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                      Overview
                    </TabsTrigger>
                    {analysis.enhanced && (
                      <>
                        <TabsTrigger value="market" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                          Market
                        </TabsTrigger>
                        <TabsTrigger value="business" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                          Business Model
                        </TabsTrigger>
                        <TabsTrigger value="team" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                          Team
                        </TabsTrigger>
                        <TabsTrigger value="financials" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                          Financials
                        </TabsTrigger>
                        <TabsTrigger value="risks" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                          Risks
                        </TabsTrigger>
                      </>
                    )}
                    <TabsTrigger value="best-practices" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                      Best Practices
                    </TabsTrigger>
                    {analysis.evaluations.map((evaluation) => (
                      <TabsTrigger 
                        key={evaluation.evaluatorType} 
                        value={evaluation.evaluatorType}
                        className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60"
                      >
                        {evaluation.evaluatorType === 'mbb' ? 'Anker' : evaluation.evaluatorName}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="overview" className="mt-6 space-y-6">
                    <Card className="bg-white/5 border-white/10">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">Executive Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-white/70 whitespace-pre-wrap">{analysis.executiveSummary}</div>
                      </CardContent>
                    </Card>

                    {analysis.enhanced?.criticalAssessment && (
                      <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white text-lg flex items-center gap-2">
                            <Eye className="w-5 h-5 text-[rgb(142,132,247)]" />
                            Critical Assessment
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-white/70">{analysis.enhanced.criticalAssessment}</p>
                        </CardContent>
                      </Card>
                    )}

                    {analysis.enhanced?.investmentThesis && (
                      <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white text-lg flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-[rgb(142,132,247)]" />
                            Investment Thesis
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-white/70">{analysis.enhanced.investmentThesis}</p>
                        </CardContent>
                      </Card>
                    )}

                    {analysis.enhanced && (
                      <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white text-lg">Scoring Matrix</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {[
                              { name: "Market Opportunity", score: analysis.enhanced.marketOpportunity?.score || 0, icon: Target },
                              { name: "Business Model", score: analysis.enhanced.businessModel?.score || 0, icon: Building2 },
                              { name: "Team", score: analysis.enhanced.team?.score || 0, icon: Users },
                              { name: "Competitive Position", score: analysis.enhanced.competitive?.score || 0, icon: Shield },
                              { name: "Financials", score: analysis.enhanced.financials?.score || 0, icon: DollarSign },
                              { name: "Deck Quality", score: analysis.enhanced.deckQuality?.overallScore || 0, icon: FileText },
                            ].map((item) => (
                              <div key={item.name} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <item.icon className="w-4 h-4 text-[rgb(142,132,247)]" />
                                    <span className="text-white text-sm">{item.name}</span>
                                  </div>
                                  <span className={`text-sm font-medium ${getScoreColor(item.score)}`}>
                                    {item.score}/100
                                  </span>
                                </div>
                                <Progress value={item.score} className="h-2" />
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {analysis.extractedInfo.companyName && (
                      <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white text-lg">Company Overview</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            {analysis.extractedInfo.companyName && (
                              <div>
                                <p className="text-white/50 text-sm">Company</p>
                                <p className="text-white">{analysis.extractedInfo.companyName}</p>
                              </div>
                            )}
                            {analysis.extractedInfo.stage && (
                              <div>
                                <p className="text-white/50 text-sm">Stage</p>
                                <p className="text-white">{analysis.extractedInfo.stage}</p>
                              </div>
                            )}
                            {analysis.extractedInfo.industries && analysis.extractedInfo.industries.length > 0 && (
                              <div className="col-span-2">
                                <p className="text-white/50 text-sm mb-2">Industries</p>
                                <div className="flex flex-wrap gap-2">
                                  {analysis.extractedInfo.industries.map((ind, idx) => (
                                    <Badge key={idx} variant="outline" className="border-[rgb(142,132,247)]/30 text-[rgb(142,132,247)]">
                                      {ind}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {analysis.extractedInfo.description && (
                              <div className="col-span-2">
                                <p className="text-white/50 text-sm">Description</p>
                                <p className="text-white/70">{analysis.extractedInfo.description}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                      <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white text-lg flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                            Key Strengths
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(analysis.enhanced?.strengths || analysis.evaluations[0]?.strengths || []).slice(0, 5).map((strength, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Star className="w-3 h-3 text-emerald-400" />
                              </div>
                              <p className="text-white/70 text-sm">{strength}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                          <CardTitle className="text-white text-lg flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-orange-400" />
                            Key Concerns
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(analysis.enhanced?.concerns || analysis.evaluations[0]?.keyRecommendations || []).slice(0, 5).map((concern, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-orange-400 text-xs font-medium">{idx + 1}</span>
                              </div>
                              <p className="text-white/70 text-sm">{concern}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {analysis.enhanced && (
                    <>
                      <TabsContent value="market" className="mt-6 space-y-6">
                        <Card className="bg-white/5 border-white/10">
                          <CardHeader>
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                              <Target className="w-5 h-5 text-[rgb(34,197,94)]" />
                              Market Opportunity
                              <Badge className={`ml-auto ${getScoreColor(analysis.enhanced.marketOpportunity?.score || 0).replace('text-', 'bg-').replace('-400', '-500/20')} ${getScoreColor(analysis.enhanced.marketOpportunity?.score || 0)}`}>
                                {analysis.enhanced.marketOpportunity?.score || 0}/100
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 gap-6 mb-6">
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-white/50 text-sm">TAM (Claimed)</p>
                                <p className="text-white text-xl font-medium">{analysis.enhanced.marketOpportunity?.tamClaimed || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-white/50 text-sm">TAM (Realistic)</p>
                                <p className="text-emerald-400 text-xl font-medium">{analysis.enhanced.marketOpportunity?.tamRealistic || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-white/50 text-sm">SAM Estimate</p>
                                <p className="text-white text-xl font-medium">{analysis.enhanced.marketOpportunity?.samEstimate || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                                <p className="text-white/50 text-sm">Market Growth</p>
                                <p className="text-white text-xl font-medium">{analysis.enhanced.marketOpportunity?.marketGrowth || 'N/A'}</p>
                              </div>
                            </div>
                            
                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 mb-4">
                              <p className="text-white/50 text-sm mb-2">Assessment</p>
                              <p className="text-white/70">{analysis.enhanced.marketOpportunity?.assessment}</p>
                            </div>

                            {analysis.enhanced.marketOpportunity?.redFlags && analysis.enhanced.marketOpportunity.redFlags.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-red-400 text-sm font-medium">Market Red Flags:</p>
                                {analysis.enhanced.marketOpportunity.redFlags.map((flag, idx) => (
                                  <div key={idx} className="flex items-start gap-2 p-2 rounded bg-red-500/10">
                                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-white/70 text-sm">{flag}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="business" className="mt-6 space-y-6">
                        <Card className="bg-white/5 border-white/10">
                          <CardHeader>
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-[rgb(142,132,247)]" />
                              Business Model & Unit Economics
                              <Badge className={`ml-auto ${getScoreColor(analysis.enhanced.businessModel?.score || 0).replace('text-', 'bg-').replace('-400', '-500/20')} ${getScoreColor(analysis.enhanced.businessModel?.score || 0)}`}>
                                {analysis.enhanced.businessModel?.score || 0}/100
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {analysis.enhanced.businessModel?.revenueStreams && (
                              <div className="mb-6">
                                <p className="text-white/50 text-sm mb-2">Revenue Streams</p>
                                <div className="flex flex-wrap gap-2">
                                  {analysis.enhanced.businessModel.revenueStreams.map((stream, idx) => (
                                    <Badge key={idx} variant="outline" className="border-[rgb(142,132,247)]/30 text-[rgb(142,132,247)]">
                                      {stream}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-4 gap-4 mb-6">
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">CAC</p>
                                <p className="text-white font-medium">{analysis.enhanced.businessModel?.unitEconomics?.cac || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">LTV</p>
                                <p className="text-white font-medium">{analysis.enhanced.businessModel?.unitEconomics?.ltv || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">LTV:CAC</p>
                                <p className="text-emerald-400 font-medium">{analysis.enhanced.businessModel?.unitEconomics?.ltvCacRatio || 'N/A'}x</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">Payback</p>
                                <p className="text-white font-medium">{analysis.enhanced.businessModel?.unitEconomics?.paybackPeriod || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 mb-4">
                              <p className="text-white/50 text-sm mb-2">Scalability Assessment</p>
                              <p className="text-white/70">{analysis.enhanced.businessModel?.scalability}</p>
                            </div>

                            {analysis.enhanced.businessModel?.concerns && analysis.enhanced.businessModel.concerns.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-orange-400 text-sm font-medium">Business Model Concerns:</p>
                                {analysis.enhanced.businessModel.concerns.map((concern, idx) => (
                                  <div key={idx} className="flex items-start gap-2 p-2 rounded bg-orange-500/10">
                                    <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-white/70 text-sm">{concern}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="team" className="mt-6 space-y-6">
                        <Card className="bg-white/5 border-white/10">
                          <CardHeader>
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                              <Users className="w-5 h-5 text-[rgb(251,194,213)]" />
                              Team Evaluation
                              <Badge className={`ml-auto ${getScoreColor(analysis.enhanced.team?.score || 0).replace('text-', 'bg-').replace('-400', '-500/20')} ${getScoreColor(analysis.enhanced.team?.score || 0)}`}>
                                {analysis.enhanced.team?.score || 0}/100
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {analysis.enhanced.team?.founders && analysis.enhanced.team.founders.length > 0 && (
                              <div className="space-y-4 mb-6">
                                {analysis.enhanced.team.founders.map((founder, idx) => (
                                  <div key={idx} className="p-4 rounded-lg bg-white/5 border border-white/10">
                                    <div className="flex items-start gap-3">
                                      <div className="w-10 h-10 rounded-full bg-[rgb(251,194,213)]/20 flex items-center justify-center flex-shrink-0">
                                        <Users className="w-5 h-5 text-[rgb(251,194,213)]" />
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-white font-medium">{founder.name}</p>
                                        <p className="text-[rgb(251,194,213)] text-sm">{founder.role}</p>
                                        <p className="text-white/50 text-sm mt-1">{founder.background}</p>
                                        <p className="text-white/70 text-sm mt-2 italic">{founder.assessment}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-6">
                              {analysis.enhanced.team?.strengths && analysis.enhanced.team.strengths.length > 0 && (
                                <div>
                                  <p className="text-emerald-400 text-sm font-medium mb-2">Team Strengths</p>
                                  {analysis.enhanced.team.strengths.map((strength, idx) => (
                                    <div key={idx} className="flex items-start gap-2 mb-2">
                                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                      <span className="text-white/70 text-sm">{strength}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {analysis.enhanced.team?.gaps && analysis.enhanced.team.gaps.length > 0 && (
                                <div>
                                  <p className="text-orange-400 text-sm font-medium mb-2">Team Gaps</p>
                                  {analysis.enhanced.team.gaps.map((gap, idx) => (
                                    <div key={idx} className="flex items-start gap-2 mb-2">
                                      <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                      <span className="text-white/70 text-sm">{gap}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="financials" className="mt-6 space-y-6">
                        <Card className="bg-white/5 border-white/10">
                          <CardHeader>
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                              <DollarSign className="w-5 h-5 text-[rgb(234,179,8)]" />
                              Financial Analysis
                              <Badge className={`ml-auto ${getScoreColor(analysis.enhanced.financials?.score || 0).replace('text-', 'bg-').replace('-400', '-500/20')} ${getScoreColor(analysis.enhanced.financials?.score || 0)}`}>
                                {analysis.enhanced.financials?.score || 0}/100
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-3 gap-4 mb-6">
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">Current Revenue</p>
                                <p className="text-white font-medium">{analysis.enhanced.financials?.currentRevenue || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">Burn Rate</p>
                                <p className="text-orange-400 font-medium">{analysis.enhanced.financials?.burnRate || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">Runway</p>
                                <p className="text-white font-medium">{analysis.enhanced.financials?.runway || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="p-4 rounded-lg bg-[rgb(142,132,247)]/10 border border-[rgb(142,132,247)]/30 text-center">
                                <p className="text-white/50 text-xs mb-1">Ask Amount</p>
                                <p className="text-[rgb(142,132,247)] text-xl font-medium">{analysis.enhanced.financials?.askAmount || 'N/A'}</p>
                              </div>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                                <p className="text-white/50 text-xs mb-1">Valuation</p>
                                <p className="text-white text-xl font-medium">{analysis.enhanced.financials?.valuation || 'N/A'}</p>
                              </div>
                            </div>

                            {analysis.enhanced.financials?.projections && (
                              <div className="mb-6">
                                <p className="text-white/50 text-sm mb-3">Revenue Projections</p>
                                <div className="flex gap-2">
                                  {[
                                    { year: 'Y1', value: analysis.enhanced.financials.projections.year1 },
                                    { year: 'Y2', value: analysis.enhanced.financials.projections.year2 },
                                    { year: 'Y3', value: analysis.enhanced.financials.projections.year3 },
                                    { year: 'Y4', value: analysis.enhanced.financials.projections.year4 },
                                    { year: 'Y5', value: analysis.enhanced.financials.projections.year5 },
                                  ].map((proj, idx) => (
                                    <div key={idx} className="flex-1 p-3 rounded bg-white/5 text-center">
                                      <p className="text-white/50 text-xs">{proj.year}</p>
                                      <p className="text-white text-sm font-medium">
                                        ${(proj.value / 1000000).toFixed(1)}M
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="p-4 rounded-lg bg-white/5 border border-white/10 mb-4">
                              <p className="text-white/50 text-sm mb-2">Projections Assessment</p>
                              <p className="text-white/70">{analysis.enhanced.financials?.projectionsAssessment}</p>
                            </div>

                            {analysis.enhanced.financials?.concerns && analysis.enhanced.financials.concerns.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-orange-400 text-sm font-medium">Financial Concerns:</p>
                                {analysis.enhanced.financials.concerns.map((concern, idx) => (
                                  <div key={idx} className="flex items-start gap-2 p-2 rounded bg-orange-500/10">
                                    <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-white/70 text-sm">{concern}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="risks" className="mt-6 space-y-6">
                        <Card className="bg-white/5 border-white/10">
                          <CardHeader>
                            <CardTitle className="text-white text-lg flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-red-400" />
                              Risk Assessment
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {analysis.enhanced.risks && analysis.enhanced.risks.length > 0 ? (
                              <div className="space-y-4">
                                {analysis.enhanced.risks.map((risk, idx) => (
                                  <div key={idx} className={`p-4 rounded-lg border ${getSeverityColor(risk.severity)}`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium">{risk.category}</span>
                                      <Badge className={getSeverityColor(risk.severity)}>
                                        {risk.severity}
                                      </Badge>
                                    </div>
                                    <p className="text-white/70 text-sm mb-2">{risk.description}</p>
                                    <p className="text-white/50 text-xs">
                                      <span className="font-medium">Mitigation:</span> {risk.mitigation}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-white/50 text-center py-8">No risks identified</p>
                            )}
                          </CardContent>
                        </Card>

                        {analysis.enhanced.dataRoomFindings && (
                          <Card className="bg-white/5 border-white/10">
                            <CardHeader>
                              <CardTitle className="text-white text-lg flex items-center gap-2">
                                <Shield className="w-5 h-5 text-[rgb(196,227,230)]" />
                                Data Room Findings
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="p-4 rounded-lg bg-white/5 border border-white/10 mb-4">
                                <p className="text-white/50 text-sm mb-1">Data Quality</p>
                                <p className="text-white">{analysis.enhanced.dataRoomFindings.quality}</p>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                {analysis.enhanced.dataRoomFindings.missingDocuments && analysis.enhanced.dataRoomFindings.missingDocuments.length > 0 && (
                                  <div>
                                    <p className="text-orange-400 text-sm font-medium mb-2">Missing Documents</p>
                                    {analysis.enhanced.dataRoomFindings.missingDocuments.map((doc, idx) => (
                                      <div key={idx} className="flex items-start gap-2 mb-1">
                                        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-white/70 text-sm">{doc}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {analysis.enhanced.dataRoomFindings.positiveFindings && analysis.enhanced.dataRoomFindings.positiveFindings.length > 0 && (
                                  <div>
                                    <p className="text-emerald-400 text-sm font-medium mb-2">Positive Findings</p>
                                    {analysis.enhanced.dataRoomFindings.positiveFindings.map((finding, idx) => (
                                      <div key={idx} className="flex items-start gap-2 mb-1">
                                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                        <span className="text-white/70 text-sm">{finding}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {analysis.enhanced.recommendation && (
                          <Card className="bg-gradient-to-br from-[rgb(142,132,247)]/20 to-transparent border-[rgb(142,132,247)]/30">
                            <CardHeader>
                              <CardTitle className="text-white text-lg flex items-center gap-2">
                                <Briefcase className="w-5 h-5 text-[rgb(142,132,247)]" />
                                Final Recommendation
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-center mb-6">
                                <Badge className={`text-lg px-6 py-2 ${
                                  analysis.enhanced.recommendation === 'INVEST' ? 'bg-emerald-500' :
                                  analysis.enhanced.recommendation === 'PASS' ? 'bg-red-500' : 'bg-yellow-500'
                                }`}>
                                  {analysis.enhanced.recommendation}
                                </Badge>
                              </div>
                              
                              <p className="text-white/70 mb-4">{analysis.enhanced.recommendationRationale}</p>

                              {analysis.enhanced.investmentStructure && analysis.enhanced.investmentStructure !== 'N/A' && (
                                <div className="p-4 rounded-lg bg-white/5 border border-white/10 mb-4">
                                  <p className="text-white/50 text-sm mb-1">Suggested Investment Structure</p>
                                  <p className="text-white">{analysis.enhanced.investmentStructure}</p>
                                </div>
                              )}

                              {analysis.enhanced.nextSteps && analysis.enhanced.nextSteps.length > 0 && (
                                <div>
                                  <p className="text-[rgb(142,132,247)] text-sm font-medium mb-2">Next Steps</p>
                                  {analysis.enhanced.nextSteps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-2 mb-2">
                                      <span className="text-[rgb(142,132,247)] text-sm font-medium">{idx + 1}.</span>
                                      <span className="text-white/70 text-sm">{step}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </TabsContent>
                    </>
                  )}

                  <TabsContent value="best-practices" className="mt-6">
                    <div className="grid grid-cols-2 gap-4">
                      {analysis.bestPractices.map((bp, idx) => {
                        const statusStyle = statusColors[bp.status] || statusColors.missing;
                        const StatusIcon = statusStyle.icon;
                        return (
                          <Card key={idx} className="bg-white/5 border-white/10">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-lg ${statusStyle.bg} flex items-center justify-center flex-shrink-0`}>
                                  <StatusIcon className={`w-4 h-4 ${statusStyle.text}`} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-2 gap-2">
                                    <h3 className="text-white font-medium">{bp.category}</h3>
                                    <Badge 
                                      variant="outline" 
                                      className={`${statusStyle.text} border-current capitalize`}
                                    >
                                      {bp.status}
                                    </Badge>
                                  </div>
                                  <ul className="space-y-1">
                                    {bp.practices.map((practice, pIdx) => (
                                      <li key={pIdx} className="text-white/50 text-sm flex items-start gap-2">
                                        <span className="w-1 h-1 rounded-full bg-white/30 flex-shrink-0 mt-2" />
                                        {practice}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </TabsContent>

                  {analysis.evaluations.map((evaluation) => {
                    const color = perspectiveColors[evaluation.evaluatorType] || 'rgb(142,132,247)';
                    const displayName = evaluation.evaluatorType === 'mbb' ? 'Anker Consulting' : evaluation.evaluatorName;
                    return (
                      <TabsContent key={evaluation.evaluatorType} value={evaluation.evaluatorType} className="mt-6">
                        <div className="space-y-6">
                          <Card className="bg-white/5 border-white/10">
                            <CardHeader>
                              <div className="flex items-center justify-between gap-2">
                                <CardTitle className="text-white text-lg">{displayName}</CardTitle>
                                <Badge className={`${gradeColors[evaluation.grade] || 'bg-gray-500'} text-white border-0`}>
                                  {evaluation.grade} - {evaluation.overallScore}/100
                                </Badge>
                              </div>
                              <p className="text-white/50 text-sm">{evaluation.evaluatorDescription}</p>
                            </CardHeader>
                            <CardContent>
                              <p className="text-white/70">{evaluation.summary}</p>
                              <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                <p className="text-white/50 text-sm mb-1">Investment Readiness</p>
                                <p className="text-white">{evaluation.investmentReadiness}</p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-white/5 border-white/10">
                            <CardHeader>
                              <CardTitle className="text-white text-lg">Section Scores</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-4">
                                {evaluation.sections.map((section, idx) => (
                                  <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-white font-medium">{section.name}</span>
                                      <span className="text-white/50 text-sm">{section.score}/100</span>
                                    </div>
                                    <Progress value={section.score} className="h-2 mb-3" />
                                    <p className="text-white/50 text-sm mb-2">{section.feedback}</p>
                                    {section.suggestions.length > 0 && (
                                      <div className="space-y-1">
                                        {section.suggestions.map((sug, sIdx) => (
                                          <div key={sIdx} className="flex items-start gap-2 text-white/40 text-xs">
                                            <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color }} />
                                            {sug}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>

                          <div className="grid grid-cols-2 gap-6">
                            <Card className="bg-white/5 border-white/10">
                              <CardHeader>
                                <CardTitle className="text-white text-lg flex items-center gap-2">
                                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                                  Strengths
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {evaluation.strengths.map((strength, idx) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 mt-2" />
                                    <p className="text-white/70 text-sm">{strength}</p>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>

                            <Card className="bg-white/5 border-white/10">
                              <CardHeader>
                                <CardTitle className="text-white text-lg flex items-center gap-2">
                                  <AlertCircle className="w-5 h-5 text-orange-400" />
                                  Weaknesses
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {evaluation.weaknesses.map((weakness, idx) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 mt-2" />
                                    <p className="text-white/70 text-sm">{weakness}</p>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          </div>

                          <Card className="bg-white/5 border-white/10">
                            <CardHeader>
                              <CardTitle className="text-white text-lg flex items-center gap-2">
                                <Target className="w-5 h-5" style={{ color }} />
                                Key Recommendations
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                {evaluation.keyRecommendations.map((rec, idx) => (
                                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
                                      <span className="text-xs font-medium" style={{ color }}>{idx + 1}</span>
                                    </div>
                                    <p className="text-white/70 text-sm">{rec}</p>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
