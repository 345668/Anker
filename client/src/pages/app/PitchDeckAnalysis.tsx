import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  Upload, FileText, Sparkles, Loader2, AlertCircle, CheckCircle,
  TrendingUp, Target, Lightbulb, Star, BarChart3, Briefcase, Download
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

interface FullAnalysis {
  extractedInfo: ExtractedStartupInfo;
  evaluations: PerspectiveEvaluation[];
  bestPractices: BestPracticeCheck[];
  overallGrade: string;
  overallScore: number;
  executiveSummary: string;
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

export default function PitchDeckAnalysis() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const exportToPDF = () => {
    if (!analysis) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;

    const addNewPageIfNeeded = (requiredSpace: number) => {
      if (yPos + requiredSpace > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      doc.setFontSize(fontSize);
      return doc.splitTextToSize(text, maxWidth);
    };

    doc.setFillColor(18, 18, 18);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setFillColor(142, 132, 247);
    doc.roundedRect(margin, yPos, contentWidth, 50, 3, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("Pitch Deck Analysis Report", margin + 10, yPos + 20);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const companyName = analysis.extractedInfo.companyName || "Unknown Company";
    doc.text(companyName, margin + 10, yPos + 35);

    yPos += 60;

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

    yPos += 10;

    for (const evaluation of analysis.evaluations) {
      addNewPageIfNeeded(80);
      
      const evalColor = evaluation.evaluatorType === 'vc' ? [142, 132, 247] :
                        evaluation.evaluatorType === 'mbb' ? [196, 227, 230] :
                        [251, 194, 213];
      
      doc.setFillColor(evalColor[0], evalColor[1], evalColor[2]);
      doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');
      
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`${evaluation.evaluatorName} Perspective`, margin + 10, yPos + 10);
      
      doc.setFontSize(12);
      doc.text(`Grade: ${evaluation.grade} (${evaluation.overallScore}/100)`, margin + 10, yPos + 20);
      
      yPos += 35;

      if (evaluation.strengths.length > 0) {
        doc.setTextColor(16, 185, 129);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Strengths:", margin + 5, yPos);
        yPos += 7;
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const strength of evaluation.strengths.slice(0, 3)) {
          addNewPageIfNeeded(12);
          const lines = wrapText(`• ${strength}`, contentWidth - 15, 9);
          for (const line of lines) {
            doc.text(line, margin + 10, yPos);
            yPos += 5;
          }
        }
        yPos += 5;
      }

      if (evaluation.weaknesses.length > 0) {
        addNewPageIfNeeded(20);
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Areas for Improvement:", margin + 5, yPos);
        yPos += 7;
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const weakness of evaluation.weaknesses.slice(0, 3)) {
          addNewPageIfNeeded(12);
          const lines = wrapText(`• ${weakness}`, contentWidth - 15, 9);
          for (const line of lines) {
            doc.text(line, margin + 10, yPos);
            yPos += 5;
          }
        }
        yPos += 5;
      }

      if (evaluation.keyRecommendations.length > 0) {
        addNewPageIfNeeded(20);
        doc.setTextColor(234, 179, 8);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Key Recommendations:", margin + 5, yPos);
        yPos += 7;
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        for (const rec of evaluation.keyRecommendations.slice(0, 3)) {
          addNewPageIfNeeded(12);
          const lines = wrapText(`• ${rec}`, contentWidth - 15, 9);
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
      
      doc.text(`Evaluated by Anker Intelligence`, margin, pageHeight - 12);
      doc.text(`Analysis Date: ${currentDate}`, pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
      
      doc.setDrawColor(142, 132, 247);
      doc.setLineWidth(0.5);
      doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
    }

    const fileName = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Pitch_Analysis_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    toast({
      title: "PDF Exported",
      description: `Report saved as ${fileName}`,
    });
  };

  const handleFileUpload = async (uploadedFile: File) => {
    if (!uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: "Invalid file",
        description: "Please upload a PDF file.",
        variant: "destructive"
      });
      return;
    }

    setFile(uploadedFile);
    setAnalyzing(true);
    setAnalysis(null);

    try {
      const pitchDeckContent = await extractTextFromPDF(uploadedFile);

      if (pitchDeckContent.length < 100) {
        toast({
          title: "Could not extract text",
          description: "The PDF appears to be image-based or has very little text content.",
          variant: "destructive"
        });
        setAnalyzing(false);
        return;
      }

      const response = await apiRequest("POST", "/api/pitch-deck/full-analysis", {
        pitchDeckContent
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
                <p className="text-white/50 font-light">AI-powered evaluation from multiple expert perspectives</p>
              </div>
            </div>

            {!analysis && !analyzing && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardContent className="p-12">
                  <div className="text-center max-w-2xl mx-auto">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 flex items-center justify-center">
                      <Upload className="w-10 h-10 text-[rgb(142,132,247)]" />
                    </div>
                    <h2 className="text-2xl font-light text-white mb-3">Upload Your Pitch Deck</h2>
                    <p className="text-white/50 font-light mb-8">
                      Get comprehensive feedback from three expert perspectives: VC Partner, McKinsey Consultant, and Serial Entrepreneur
                    </p>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      data-testid="input-pitch-deck-file"
                    />

                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0 px-8 py-6 text-lg"
                      data-testid="button-upload-deck"
                    >
                      <Upload className="w-5 h-5 mr-2" />
                      Select PDF File
                    </Button>

                    <div className="mt-8 grid grid-cols-3 gap-6">
                      {[
                        { icon: TrendingUp, label: "VC Partner", desc: "Investment potential & market fit" },
                        { icon: BarChart3, label: "McKinsey", desc: "Strategy & business model" },
                        { icon: Lightbulb, label: "Entrepreneur", desc: "Execution & practicality" },
                      ].map((perspective) => (
                        <div key={perspective.label} className="p-4 rounded-xl border border-white/10 bg-white/5">
                          <perspective.icon className="w-8 h-8 text-[rgb(142,132,247)] mx-auto mb-2" />
                          <p className="text-white font-medium text-sm">{perspective.label}</p>
                          <p className="text-white/40 text-xs">{perspective.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {analyzing && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardContent className="p-12">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Loader2 className="w-10 h-10 text-[rgb(142,132,247)] animate-spin" />
                    </div>
                    <h2 className="text-2xl font-light text-white mb-3">Analyzing Your Pitch Deck</h2>
                    <p className="text-white/50 font-light mb-6">
                      Our AI is evaluating "{file?.name}" from multiple expert perspectives...
                    </p>
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <Sparkles className="w-4 h-4 text-[rgb(142,132,247)]" />
                        <span>Extracting key information...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <TrendingUp className="w-4 h-4 text-[rgb(142,132,247)]" />
                        <span>VC Partner evaluation...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <BarChart3 className="w-4 h-4 text-[rgb(196,227,230)]" />
                        <span>McKinsey strategic analysis...</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <Lightbulb className="w-4 h-4 text-[rgb(251,194,213)]" />
                        <span>Entrepreneur practicality review...</span>
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
                    <span className="text-white font-medium">{file?.name}</span>
                    {analysis.extractedInfo.companyName && (
                      <Badge variant="outline" className="border-white/20 text-white/70">
                        {analysis.extractedInfo.companyName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={exportToPDF}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0 gap-2"
                      data-testid="button-export-pdf"
                    >
                      <Download className="w-4 h-4" />
                      Export PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFile(null);
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

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="bg-white/5 border border-white/10 p-1">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="best-practices" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60">
                      Best Practices
                    </TabsTrigger>
                    {analysis.evaluations.map((evaluation) => (
                      <TabsTrigger 
                        key={evaluation.evaluatorType} 
                        value={evaluation.evaluatorType}
                        className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60"
                      >
                        {evaluation.evaluatorName}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="overview" className="mt-6">
                    <Card className="bg-white/5 border-white/10 mb-6">
                      <CardHeader>
                        <CardTitle className="text-white text-lg">Executive Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-white/70 whitespace-pre-wrap">{analysis.executiveSummary}</div>
                      </CardContent>
                    </Card>

                    {analysis.extractedInfo.companyName && (
                      <Card className="bg-white/5 border-white/10 mb-6">
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
                          {analysis.evaluations[0]?.strengths.slice(0, 5).map((strength, idx) => (
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
                            <Target className="w-5 h-5 text-orange-400" />
                            Key Recommendations
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {analysis.evaluations[0]?.keyRecommendations.slice(0, 5).map((rec, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-orange-400 text-xs font-medium">{idx + 1}</span>
                              </div>
                              <p className="text-white/70 text-sm">{rec}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

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
                                  <div className="flex items-center justify-between mb-2">
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
                    return (
                      <TabsContent key={evaluation.evaluatorType} value={evaluation.evaluatorType} className="mt-6">
                        <div className="space-y-6">
                          <Card className="bg-white/5 border-white/10">
                            <CardHeader>
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-white text-lg">{evaluation.evaluatorName}</CardTitle>
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
