import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Plus, 
  Rocket, 
  Globe, 
  MapPin, 
  Users, 
  DollarSign,
  MoreVertical,
  Edit,
  Eye,
  Trash2,
  ExternalLink,
  FileText,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Target,
  TrendingUp,
  Building2,
  Lightbulb,
  X,
  FolderOpen,
  Table,
  Calculator,
  HelpCircle,
  FileQuestion,
  ArrowLeft,
  StickyNote,
  Save,
} from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { extractTextFromPDF } from "@/lib/pdf-parser";
import type { Startup, StartupDocument, DocumentType } from "@shared/schema";

const DOCUMENT_TYPE_CONFIG: Record<DocumentType, { label: string; icon: any; description: string }> = {
  pitch_deck: { label: "Pitch Deck", icon: FileText, description: "Your investor presentation" },
  cap_table: { label: "Cap Table", icon: Table, description: "Ownership and equity structure" },
  financials: { label: "Financials", icon: Calculator, description: "Financial statements and projections" },
  faq: { label: "FAQ", icon: HelpCircle, description: "Frequently asked questions" },
  data_room: { label: "Data Room", icon: FolderOpen, description: "Due diligence documents" },
  term_sheet: { label: "Term Sheet", icon: FileQuestion, description: "Investment terms" },
  additional: { label: "Additional", icon: FileText, description: "Other supporting documents" },
};

const stages = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+"];
const fundingStatuses = ["Actively Raising", "Open to Investors", "Not Currently Raising"];
const industries = [
  "AI/ML", "SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", 
  "CleanTech", "Cybersecurity", "Blockchain", "Consumer", "Enterprise", "Other"
];

interface PitchDeckAnalysis {
  overallScore: number;
  categoryScores: {
    problem: number;
    solution: number;
    market: number;
    businessModel: number;
    traction: number;
    team: number;
    financials: number;
    competition: number;
    ask: number;
    presentation: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{
    category: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
  }>;
  summary: string;
}

export default function MyStartups() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedStartup, setSelectedStartup] = useState<Startup | null>(null);
  const [viewingStartupId, setViewingStartupId] = useState<string | null>(null);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PitchDeckAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [uploadingDocType, setUploadingDocType] = useState<DocumentType | null>(null);
  const [startupNotes, setStartupNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    tagline: "",
    description: "",
    website: "",
    stage: "",
    fundingStatus: "",
    location: "",
    teamSize: "",
    industries: [] as string[],
    targetAmount: "",
    isPublic: false,
  });

  const { data: startups = [], isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/startups", {
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        website: data.website,
        stage: data.stage,
        fundingStatus: data.fundingStatus,
        location: data.location,
        teamSize: data.teamSize ? parseInt(data.teamSize) : null,
        industries: data.industries,
        targetAmount: data.targetAmount ? parseInt(data.targetAmount) : null,
        isPublic: data.isPublic,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: "Startup created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create startup", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/startups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      toast({ title: "Startup deleted" });
    },
  });

  const analyzePitchDeckMutation = useMutation({
    mutationFn: async ({ startupId, content }: { startupId: string; content: string }) => {
      const res = await apiRequest("POST", `/api/startups/${startupId}/analyze-pitch-deck`, { content });
      return res.json() as Promise<PitchDeckAnalysis>;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      setIsAnalyzing(false);
      toast({ title: "Pitch deck analysis complete" });
    },
    onError: (error: Error) => {
      setIsAnalyzing(false);
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    },
  });

  // Documents query
  const { data: documents = [], isLoading: documentsLoading } = useQuery<StartupDocument[]>({
    queryKey: ["/api/startups", viewingStartupId, "documents"],
    queryFn: async () => {
      if (!viewingStartupId) return [];
      const res = await fetch(`/api/startups/${viewingStartupId}/documents`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!viewingStartupId,
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ startupId, type, name, fileName, content }: { 
      startupId: string; 
      type: DocumentType; 
      name: string; 
      fileName: string; 
      content?: string;
    }) => {
      const res = await apiRequest("POST", `/api/startups/${startupId}/documents`, {
        type,
        name,
        fileName,
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups", viewingStartupId, "documents"] });
      setUploadingDocType(null);
      toast({ title: "Document uploaded successfully" });
    },
    onError: () => {
      setUploadingDocType(null);
      toast({ title: "Failed to upload document", variant: "destructive" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ startupId, docId }: { startupId: string; docId: string }) => {
      return apiRequest("DELETE", `/api/startups/${startupId}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups", viewingStartupId, "documents"] });
      toast({ title: "Document deleted" });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async ({ startupId, notes }: { startupId: string; notes: string }) => {
      const res = await apiRequest("PATCH", `/api/startups/${startupId}/notes`, { notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      toast({ title: "Notes saved" });
    },
  });

  const viewingStartup = startups.find(s => s.id === viewingStartupId);

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !viewingStartupId || !uploadingDocType) return;

    let content: string | undefined;
    
    if (file.type === "application/pdf") {
      try {
        content = await extractTextFromPDF(file);
      } catch (e) {
        console.error("Failed to extract PDF text:", e);
      }
    }

    uploadDocumentMutation.mutate({
      startupId: viewingStartupId,
      type: uploadingDocType,
      name: DOCUMENT_TYPE_CONFIG[uploadingDocType].label,
      fileName: file.name,
      content,
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      tagline: "",
      description: "",
      website: "",
      stage: "",
      fundingStatus: "",
      location: "",
      teamSize: "",
      industries: [],
      targetAmount: "",
      isPublic: false,
    });
  };

  const handleIndustryToggle = (industry: string) => {
    setFormData(prev => ({
      ...prev,
      industries: prev.industries.includes(industry)
        ? prev.industries.filter(i => i !== industry)
        : [...prev.industries, industry],
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedStartup) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Please upload a PDF file", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setShowAnalysisDialog(true);

    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => Math.min(prev + 10, 90));
    }, 500);

    try {
      const text = await extractTextFromPDF(file);
      
      clearInterval(progressInterval);
      setAnalysisProgress(95);
      
      analyzePitchDeckMutation.mutate({
        startupId: selectedStartup.id,
        content: text,
      });
    } catch (error) {
      clearInterval(progressInterval);
      setIsAnalyzing(false);
      toast({ title: "Failed to read PDF", description: "Please try a different file", variant: "destructive" });
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };


  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "rgb(196,227,230)";
    if (score >= 60) return "rgb(254,212,92)";
    if (score >= 40) return "rgb(251,194,213)";
    return "rgb(239,68,68)";
  };

  const categoryLabels: Record<string, { label: string; icon: typeof Target }> = {
    problem: { label: "Problem", icon: AlertCircle },
    solution: { label: "Solution", icon: Lightbulb },
    market: { label: "Market", icon: TrendingUp },
    businessModel: { label: "Business Model", icon: DollarSign },
    traction: { label: "Traction", icon: TrendingUp },
    team: { label: "Team", icon: Users },
    financials: { label: "Financials", icon: DollarSign },
    competition: { label: "Competition", icon: Target },
    ask: { label: "Ask", icon: DollarSign },
    presentation: { label: "Presentation", icon: FileText },
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="My Startups"
      subtitle="Manage your company profiles and fundraising materials"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.startups}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileUpload}
        data-testid="input-pitch-deck-file"
      />
      <input
        ref={docFileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        className="hidden"
        onChange={handleDocumentUpload}
        data-testid="input-document-file"
      />

      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          {/* Startup Detail View */}
          {viewingStartup && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setViewingStartupId(null);
                  setStartupNotes("");
                }}
                className="mb-6 text-white/60 hover:text-white"
                data-testid="button-back-to-startups"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to All Startups
              </Button>

              {/* Startup Selector for multiple startups */}
              {startups.length > 1 && (
                <div className="mb-6">
                  <Label className="text-white/70 mb-2 block">Switch Startup</Label>
                  <Select value={viewingStartupId || ""} onValueChange={(v) => {
                    setViewingStartupId(v);
                    const s = startups.find(st => st.id === v);
                    setStartupNotes(s?.notes || "");
                  }}>
                    <SelectTrigger className="w-64 bg-white/5 border-white/10 text-white" data-testid="select-startup-switch">
                      <SelectValue placeholder="Select startup" />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                      {startups.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Startup Header */}
              <div className="p-6 rounded-2xl border border-white/10 bg-white/5 mb-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-16 h-16 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                    >
                      <Rocket className="w-8 h-8 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-light text-white">{viewingStartup.name}</h2>
                      {viewingStartup.tagline && (
                        <p className="text-white/50">{viewingStartup.tagline}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {viewingStartup.stage && (
                      <Badge className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                        {viewingStartup.stage}
                      </Badge>
                    )}
                    {viewingStartup.fundingStatus && (
                      <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                        {viewingStartup.fundingStatus}
                      </Badge>
                    )}
                    {viewingStartup.isPublic && (
                      <Badge className="bg-green-500/20 text-green-400 border-0">
                        Public
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs for different sections */}
              <Tabs defaultValue="details" className="space-y-6">
                <TabsList className="bg-white/5 border border-white/10">
                  <TabsTrigger value="details" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white">
                    Documents ({documents.length})
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white">
                    Notes
                  </TabsTrigger>
                </TabsList>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="p-5 rounded-xl border border-white/10 bg-white/5">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[rgb(142,132,247)]" />
                        Company Info
                      </h4>
                      <div className="space-y-3 text-sm">
                        {viewingStartup.description && (
                          <p className="text-white/70">{viewingStartup.description}</p>
                        )}
                        {viewingStartup.website && (
                          <div className="flex items-center gap-2 text-white/50">
                            <Globe className="w-4 h-4" />
                            <a href={viewingStartup.website} target="_blank" rel="noopener" className="hover:text-[rgb(142,132,247)]">
                              {viewingStartup.website}
                            </a>
                          </div>
                        )}
                        {viewingStartup.location && (
                          <div className="flex items-center gap-2 text-white/50">
                            <MapPin className="w-4 h-4" />
                            {viewingStartup.location}
                          </div>
                        )}
                        {viewingStartup.teamSize && (
                          <div className="flex items-center gap-2 text-white/50">
                            <Users className="w-4 h-4" />
                            {viewingStartup.teamSize} team members
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-5 rounded-xl border border-white/10 bg-white/5">
                      <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[rgb(196,227,230)]" />
                        Fundraising
                      </h4>
                      <div className="space-y-3 text-sm">
                        {viewingStartup.targetAmount && (
                          <div className="flex justify-between text-white/70">
                            <span>Target Raise:</span>
                            <span className="font-medium text-white">${(viewingStartup.targetAmount / 1000000).toFixed(1)}M</span>
                          </div>
                        )}
                        {viewingStartup.amountRaised && (
                          <div className="flex justify-between text-white/70">
                            <span>Amount Raised:</span>
                            <span className="font-medium text-[rgb(196,227,230)]">${(viewingStartup.amountRaised / 1000000).toFixed(1)}M</span>
                          </div>
                        )}
                        {viewingStartup.valuation && (
                          <div className="flex justify-between text-white/70">
                            <span>Valuation:</span>
                            <span className="font-medium text-white">${(viewingStartup.valuation / 1000000).toFixed(1)}M</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {viewingStartup.industries && viewingStartup.industries.length > 0 && (
                    <div className="p-5 rounded-xl border border-white/10 bg-white/5">
                      <h4 className="text-white font-medium mb-3">Industries</h4>
                      <div className="flex flex-wrap gap-2">
                        {viewingStartup.industries.map((ind: string) => (
                          <Badge key={ind} className="bg-white/10 text-white/70 border-0">
                            {ind}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Documents Tab */}
                <TabsContent value="documents" className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {(Object.keys(DOCUMENT_TYPE_CONFIG) as DocumentType[]).map((docType) => {
                      const config = DOCUMENT_TYPE_CONFIG[docType];
                      const Icon = config.icon;
                      const existingDoc = documents.find(d => d.type === docType);
                      
                      return (
                        <div
                          key={docType}
                          className={`p-5 rounded-xl border transition-colors ${
                            existingDoc 
                              ? "border-[rgb(142,132,247)]/50 bg-[rgb(142,132,247)]/10" 
                              : "border-white/10 bg-white/5 hover:bg-white/[0.08]"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: existingDoc ? 'rgba(142,132,247,0.3)' : 'rgba(255,255,255,0.1)' }}
                              >
                                <Icon className={`w-5 h-5 ${existingDoc ? 'text-[rgb(142,132,247)]' : 'text-white/40'}`} />
                              </div>
                              <div>
                                <h5 className="font-medium text-white">{config.label}</h5>
                                <p className="text-xs text-white/40">{config.description}</p>
                              </div>
                            </div>
                          </div>
                          
                          {existingDoc ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm text-white/60">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                <span className="truncate">{existingDoc.fileName}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setUploadingDocType(docType);
                                    docFileInputRef.current?.click();
                                  }}
                                  className="text-white/60 hover:text-white"
                                  data-testid={`button-replace-${docType}`}
                                >
                                  Replace
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteDocumentMutation.mutate({ 
                                    startupId: viewingStartupId!, 
                                    docId: existingDoc.id 
                                  })}
                                  className="text-red-400 hover:text-red-300"
                                  data-testid={`button-delete-${docType}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              className="w-full border-white/20 text-white/60 hover:bg-white/5"
                              onClick={() => {
                                setUploadingDocType(docType);
                                docFileInputRef.current?.click();
                              }}
                              disabled={uploadDocumentMutation.isPending && uploadingDocType === docType}
                              data-testid={`button-upload-${docType}`}
                            >
                              {uploadDocumentMutation.isPending && uploadingDocType === docType ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 mr-2" />
                              )}
                              Upload
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                    <p className="text-sm text-white/50">
                      Upload your startup documents to build a comprehensive profile for investor matching. 
                      Supported formats: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT
                    </p>
                  </div>
                </TabsContent>

                {/* Notes Tab */}
                <TabsContent value="notes" className="space-y-6">
                  <div className="p-5 rounded-xl border border-white/10 bg-white/5">
                    <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                      <StickyNote className="w-4 h-4 text-[rgb(254,212,92)]" />
                      Founder Notes
                    </h4>
                    <Textarea
                      value={startupNotes}
                      onChange={(e) => setStartupNotes(e.target.value)}
                      placeholder="Add notes about your startup, key milestones, fundraising strategy, or anything you want to remember..."
                      rows={8}
                      className="bg-white/5 border-white/10 text-white mb-4"
                      data-testid="textarea-startup-notes"
                    />
                    <Button
                      onClick={() => saveNotesMutation.mutate({ startupId: viewingStartupId!, notes: startupNotes })}
                      disabled={saveNotesMutation.isPending}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      data-testid="button-save-notes"
                    >
                      {saveNotesMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save Notes
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}

          {/* Regular Startup List View */}
          {!viewingStartupId && (
          <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-end mb-8"
          >
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <button
                  className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
                  data-testid="button-add-startup"
                >
                  <Plus className="w-5 h-5" />
                  Add Startup
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[rgb(28,28,28)] border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-white">Create New Startup</DialogTitle>
                  <DialogDescription className="text-white/50">
                    Add your company to attract potential investors
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-white/70">Company Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Acme Inc"
                        required
                        className="bg-white/5 border-white/10 text-white"
                        data-testid="input-startup-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website" className="text-white/70">Website</Label>
                      <Input
                        id="website"
                        value={formData.website}
                        onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://example.com"
                        className="bg-white/5 border-white/10 text-white"
                        data-testid="input-startup-website"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tagline" className="text-white/70">Tagline</Label>
                    <Input
                      id="tagline"
                      value={formData.tagline}
                      onChange={(e) => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
                      placeholder="The future of X"
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-startup-tagline"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-white/70">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Tell investors about your company..."
                      rows={4}
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-startup-description"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-white/70">Stage</Label>
                      <Select value={formData.stage} onValueChange={(v) => setFormData(prev => ({ ...prev, stage: v }))}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-startup-stage">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                          {stages.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70">Funding Status</Label>
                      <Select value={formData.fundingStatus} onValueChange={(v) => setFormData(prev => ({ ...prev, fundingStatus: v }))}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-startup-funding-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                          {fundingStatuses.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="location" className="text-white/70">Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="San Francisco, CA"
                        className="bg-white/5 border-white/10 text-white"
                        data-testid="input-startup-location"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamSize" className="text-white/70">Team Size</Label>
                      <Input
                        id="teamSize"
                        type="number"
                        value={formData.teamSize}
                        onChange={(e) => setFormData(prev => ({ ...prev, teamSize: e.target.value }))}
                        placeholder="10"
                        className="bg-white/5 border-white/10 text-white"
                        data-testid="input-startup-team-size"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70">Industries</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant={formData.industries.includes(industry) ? "default" : "outline"}
                          className={`cursor-pointer transition-colors ${
                            formData.industries.includes(industry)
                              ? "bg-[rgb(142,132,247)] text-white border-0"
                              : "border-white/20 text-white/60 hover:bg-white/5"
                          }`}
                          onClick={() => handleIndustryToggle(industry)}
                          data-testid={`badge-industry-${industry.toLowerCase().replace(/\//g, '-')}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetAmount" className="text-white/70">Target Raise Amount ($)</Label>
                    <Input
                      id="targetAmount"
                      type="number"
                      value={formData.targetAmount}
                      onChange={(e) => setFormData(prev => ({ ...prev, targetAmount: e.target.value }))}
                      placeholder="500000"
                      className="bg-white/5 border-white/10 text-white"
                      data-testid="input-startup-target-amount"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={formData.isPublic}
                      onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                      className="rounded border-white/20 bg-white/5"
                      data-testid="checkbox-startup-public"
                    />
                    <Label htmlFor="isPublic" className="text-sm text-white/70">
                      Make this startup visible to investors
                    </Label>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="border-white/20 text-white hover:bg-white/5">
                      Cancel
                    </Button>
                    <button 
                      type="submit" 
                      disabled={createMutation.isPending}
                      className="h-10 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                      data-testid="button-submit-startup"
                    >
                      {createMutation.isPending ? "Creating..." : "Create Startup"}
                    </button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </motion.div>

          {startups.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center py-24 rounded-2xl border border-white/10 bg-white/5"
            >
              <div 
                className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
              >
                <Rocket className="w-10 h-10 text-[rgb(142,132,247)]" />
              </div>
              <h3 className="text-2xl font-light text-white mb-2">
                No startups yet
              </h3>
              <p className="text-white/50 font-light mb-8 max-w-md mx-auto">
                Create your first startup profile to start attracting investors
              </p>
              <button 
                onClick={() => setIsCreateOpen(true)}
                className="h-12 px-8 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                data-testid="button-create-first-startup"
              >
                <Plus className="w-5 h-5" />
                Create Your First Startup
              </button>
            </motion.div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {startups.map((startup, index) => (
                <motion.div
                  key={startup.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors"
                  data-testid={`card-startup-${startup.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border-2 border-white/10">
                        <AvatarImage src={startup.logo || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium">
                          {startup.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-medium text-white">{startup.name}</h3>
                        {startup.tagline && (
                          <p className="text-sm text-white/50 line-clamp-1">
                            {startup.tagline}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-white/40 hover:text-white" data-testid={`button-startup-menu-${startup.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[rgb(28,28,28)] border-white/10">
                        <DropdownMenuItem onClick={() => setLocation(`/app/startups/${startup.id}`)} className="text-white/70">
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation(`/app/startups/${startup.id}/edit`)} className="text-white/70">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {startup.website && (
                          <DropdownMenuItem onClick={() => window.open(startup.website || '', '_blank')} className="text-white/70">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Visit Website
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          onClick={() => deleteMutation.mutate(startup.id)}
                          className="text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {startup.stage && (
                      <Badge className="text-xs bg-white/10 text-white/70 border-0">
                        {startup.stage}
                      </Badge>
                    )}
                    {startup.isPublic ? (
                      <Badge className="text-xs bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                        Public
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-white/20 text-white/50">
                        Private
                      </Badge>
                    )}
                  </div>

                  {startup.description && (
                    <p className="text-sm text-white/50 mb-4 line-clamp-2">
                      {startup.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                    {startup.location && (
                      <div className="flex items-center gap-1.5 text-white/40">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{startup.location}</span>
                      </div>
                    )}
                    {startup.teamSize && (
                      <div className="flex items-center gap-1.5 text-white/40">
                        <Users className="w-3.5 h-3.5" />
                        <span>{startup.teamSize} people</span>
                      </div>
                    )}
                    {startup.targetAmount && (
                      <div className="flex items-center gap-1.5 text-white/40">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Raising {formatCurrency(startup.targetAmount)}</span>
                      </div>
                    )}
                    {startup.website && (
                      <div className="flex items-center gap-1.5 text-white/40">
                        <Globe className="w-3.5 h-3.5" />
                        <a 
                          href={startup.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="truncate hover:text-[rgb(142,132,247)]"
                        >
                          Website
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setViewingStartupId(startup.id);
                        setStartupNotes(startup.notes || "");
                      }}
                      className="w-full border-white/20 text-white/60 hover:bg-white/5 hover:text-white"
                      data-testid={`button-view-details-${startup.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Details & Documents
                    </Button>
                    <button
                      onClick={() => {
                        setSelectedStartup(startup);
                        fileInputRef.current?.click();
                      }}
                      className="w-full h-10 rounded-xl border border-dashed border-white/20 text-white/60 text-sm flex items-center justify-center gap-2 hover:bg-white/5 hover:border-[rgb(142,132,247)]/50 hover:text-[rgb(142,132,247)] transition-all"
                      data-testid={`button-upload-pitch-deck-${startup.id}`}
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Pitch Deck for AI Analysis</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
        )}
        </div>
      </div>

      <Dialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[rgb(28,28,28)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
              >
                <Sparkles className="w-5 h-5 text-[rgb(142,132,247)]" />
              </div>
              Pitch Deck Analysis
              {selectedStartup && (
                <span className="text-white/50 font-light">- {selectedStartup.name}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-16 text-center"
              >
                <div 
                  className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                >
                  <Loader2 className="w-10 h-10 text-[rgb(142,132,247)] animate-spin" />
                </div>
                <h3 className="text-lg font-light text-white mb-2">
                  Analyzing your pitch deck...
                </h3>
                <p className="text-white/50 mb-6">
                  Our AI is reviewing your presentation
                </p>
                <div className="max-w-xs mx-auto">
                  <Progress value={analysisProgress} className="h-2 bg-white/10" />
                  <p className="text-sm text-white/40 mt-2">{analysisProgress}% complete</p>
                </div>
              </motion.div>
            ) : analysisResult ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between p-6 rounded-2xl border border-white/10 bg-white/5">
                  <div>
                    <p className="text-white/50 text-sm mb-1">Overall Score</p>
                    <p className="text-4xl font-light text-white">
                      {analysisResult.overallScore}
                      <span className="text-lg text-white/40">/100</span>
                    </p>
                  </div>
                  <div 
                    className="w-24 h-24 rounded-full flex items-center justify-center border-4"
                    style={{ 
                      borderColor: getScoreColor(analysisResult.overallScore),
                      backgroundColor: `${getScoreColor(analysisResult.overallScore)}20`
                    }}
                  >
                    <span className="text-2xl font-light" style={{ color: getScoreColor(analysisResult.overallScore) }}>
                      {analysisResult.overallScore >= 80 ? "A" : analysisResult.overallScore >= 60 ? "B" : analysisResult.overallScore >= 40 ? "C" : "D"}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-medium mb-4">Category Scores</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Object.entries(analysisResult.categoryScores).map(([key, score]) => {
                      const category = categoryLabels[key];
                      if (!category) return null;
                      const Icon = category.icon;
                      return (
                        <div 
                          key={key}
                          className="p-3 rounded-xl border border-white/10 bg-white/5 text-center"
                        >
                          <Icon className="w-4 h-4 mx-auto mb-2 text-white/40" />
                          <p className="text-xs text-white/50 mb-1">{category.label}</p>
                          <p className="text-lg font-light" style={{ color: getScoreColor(score) }}>
                            {score}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
                    <h4 className="flex items-center gap-2 text-white font-medium mb-4">
                      <CheckCircle2 className="w-5 h-5 text-[rgb(196,227,230)]" />
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {analysisResult.strengths.map((strength, i) => (
                        <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                          <span className="text-[rgb(196,227,230)] mt-0.5">+</span>
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
                    <h4 className="flex items-center gap-2 text-white font-medium mb-4">
                      <AlertCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
                      Areas for Improvement
                    </h4>
                    <ul className="space-y-2">
                      {analysisResult.weaknesses.map((weakness, i) => (
                        <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                          <span className="text-[rgb(251,194,213)] mt-0.5">-</span>
                          {weakness}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {analysisResult.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-white font-medium mb-4">Recommendations</h4>
                    <div className="space-y-3">
                      {analysisResult.recommendations.map((rec, i) => (
                        <div 
                          key={i}
                          className="p-4 rounded-xl border border-white/10 bg-white/5"
                        >
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <h5 className="font-medium text-white">{rec.title}</h5>
                            <Badge 
                              className={`text-xs border-0 ${
                                rec.priority === "high" 
                                  ? "bg-red-500/20 text-red-400"
                                  : rec.priority === "medium"
                                    ? "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]"
                                    : "bg-white/10 text-white/60"
                              }`}
                            >
                              {rec.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-white/60">{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult.summary && (
                  <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
                    <h4 className="text-white font-medium mb-3">Summary</h4>
                    <p className="text-sm text-white/70 leading-relaxed">
                      {analysisResult.summary}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowAnalysisDialog(false);
                      setAnalysisResult(null);
                    }}
                    className="border-white/20 text-white hover:bg-white/5"
                  >
                    Close
                  </Button>
                  <button
                    onClick={() => {
                      setAnalysisResult(null);
                      fileInputRef.current?.click();
                    }}
                    className="h-10 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
                    data-testid="button-analyze-another"
                  >
                    <Upload className="w-4 h-4" />
                    Analyze Another
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
