import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { 
  MessageCircle, 
  Mic, 
  MicOff,
  Volume2,
  VolumeX,
  Target, 
  TrendingUp, 
  Users, 
  FileText, 
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Play,
  Send,
  ArrowRight,
  Sparkles,
  Brain,
  BarChart3,
  Shield,
  Clock,
  Award,
  Upload,
  File,
  Square
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Interview, InterviewMessage, InterviewScore, InterviewFeedback } from "@shared/schema";
import { useSpeechRecognition, useTextToSpeech } from "@/hooks/use-speech";
import * as pdfjs from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const INVESTOR_TYPES = [
  "Angel",
  "Syndicate",
  "Venture Capital",
  "Growth Equity",
  "Private Equity",
  "Fund of Funds",
  "Family Office",
  "Sovereign Wealth Fund",
  "Corporate VC",
  "Development Finance Institution",
];

const STAGES = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Growth",
];

type ViewState = "landing" | "setup" | "interview" | "results";
type ConversationState = "idle" | "listening" | "processing" | "speaking";

export default function InterviewAssistant() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<ViewState>("landing");
  const [currentInterviewId, setCurrentInterviewId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>("idle");
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const lastSpokenMessageRef = useRef<string | null>(null);
  const hasInitializedVoiceRef = useRef(false);
  const pendingSpeechRef = useRef<string>("");
  
  const { 
    isListening, 
    transcript, 
    interimTranscript, 
    isSupported: sttSupported, 
    startListening, 
    stopListening,
    resetTranscript,
    error: speechError 
  } = useSpeechRecognition();
  
  const { 
    speak, 
    stop: stopSpeaking, 
    isSpeaking, 
    isSupported: ttsSupported 
  } = useTextToSpeech();
  
  const [formData, setFormData] = useState({
    founderName: "",
    companyName: "",
    role: "CEO",
    industry: "",
    hqLocation: "",
    stage: "Seed",
    targetRaise: "",
    useOfFunds: "",
    revenue: "",
    growthRate: "",
    teamSize: 5,
    targetInvestorTypes: ["Venture Capital"] as string[],
    targetGeography: "North America",
    targetTicketSize: "$500K - $2M",
    investorStrategy: "financial",
    companyDetails: "",
    pitchDeckContent: "",
  });
  const [pitchDeckFile, setPitchDeckFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionComplete, setExtractionComplete] = useState(false);

  const { data: interviews } = useQuery<Interview[]>({
    queryKey: ["/api/interviews"],
  });

  const { data: currentInterview } = useQuery<Interview>({
    queryKey: ["/api/interviews", currentInterviewId],
    enabled: !!currentInterviewId,
  });

  const { data: messages, refetch: refetchMessages } = useQuery<InterviewMessage[]>({
    queryKey: ["/api/interviews", currentInterviewId, "messages"],
    enabled: !!currentInterviewId && view === "interview",
    refetchInterval: view === "interview" ? 2000 : false,
  });

  const { data: score } = useQuery<InterviewScore>({
    queryKey: ["/api/interviews", currentInterviewId, "score"],
    enabled: !!currentInterviewId && view === "results",
  });

  const { data: feedback } = useQuery<InterviewFeedback>({
    queryKey: ["/api/interviews", currentInterviewId, "feedback"],
    enabled: !!currentInterviewId && view === "results",
  });

  const createInterviewMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/interviews", data);
      return res.json();
    },
    onSuccess: (data: Interview) => {
      setCurrentInterviewId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
    },
  });

  const startInterviewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/interviews/${id}/start`);
      return res.json();
    },
    onSuccess: () => {
      setView("interview");
      refetchMessages();
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, response }: { id: string; response: string }) => {
      const res = await apiRequest("POST", `/api/interviews/${id}/respond`, { response });
      return res.json();
    },
    onSuccess: (data: any) => {
      setUserInput("");
      refetchMessages();
      if (data.isComplete) {
        completeInterviewMutation.mutate(currentInterviewId!);
      }
    },
  });

  const completeInterviewMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/interviews/${id}/complete`);
      return res.json();
    },
    onSuccess: () => {
      setView("results");
      queryClient.invalidateQueries({ queryKey: ["/api/interviews", currentInterviewId] });
    },
  });

  useEffect(() => {
    if (transcript) {
      pendingSpeechRef.current += transcript;
      setUserInput(prev => prev + transcript);
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  useEffect(() => {
    if (!voiceModeEnabled && isListening) {
      stopListening();
      setConversationState("idle");
    }
  }, [voiceModeEnabled, isListening, stopListening]);

  useEffect(() => {
    if (!ttsEnabled) {
      stopSpeaking();
      if (conversationState === "speaking") {
        setConversationState("idle");
      }
      return;
    }
    
    if (!messages || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "assistant" && lastMessage.content !== lastSpokenMessageRef.current) {
      lastSpokenMessageRef.current = lastMessage.content;
      setConversationState("speaking");
      speak(lastMessage.content);
    }
  }, [messages, ttsEnabled, speak, stopSpeaking, conversationState]);

  useEffect(() => {
    if (view === "interview" && voiceModeEnabled && sttSupported && !hasInitializedVoiceRef.current && messages && messages.length > 0) {
      hasInitializedVoiceRef.current = true;
      const timer = setTimeout(() => {
        if (!isSpeaking) {
          setConversationState("listening");
          startListening();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [view, voiceModeEnabled, sttSupported, messages, isSpeaking, startListening]);

  useEffect(() => {
    if (voiceModeEnabled && sttSupported && !isSpeaking && !isListening && conversationState === "idle" && view === "interview" && !respondMutation.isPending && hasInitializedVoiceRef.current) {
      const timer = setTimeout(() => {
        setConversationState("listening");
        startListening();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isSpeaking, isListening, conversationState, voiceModeEnabled, sttSupported, view, respondMutation.isPending, startListening]);

  useEffect(() => {
    if (isSpeaking) {
      setConversationState("speaking");
    } else if (conversationState === "speaking" && !isSpeaking) {
      setConversationState("idle");
    }
  }, [isSpeaking, conversationState]);

  useEffect(() => {
    if (isListening) {
      setConversationState("listening");
    }
  }, [isListening]);

  useEffect(() => {
    if (respondMutation.isPending) {
      setConversationState("processing");
    }
  }, [respondMutation.isPending]);

  const handleVoiceSend = () => {
    if (isListening) {
      stopListening();
    }
    const textToSend = userInput.trim();
    if (textToSend && currentInterviewId) {
      setConversationState("processing");
      respondMutation.mutate({ id: currentInterviewId, response: textToSend });
      setUserInput("");
      pendingSpeechRef.current = "";
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      if (userInput.trim()) {
        handleVoiceSend();
      } else {
        setConversationState("idle");
      }
    } else {
      setConversationState("listening");
      startListening();
    }
  };

  const handleStartSetup = () => {
    setView("setup");
  };

  const handleSubmitSetup = async () => {
    const interview = await createInterviewMutation.mutateAsync(formData);
    await startInterviewMutation.mutateAsync(interview.id);
  };

  const handleSendResponse = () => {
    if (!userInput.trim() || !currentInterviewId) return;
    respondMutation.mutate({ id: currentInterviewId, response: userInput });
  };

  const toggleInvestorType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      targetInvestorTypes: prev.targetInvestorTypes.includes(type)
        ? prev.targetInvestorTypes.filter(t => t !== type)
        : [...prev.targetInvestorTypes, type],
    }));
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n\n";
    }
    
    return fullText;
  };

  const handlePitchDeckUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert("Please upload a PDF file");
      return;
    }
    
    setPitchDeckFile(file);
    setIsExtracting(true);
    setExtractionComplete(false);
    
    try {
      const textContent = await extractTextFromPDF(file);
      setFormData(prev => ({ ...prev, pitchDeckContent: textContent }));
      
      const response = await apiRequest("POST", "/api/pitch-deck/extract-info", {
        pitchDeckContent: textContent
      });
      
      if (response.ok) {
        const data = await response.json();
        const info = data.extractedInfo;
        
        setFormData(prev => ({
          ...prev,
          companyName: info.companyName && info.companyName !== "Not specified" ? info.companyName : prev.companyName,
          industry: info.industry && info.industry !== "Not specified" ? info.industry : prev.industry,
          useOfFunds: info.fundingAsk && info.fundingAsk !== "Not specified" ? info.fundingAsk : prev.useOfFunds,
          revenue: info.traction && info.traction !== "Not specified" ? info.traction : prev.revenue,
          companyDetails: info.summary || prev.companyDetails,
          pitchDeckContent: textContent,
        }));
        
        setExtractionComplete(true);
      }
    } catch (error) {
      console.error("Error processing pitch deck:", error);
    } finally {
      setIsExtracting(false);
    }
  };

  const removePitchDeck = () => {
    setPitchDeckFile(null);
    setExtractionComplete(false);
    setFormData(prev => ({ ...prev, pitchDeckContent: "" }));
  };

  const getPhaseProgress = () => {
    const phases = ["setup", "core_pitch", "investor_deep_dive", "risk_diligence", "wrap_up", "completed"];
    const currentPhase = currentInterview?.phase || "setup";
    const index = phases.indexOf(currentPhase);
    return ((index + 1) / phases.length) * 100;
  };

  const getPhaseName = (phase: string) => {
    const names: Record<string, string> = {
      setup: "Getting Started",
      core_pitch: "Core Pitch",
      investor_deep_dive: "Investor Deep Dive",
      risk_diligence: "Risk & Diligence",
      wrap_up: "Wrap Up",
      completed: "Completed",
    };
    return names[phase] || phase;
  };

  return (
    <AppLayout
      title="Interview Assistant"
      subtitle="AI-powered investor readiness evaluation"
      showHero={true}
      heroHeight="35vh"
      videoUrl="https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4"
    >
      <div className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <h2 className="text-3xl md:text-4xl font-light text-white">
                    <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Stress-Test</span> Your Pitch
                  </h2>
                  <p className="text-white/60 text-lg leading-relaxed">
                    Our AI Interview Assistant simulates institutional investor conversations, evaluating your 
                    pitch from the perspective of VCs, angels, family offices, and more. Get actionable feedback 
                    before your real investor meetings.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Button 
                      size="lg"
                      onClick={handleStartSetup}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0 hover:opacity-90"
                      data-testid="button-start-interview"
                    >
                      Start Interview
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: Brain, label: "AI-Powered", desc: "Mistral AI analysis" },
                    { icon: Target, label: "Investor-Grade", desc: "Institutional standards" },
                    { icon: BarChart3, label: "Scored Feedback", desc: "Quantified readiness" },
                    { icon: Shield, label: "Pre-Investment Filter", desc: "Quality signal" },
                  ].map((item, i) => (
                    <Card key={i} className="bg-white/5 border-white/10">
                      <CardContent className="p-4 text-center">
                        <item.icon className="w-8 h-8 text-[rgb(142,132,247)] mx-auto mb-2" />
                        <p className="text-white font-medium text-sm">{item.label}</p>
                        <p className="text-white/40 text-xs">{item.desc}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-6">
                <h3 className="text-xl font-light text-white">How It Works</h3>
                <div className="grid md:grid-cols-4 gap-6">
                  {[
                    { step: 1, title: "Profile Setup", desc: "Enter your company details and target investors" },
                    { step: 2, title: "AI Interview", desc: "Engage in a structured investor conversation" },
                    { step: 3, title: "Get Scored", desc: "Receive quantified readiness assessment" },
                    { step: 4, title: "Actionable Feedback", desc: "Get specific recommendations for improvement" },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[rgb(142,132,247)] font-medium">{item.step}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{item.title}</p>
                        <p className="text-white/40 text-sm">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {interviews && interviews.length > 0 && (
                <>
                  <Separator className="bg-white/10" />
                  <div className="space-y-4">
                    <h3 className="text-xl font-light text-white">Past Interviews</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {interviews.slice(0, 6).map((interview) => (
                        <Card 
                          key={interview.id} 
                          className="bg-white/5 border-white/10 hover-elevate cursor-pointer"
                          onClick={() => {
                            setCurrentInterviewId(interview.id);
                            setView(interview.status === "completed" ? "results" : "interview");
                          }}
                          data-testid={`card-interview-${interview.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-white font-medium">{interview.companyName}</span>
                              <Badge variant={interview.status === "completed" ? "default" : "secondary"}>
                                {interview.status}
                              </Badge>
                            </div>
                            <p className="text-white/40 text-sm">{interview.stage}</p>
                            <p className="text-white/30 text-xs mt-2">
                              {new Date(interview.createdAt!).toLocaleDateString()}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {view === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-light text-white">
                  <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Tell Us</span> About Your Company
                </h2>
                <p className="text-white/60">This information helps us tailor the interview to your specific situation</p>
              </div>

              <Card className="bg-gradient-to-br from-[rgb(142,132,247)]/10 to-[rgb(251,194,213)]/5 border-[rgb(142,132,247)]/30">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-6 h-6 text-[rgb(142,132,247)]" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h3 className="text-lg font-medium text-white mb-1">Upload Your Pitch Deck</h3>
                        <p className="text-white/60 text-sm">
                          Upload your pitch deck to unlock AI-powered custom questions tailored to your specific business, market, and metrics.
                        </p>
                      </div>
                      
                      {!pitchDeckFile ? (
                        <label 
                          className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-[rgb(142,132,247)]/40 rounded-lg cursor-pointer hover:border-[rgb(142,132,247)]/60 hover:bg-[rgb(142,132,247)]/5 transition-all"
                          data-testid="upload-pitch-deck"
                        >
                          <Upload className="w-6 h-6 text-[rgb(142,132,247)]" />
                          <span className="text-white/70">Click to upload PDF pitch deck</span>
                          <input 
                            type="file" 
                            accept=".pdf"
                            className="hidden" 
                            onChange={handlePitchDeckUpload}
                          />
                        </label>
                      ) : (
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                          <div className="flex items-center gap-3">
                            {isExtracting ? (
                              <Loader2 className="w-5 h-5 text-[rgb(142,132,247)] animate-spin" />
                            ) : extractionComplete ? (
                              <CheckCircle2 className="w-5 h-5 text-green-400" />
                            ) : (
                              <File className="w-5 h-5 text-[rgb(142,132,247)]" />
                            )}
                            <div>
                              <p className="text-white text-sm font-medium">{pitchDeckFile.name}</p>
                              <p className="text-white/40 text-xs">
                                {isExtracting 
                                  ? "Analyzing deck and extracting insights..." 
                                  : extractionComplete 
                                  ? "Analysis complete - custom questions enabled"
                                  : "Ready for analysis"
                                }
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={removePitchDeck}
                            className="text-white/40 hover:text-white"
                            data-testid="button-remove-deck"
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                      
                      {extractionComplete && (
                        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <p className="text-green-400 text-sm">
                            Your pitch deck has been analyzed. The interview will include custom questions based on your specific business context.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 space-y-8">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-white/80">Your Name</Label>
                      <Input
                        value={formData.founderName}
                        onChange={(e) => setFormData(prev => ({ ...prev, founderName: e.target.value }))}
                        placeholder="John Smith"
                        className="bg-white/5 border-white/20 text-white"
                        data-testid="input-founder-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Company Name</Label>
                      <Input
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="TechCo Inc."
                        className="bg-white/5 border-white/20 text-white"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Industry</Label>
                      <Input
                        value={formData.industry}
                        onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                        placeholder="SaaS, Fintech, Healthcare..."
                        className="bg-white/5 border-white/20 text-white"
                        data-testid="input-industry"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Location</Label>
                      <Input
                        value={formData.hqLocation}
                        onChange={(e) => setFormData(prev => ({ ...prev, hqLocation: e.target.value }))}
                        placeholder="San Francisco, CA"
                        className="bg-white/5 border-white/20 text-white"
                        data-testid="input-location"
                      />
                    </div>
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="space-y-4">
                    <Label className="text-white/80">Current Stage</Label>
                    <div className="flex flex-wrap gap-2">
                      {STAGES.map((stage) => (
                        <Button
                          key={stage}
                          variant={formData.stage === stage ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFormData(prev => ({ ...prev, stage }))}
                          className={formData.stage === stage 
                            ? "bg-[rgb(142,132,247)] border-[rgb(142,132,247)]" 
                            : "border-white/20 text-white/70 hover:bg-white/10"
                          }
                          data-testid={`button-stage-${stage.toLowerCase().replace(" ", "-")}`}
                        >
                          {stage}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-white/80">Target Raise</Label>
                      <Input
                        value={formData.targetRaise}
                        onChange={(e) => setFormData(prev => ({ ...prev, targetRaise: e.target.value }))}
                        placeholder="$2M"
                        className="bg-white/5 border-white/20 text-white"
                        data-testid="input-target-raise"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Current Revenue (ARR)</Label>
                      <Input
                        value={formData.revenue}
                        onChange={(e) => setFormData(prev => ({ ...prev, revenue: e.target.value }))}
                        placeholder="$500K"
                        className="bg-white/5 border-white/20 text-white"
                        data-testid="input-revenue"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">Use of Funds</Label>
                    <Textarea
                      value={formData.useOfFunds}
                      onChange={(e) => setFormData(prev => ({ ...prev, useOfFunds: e.target.value }))}
                      placeholder="How will you use the capital you raise?"
                      className="bg-white/5 border-white/20 text-white min-h-[100px]"
                      data-testid="input-use-of-funds"
                    />
                  </div>

                  <Separator className="bg-white/10" />

                  <div className="space-y-4">
                    <Label className="text-white/80">Target Investor Types</Label>
                    <p className="text-white/40 text-sm">Select all that apply</p>
                    <div className="flex flex-wrap gap-2">
                      {INVESTOR_TYPES.map((type) => (
                        <Button
                          key={type}
                          variant={formData.targetInvestorTypes.includes(type) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleInvestorType(type)}
                          className={formData.targetInvestorTypes.includes(type)
                            ? "bg-[rgb(142,132,247)] border-[rgb(142,132,247)]"
                            : "border-white/20 text-white/70 hover:bg-white/10"
                          }
                          data-testid={`button-investor-${type.toLowerCase().replace(/ /g, "-")}`}
                        >
                          {type}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setView("landing")}
                      className="border-white/20 text-white/70"
                      data-testid="button-back"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleSubmitSetup}
                      disabled={!formData.founderName || !formData.companyName || createInterviewMutation.isPending || startInterviewMutation.isPending}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      data-testid="button-begin-interview"
                    >
                      {(createInterviewMutation.isPending || startInterviewMutation.isPending) ? (
                        <>
                          <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          Begin Interview
                          <Play className="ml-2 w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {view === "interview" && currentInterview && (
            <motion.div
              key="interview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-light text-white">{currentInterview.companyName}</h2>
                  <p className="text-white/40 text-sm">{getPhaseName(currentInterview.phase || "core_pitch")}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Clock className="w-4 h-4 text-white/40" />
                  <span className="text-white/60 text-sm">~25 min remaining</span>
                </div>
              </div>

              <Progress value={getPhaseProgress()} className="h-2 bg-white/10" />

              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px] p-6">
                    <div className="space-y-4">
                      {messages?.map((message, index) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            message.role === "user" 
                              ? "bg-[rgb(251,194,213)]/20" 
                              : "bg-[rgb(142,132,247)]/20"
                          }`}>
                            {message.role === "user" ? (
                              <Users className="w-4 h-4 text-[rgb(251,194,213)]" />
                            ) : (
                              <Brain className="w-4 h-4 text-[rgb(142,132,247)]" />
                            )}
                          </div>
                          <div className={`max-w-[80%] p-4 rounded-lg ${
                            message.role === "user"
                              ? "bg-[rgb(251,194,213)]/10 text-white"
                              : "bg-white/5 text-white/90"
                          }`}>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </motion.div>
                      ))}
                      {respondMutation.isPending && (
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-[rgb(142,132,247)] animate-spin" />
                          </div>
                          <div className="bg-white/5 p-4 rounded-lg">
                            <p className="text-white/60">Thinking...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="p-6 border-t border-white/10">
                    {speechError && (
                      <div className="mb-4 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        {speechError}
                      </div>
                    )}
                    
                    {voiceModeEnabled && sttSupported && !showTextInput ? (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center gap-4">
                          <div className="text-center mb-2">
                            <p className="text-white/40 text-sm">
                              {conversationState === "speaking" && "AI is speaking..."}
                              {conversationState === "listening" && "Listening to you..."}
                              {conversationState === "processing" && "Processing..."}
                              {conversationState === "idle" && "Click to speak"}
                            </p>
                          </div>
                          
                          <div className="relative">
                            {conversationState === "speaking" && (
                              <motion.div
                                className="absolute inset-0 rounded-full bg-[rgb(142,132,247)]/20"
                                animate={{ scale: [1, 1.3, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              />
                            )}
                            {conversationState === "listening" && (
                              <motion.div
                                className="absolute inset-0 rounded-full bg-red-500/20"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                              />
                            )}
                            
                            <Button
                              onClick={conversationState === "speaking" ? stopSpeaking : toggleListening}
                              disabled={conversationState === "processing"}
                              className={`relative z-10 w-20 h-20 rounded-full transition-all ${
                                conversationState === "listening"
                                  ? "bg-red-500 hover:bg-red-600"
                                  : conversationState === "speaking"
                                  ? "bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                                  : conversationState === "processing"
                                  ? "bg-white/20"
                                  : "bg-white/10 hover:bg-white/20"
                              }`}
                              data-testid="button-main-mic"
                            >
                              {conversationState === "processing" ? (
                                <Loader2 className="w-8 h-8 animate-spin" />
                              ) : conversationState === "speaking" ? (
                                <Volume2 className="w-8 h-8" />
                              ) : conversationState === "listening" ? (
                                <MicOff className="w-8 h-8" />
                              ) : (
                                <Mic className="w-8 h-8" />
                              )}
                            </Button>
                          </div>
                          
                          {conversationState === "speaking" && (
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <motion.div
                                    key={i}
                                    className="w-1 bg-[rgb(142,132,247)] rounded-full"
                                    animate={{ height: [8, 20, 8] }}
                                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.08 }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {conversationState === "listening" && (
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <motion.div
                                    key={i}
                                    className="w-1 bg-red-400 rounded-full"
                                    animate={{ height: [4, 16, 4] }}
                                    transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1 }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {(userInput || interimTranscript) && (
                            <div className="w-full max-w-md p-3 bg-white/5 rounded-lg text-white/80 text-sm">
                              {userInput}{interimTranscript && <span className="text-white/40">{interimTranscript}</span>}
                            </div>
                          )}
                          
                          {userInput.trim() && conversationState !== "processing" && (
                            <Button
                              onClick={handleVoiceSend}
                              className="bg-[rgb(142,132,247)]"
                              data-testid="button-send-voice"
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Send Response
                            </Button>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/5">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={ttsEnabled}
                              onCheckedChange={setTtsEnabled}
                              data-testid="switch-tts"
                            />
                            <Label className="text-white/40 text-xs">AI Voice</Label>
                          </div>
                          <button
                            onClick={() => setShowTextInput(true)}
                            className="text-white/40 text-xs hover:text-white/60 transition-colors"
                            data-testid="button-show-text"
                          >
                            Use text instead
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="flex-1 relative">
                            <Textarea
                              value={userInput}
                              onChange={(e) => setUserInput(e.target.value)}
                              placeholder="Type your response..."
                              className="bg-white/5 border-white/20 text-white min-h-[60px] resize-none"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSendResponse();
                                }
                              }}
                              data-testid="input-response"
                            />
                          </div>
                          <Button
                            onClick={handleSendResponse}
                            disabled={!userInput.trim() || respondMutation.isPending}
                            className="bg-[rgb(142,132,247)] self-end"
                            data-testid="button-send"
                          >
                            {respondMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        
                        {sttSupported && (
                          <div className="flex justify-center pt-2 border-t border-white/5">
                            <button
                              onClick={() => {
                                setVoiceModeEnabled(true);
                                setShowTextInput(false);
                              }}
                              className="flex items-center gap-2 text-white/40 text-xs hover:text-white/60 transition-colors"
                              data-testid="button-enable-voice"
                            >
                              <Mic className="w-3 h-3" />
                              Switch to voice mode
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => completeInterviewMutation.mutate(currentInterviewId!)}
                  disabled={completeInterviewMutation.isPending}
                  className="border-white/20 text-white/70"
                  data-testid="button-end-interview"
                >
                  {completeInterviewMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                      Generating Results...
                    </>
                  ) : (
                    "End Interview & Get Results"
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {view === "results" && score && feedback && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[rgb(142,132,247)]/20">
                  <Award className="w-10 h-10 text-[rgb(142,132,247)]" />
                </div>
                <h2 className="text-3xl font-light text-white">
                  Interview Complete
                </h2>
                <Badge 
                  className={`text-lg px-4 py-2 ${
                    score.overallScore! >= 70 
                      ? "bg-green-500/20 text-green-400 border-green-500/30" 
                      : score.overallScore! >= 50 
                        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                  }`}
                >
                  {score.investorReadiness}
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="bg-white/5 border-white/10 md:col-span-2 lg:col-span-1">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-[rgb(142,132,247)]" />
                      Overall Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <span className="text-6xl font-light text-[rgb(142,132,247)]">{score.overallScore}</span>
                      <span className="text-2xl text-white/40">/100</span>
                    </div>
                    <Progress value={score.overallScore || 0} className="h-3 mt-4 bg-white/10" />
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Dimension Scores</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "Market Understanding", value: score.marketUnderstanding },
                      { label: "Business Model", value: score.businessModel },
                      { label: "Traction & Metrics", value: score.tractionMetrics },
                      { label: "Founder Clarity", value: score.founderClarity },
                      { label: "Strategic Fit", value: score.strategicFit },
                      { label: "Risk Awareness", value: score.riskAwareness },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">{item.label}</span>
                          <span className="text-white">{item.value}</span>
                        </div>
                        <Progress value={item.value || 0} className="h-1.5 bg-white/10" />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Risk Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge 
                      className={`mb-4 ${
                        score.riskLevel === "Low" 
                          ? "bg-green-500/20 text-green-400" 
                          : score.riskLevel === "Medium"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {score.riskLevel} Risk
                    </Badge>
                    <div className="space-y-2">
                      {(score.keyConcerns as string[] || []).slice(0, 3).map((concern, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 text-yellow-400 mt-1 flex-shrink-0" />
                          <span className="text-white/60 text-sm">{concern}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      Strengths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(feedback.strengths as string[] || []).map((strength, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                          <span className="text-white/80">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                      Areas for Improvement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(feedback.criticalGaps as string[] || []).map((gap, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <span className="text-white/80">{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Detailed Feedback</CardTitle>
                  <CardDescription className="text-white/40">Investor-style assessment memo</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-white/80 whitespace-pre-wrap">{feedback.fullFeedback}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[rgb(142,132,247)]" />
                    Recommended Next Steps
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {(feedback.nextSteps as string[] || []).map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[rgb(142,132,247)] text-sm">{i + 1}</span>
                        </div>
                        <span className="text-white/80">{step}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setView("landing");
                    setCurrentInterviewId(null);
                  }}
                  className="border-white/20 text-white/70"
                  data-testid="button-new-interview"
                >
                  Start New Interview
                </Button>
                <Button
                  onClick={() => navigate("/app/dashboard")}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                  data-testid="button-go-dashboard"
                >
                  Go to Dashboard
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
