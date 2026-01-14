import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { 
  FolderOpen, Plus, FileText, StickyNote, Target, 
  ArrowLeft, MoreVertical, Search, Trash2, Pencil,
  Check, Clock, XCircle, Lock, Unlock, Users, ChevronRight,
  Brain, Loader2, CheckCircle2, Circle, AlertCircle, TrendingUp, TrendingDown,
  Sparkles, BarChart3, RefreshCw, GitBranch, Briefcase, Calendar,
  Upload, File
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { DealRoom, DealRoomDocument, DealRoomNote, DealRoomMilestone, Deal, PitchDeckAnalysis } from "@shared/schema";

const documentTypes = [
  { value: "pitch_deck", label: "Pitch Deck" },
  { value: "financials", label: "Financials" },
  { value: "legal", label: "Legal" },
  { value: "cap_table", label: "Cap Table" },
  { value: "other", label: "Other" },
];

const milestoneStatuses = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-white/50" },
  { value: "in_progress", label: "In Progress", icon: Clock, color: "text-[rgb(254,212,92)]" },
  { value: "completed", label: "Completed", icon: Check, color: "text-[rgb(196,227,230)]" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-[rgb(251,194,213)]" },
];

const subNavItems = [
  { label: "Deal Rooms", href: "/app/deal-rooms", icon: FolderOpen },
  { label: "Pipeline", href: "/app/pipeline", icon: GitBranch },
  { label: "Deal Flow", href: "/app/deal-flow", icon: Briefcase },
  { label: "Calendar", href: "/app/calendar", icon: Calendar },
];

function SubNavigation() {
  const [location] = useLocation();
  
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
      {subNavItems.map((item) => {
        const isActive = location === item.href || (item.href !== "/app/deal-rooms" && location.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

export default function DealRooms() {
  const [, params] = useRoute("/app/deal-rooms/:roomId");
  const roomId = params?.roomId;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false);
  const [editMilestoneOpen, setEditMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<DealRoomMilestone | null>(null);
  
  const [docForm, setDocForm] = useState({ name: "", type: "other", url: "", description: "" });
  const [noteForm, setNoteForm] = useState({ title: "", content: "", isPrivate: false, isPinned: false });
  const [milestoneForm, setMilestoneForm] = useState({ title: "", description: "", status: "pending", priority: "medium", dueDate: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { uploadFile } = useUpload({
    onError: (error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    }
  });

  const { data: deals } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const { data: rooms, isLoading: roomsLoading } = useQuery<DealRoom[]>({
    queryKey: ["/api/deal-rooms"],
  });

  const { data: currentRoom } = useQuery<DealRoom>({
    queryKey: ["/api/deal-rooms", roomId],
    enabled: !!roomId,
  });

  const { data: documents } = useQuery<DealRoomDocument[]>({
    queryKey: ["/api/deal-rooms", roomId, "documents"],
    enabled: !!roomId,
  });

  const { data: notes } = useQuery<DealRoomNote[]>({
    queryKey: ["/api/deal-rooms", roomId, "notes"],
    enabled: !!roomId,
  });

  const { data: milestones } = useQuery<DealRoomMilestone[]>({
    queryKey: ["/api/deal-rooms", roomId, "milestones"],
    enabled: !!roomId,
  });

  const { data: analyses, refetch: refetchAnalyses } = useQuery<PitchDeckAnalysis[]>({
    queryKey: ["/api/deal-rooms", roomId, "analyses"],
    enabled: !!roomId,
    refetchInterval: (query) => {
      const data = query.state.data as PitchDeckAnalysis[] | undefined;
      if (data?.some(a => a.status === "analyzing")) {
        return 2000;
      }
      return false;
    },
  });

  const createAnalysisMutation = useMutation({
    mutationFn: async (data: { documentId?: string; pitchDeckContent?: string }) => {
      return apiRequest("POST", `/api/deal-rooms/${roomId}/analyses`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "analyses"] });
      toast({ title: "AI analysis started", description: "This may take a minute to complete." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start analysis", description: error.message, variant: "destructive" });
    },
  });

  const deleteAnalysisMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/pitch-deck-analyses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "analyses"] });
      toast({ title: "Analysis deleted" });
    },
  });

  const createRoomMutation = useMutation({
    mutationFn: async (data: { dealId: string; name: string; description?: string }) => {
      return apiRequest("POST", "/api/deal-rooms", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
      setCreateRoomOpen(false);
      setNewRoomName("");
      setNewRoomDescription("");
      setSelectedDealId("");
      toast({ title: "Deal room created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create room", description: error.message, variant: "destructive" });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deal-rooms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
      toast({ title: "Deal room deleted" });
    },
  });

  const createDocMutation = useMutation({
    mutationFn: async (data: { name: string; type?: string; url?: string; description?: string }) => {
      return apiRequest("POST", `/api/deal-rooms/${roomId}/documents`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "documents"] });
      setAddDocOpen(false);
      setDocForm({ name: "", type: "other", url: "", description: "" });
      toast({ title: "Document added" });
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; objectPath: string; size: number; mimeType: string; description?: string }) => {
      return apiRequest("POST", `/api/deal-rooms/${roomId}/documents/upload`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "documents"] });
      setAddDocOpen(false);
      setDocForm({ name: "", type: "other", url: "", description: "" });
      setSelectedFile(null);
      toast({ title: "Document uploaded", description: "Text extraction is in progress..." });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docForm.name) {
        setDocForm(prev => ({ ...prev, name: file.name }));
      }
    }
  };

  const handleDocumentSubmit = async () => {
    // Require either a file upload or a URL
    if (!selectedFile && !docForm.url) {
      toast({ title: "Missing document", description: "Please upload a file or provide a URL", variant: "destructive" });
      return;
    }
    
    if (selectedFile) {
      setIsUploadingFile(true);
      try {
        const response = await uploadFile(selectedFile);
        if (response) {
          uploadDocMutation.mutate({
            name: docForm.name || selectedFile.name,
            type: docForm.type,
            objectPath: response.objectPath,
            size: selectedFile.size,
            mimeType: selectedFile.type || "application/octet-stream",
            description: docForm.description
          });
        }
      } finally {
        setIsUploadingFile(false);
      }
    } else if (docForm.url) {
      if (!docForm.name) {
        toast({ title: "Missing name", description: "Please provide a document name", variant: "destructive" });
        return;
      }
      createDocMutation.mutate(docForm);
    }
  };

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deal-room-documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "documents"] });
      toast({ title: "Document deleted" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { title?: string; content: string; isPrivate?: boolean; isPinned?: boolean }) => {
      return apiRequest("POST", `/api/deal-rooms/${roomId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "notes"] });
      setAddNoteOpen(false);
      setNoteForm({ title: "", content: "", isPrivate: false, isPinned: false });
      toast({ title: "Note added" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deal-room-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "notes"] });
      toast({ title: "Note deleted" });
    },
  });

  const createMilestoneMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; status?: string; priority?: string; dueDate?: string }) => {
      return apiRequest("POST", `/api/deal-rooms/${roomId}/milestones`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "milestones"] });
      setAddMilestoneOpen(false);
      setMilestoneForm({ title: "", description: "", status: "pending", priority: "medium", dueDate: "" });
      toast({ title: "Milestone added" });
    },
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title?: string; description?: string | null; status?: string; priority?: string; dueDate?: string | null } }) => {
      return apiRequest("PATCH", `/api/deal-room-milestones/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "milestones"] });
      setEditMilestoneOpen(false);
      setEditingMilestone(null);
      toast({ title: "Milestone updated" });
    },
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deal-room-milestones/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms", roomId, "milestones"] });
      toast({ title: "Milestone deleted" });
    },
  });

  const filteredRooms = rooms?.filter(room => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (roomsLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (roomId && currentRoom) {
    const deal = deals?.find(d => d.id === currentRoom.dealId);
    
    return (
      <AppLayout
        title={currentRoom.name}
        subtitle={deal ? `Deal: ${deal.title}` : "Virtual data room for collaboration"}
        heroHeight="30vh"
        videoUrl={videoBackgrounds.dealrooms}
      >
        <div className="py-12 bg-[rgb(18,18,18)]">
          <div className="max-w-7xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <SubNavigation />
              
              <div className="flex items-center gap-4 mb-8">
                <Link href="/app/deal-rooms">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
                    data-testid="button-back-rooms"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <Badge 
                  variant="outline" 
                  className={`${currentRoom.accessLevel === "private" 
                    ? "bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-[rgb(142,132,247)]/30" 
                    : "bg-white/10 text-white/70 border-white/20"}`}
                >
                  {currentRoom.accessLevel === "private" ? (
                    <><Lock className="h-3 w-3 mr-1" /> Private</>
                  ) : (
                    <><Unlock className="h-3 w-3 mr-1" /> Shared</>
                  )}
                </Badge>
              </div>

              <Tabs defaultValue="documents" className="w-full">
                <TabsList className="mb-6 bg-white/5 border border-white/10 p-1">
                  <TabsTrigger 
                    value="documents" 
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)] data-[state=active]:text-white text-white/60"
                    data-testid="tab-documents"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Documents ({documents?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="notes" 
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)] data-[state=active]:text-white text-white/60"
                    data-testid="tab-notes"
                  >
                    <StickyNote className="h-4 w-4 mr-2" />
                    Notes ({notes?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="milestones" 
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)] data-[state=active]:text-white text-white/60"
                    data-testid="tab-milestones"
                  >
                    <Target className="h-4 w-4 mr-2" />
                    Milestones ({milestones?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="analysis" 
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)] data-[state=active]:text-white text-white/60"
                    data-testid="tab-analysis"
                  >
                    <Brain className="h-4 w-4 mr-2" />
                    AI Analysis ({analyses?.length || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="documents" className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-light text-white">Documents</h3>
                    <Button 
                      onClick={() => setAddDocOpen(true)} 
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      data-testid="button-add-document"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Document
                    </Button>
                  </div>
                  {documents?.length === 0 ? (
                    <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
                      <FileText className="h-12 w-12 mx-auto text-white/30 mb-4" />
                      <p className="text-white/50">No documents yet. Add your first document to this deal room.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documents?.map(doc => (
                        <div 
                          key={doc.id} 
                          className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/8 transition-colors"
                          data-testid={`card-document-${doc.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                              <FileText className="h-5 w-5 text-[rgb(142,132,247)]" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{doc.name}</p>
                              <div className="flex items-center gap-2 text-sm text-white/50 flex-wrap">
                                <Badge variant="outline" className="text-xs bg-white/5 text-white/60 border-white/20">
                                  {documentTypes.find(t => t.value === doc.type)?.label || doc.type}
                                </Badge>
                                {doc.size && (
                                  <span>{(doc.size / 1024).toFixed(1)} KB</span>
                                )}
                                {doc.createdAt && (
                                  <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                                )}
                                {doc.processingStatus === "processing" && (
                                  <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Processing
                                  </Badge>
                                )}
                                {doc.processingStatus === "completed" && doc.extractedText && (
                                  <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Text Extracted
                                  </Badge>
                                )}
                                {doc.processingStatus === "failed" && (
                                  <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Failed
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(doc.objectPath || doc.url) && (
                              <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:bg-white/10" asChild>
                                <a href={doc.objectPath || doc.url || "#"} target="_blank" rel="noopener noreferrer">
                                  <FileText className="w-3 h-3 mr-1" />
                                  View
                                </a>
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="text-white/50 hover:text-red-400 hover:bg-red-400/10"
                              onClick={() => deleteDocMutation.mutate(doc.id)}
                              data-testid={`button-delete-doc-${doc.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="notes" className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-light text-white">Notes</h3>
                    <Button 
                      onClick={() => setAddNoteOpen(true)}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      data-testid="button-add-note"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Note
                    </Button>
                  </div>
                  {notes?.length === 0 ? (
                    <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
                      <StickyNote className="h-12 w-12 mx-auto text-white/30 mb-4" />
                      <p className="text-white/50">No notes yet. Add your first note to this deal room.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {notes?.map(note => (
                        <div 
                          key={note.id} 
                          className="p-4 rounded-xl bg-white/5 border border-white/10"
                          data-testid={`card-note-${note.id}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {note.isPinned && (
                                <Badge variant="outline" className="text-xs bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-[rgb(254,212,92)]/30">
                                  Pinned
                                </Badge>
                              )}
                              <h4 className="font-medium text-white">{note.title || "Untitled Note"}</h4>
                            </div>
                            <div className="flex items-center gap-1">
                              {note.isPrivate && (
                                <Badge variant="secondary" className="text-xs bg-white/10 text-white/60">
                                  <Lock className="h-3 w-3 mr-1" /> Private
                                </Badge>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="text-white/50 hover:text-red-400 hover:bg-red-400/10"
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                data-testid={`button-delete-note-${note.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {note.createdAt && (
                            <p className="text-xs text-white/40 mb-2">
                              {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          )}
                          <p className="text-sm text-white/70 whitespace-pre-wrap">{note.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="milestones" className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-light text-white">Milestones</h3>
                    <Button 
                      onClick={() => setAddMilestoneOpen(true)}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      data-testid="button-add-milestone"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Milestone
                    </Button>
                  </div>
                  {milestones?.length === 0 ? (
                    <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
                      <Target className="h-12 w-12 mx-auto text-white/30 mb-4" />
                      <p className="text-white/50">No milestones yet. Track key progress points by adding milestones.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {milestones?.map(milestone => {
                        const statusConfig = milestoneStatuses.find(s => s.value === milestone.status) || milestoneStatuses[0];
                        const StatusIcon = statusConfig.icon;
                        return (
                          <div 
                            key={milestone.id} 
                            className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                            data-testid={`card-milestone-${milestone.id}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-full bg-white/5 ${statusConfig.color}`}>
                                <StatusIcon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium text-white">{milestone.title}</p>
                                <div className="flex items-center gap-2 text-sm text-white/50">
                                  <Badge variant="outline" className="text-xs capitalize bg-white/5 text-white/60 border-white/20">
                                    {milestone.priority}
                                  </Badge>
                                  {milestone.dueDate && (
                                    <span>Due: {format(new Date(milestone.dueDate), "MMM d, yyyy")}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select
                                value={milestone.status || "pending"}
                                onValueChange={(value) => updateMilestoneMutation.mutate({ id: milestone.id, data: { status: value } })}
                              >
                                <SelectTrigger 
                                  className="w-[140px] bg-white/5 border-white/10 text-white"
                                  data-testid={`select-status-${milestone.id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {milestoneStatuses.map(s => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => {
                                    setEditingMilestone(milestone);
                                    setMilestoneForm({
                                      title: milestone.title,
                                      description: milestone.description || "",
                                      status: milestone.status || "pending",
                                      priority: milestone.priority || "medium",
                                      dueDate: milestone.dueDate ? format(new Date(milestone.dueDate), "yyyy-MM-dd") : "",
                                    });
                                    setEditMilestoneOpen(true);
                                  }}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="analysis" className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-light text-white">AI-Powered Pitch Deck Analysis</h3>
                      <p className="text-sm text-white/50">
                        Get comprehensive feedback and scoring for your investment opportunity
                      </p>
                    </div>
                    <Button 
                      onClick={() => createAnalysisMutation.mutate({})}
                      disabled={createAnalysisMutation.isPending}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      data-testid="button-start-analysis"
                    >
                      {createAnalysisMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Start New Analysis
                    </Button>
                  </div>

                  {analyses?.length === 0 ? (
                    <div className="p-12 rounded-xl bg-white/5 border border-white/10 text-center">
                      <Brain className="h-12 w-12 mx-auto text-[rgb(142,132,247)] mb-4" />
                      <h4 className="text-lg font-medium text-white mb-2">No analyses yet</h4>
                      <p className="text-sm text-white/50 mb-4 max-w-md mx-auto">
                        Start an AI analysis to get detailed feedback on your pitch deck,
                        including scores across 10 categories and actionable recommendations.
                      </p>
                      <Button 
                        onClick={() => createAnalysisMutation.mutate({})}
                        disabled={createAnalysisMutation.isPending}
                        className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                      >
                        <Sparkles className="h-4 w-4 mr-2" /> Start First Analysis
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {analyses?.map(analysis => (
                        <div 
                          key={analysis.id} 
                          className="p-6 rounded-xl bg-white/5 border border-white/10"
                          data-testid={`card-analysis-${analysis.id}`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              {analysis.status === "analyzing" ? (
                                <div className="p-2 rounded-full bg-[rgb(254,212,92)]/20">
                                  <Loader2 className="h-5 w-5 text-[rgb(254,212,92)] animate-spin" />
                                </div>
                              ) : analysis.status === "completed" ? (
                                <div className="p-2 rounded-full bg-[rgb(196,227,230)]/20">
                                  <CheckCircle2 className="h-5 w-5 text-[rgb(196,227,230)]" />
                                </div>
                              ) : (
                                <div className="p-2 rounded-full bg-red-400/20">
                                  <AlertCircle className="h-5 w-5 text-red-400" />
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-white">
                                  {analysis.status === "analyzing" ? "Analyzing..." : 
                                   analysis.status === "completed" ? "Analysis Complete" : "Analysis Failed"}
                                </p>
                                {analysis.createdAt && (
                                  <p className="text-sm text-white/50">
                                    {format(new Date(analysis.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-white/50 hover:text-red-400 hover:bg-red-400/10"
                              onClick={() => deleteAnalysisMutation.mutate(analysis.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {analysis.status === "completed" && analysis.overallScore && (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              <div className="p-4 rounded-lg bg-white/5">
                                <p className="text-sm text-white/50 mb-1">Overall Score</p>
                                <p className="text-3xl font-bold text-[rgb(142,132,247)]">
                                  {analysis.overallScore}/100
                                </p>
                              </div>
                              {analysis.recommendations && Array.isArray(analysis.recommendations) && analysis.recommendations.length > 0 && (
                                <div className="p-4 rounded-lg bg-white/5 md:col-span-2">
                                  <p className="text-sm text-white/50 mb-1">Recommendations</p>
                                  <p className="text-white">{analysis.recommendations.length} actionable insights available</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
          onChange={handleFileSelect}
          data-testid="input-file-upload"
        />

        {/* Dialogs */}
        <Dialog open={addDocOpen} onOpenChange={(open) => {
          setAddDocOpen(open);
          if (!open) {
            setSelectedFile(null);
            setDocForm({ name: "", type: "other", url: "", description: "" });
          }
        }}>
          <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Add Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-white/70">Upload File</Label>
                <div 
                  className="mt-2 border-2 border-dashed border-white/20 rounded-xl p-6 text-center cursor-pointer hover:border-white/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <File className="w-8 h-8 text-[rgb(142,132,247)]" />
                      <div className="text-left">
                        <p className="text-white font-medium">{selectedFile.name}</p>
                        <p className="text-white/50 text-sm">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-white/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 mx-auto text-white/40 mb-2" />
                      <p className="text-white/60 text-sm">Click to upload PDF, Word, or Excel file</p>
                      <p className="text-white/40 text-xs mt-1">Supported: .pdf, .doc, .docx, .xls, .xlsx, .csv</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/40 text-sm">or add by URL</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <div>
                <Label className="text-white/70">URL (optional)</Label>
                <Input 
                  value={docForm.url}
                  onChange={e => setDocForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                  className="bg-white/5 border-white/10 text-white"
                  disabled={!!selectedFile}
                  data-testid="input-doc-url"
                />
              </div>

              <div>
                <Label className="text-white/70">Document Name</Label>
                <Input 
                  value={docForm.name}
                  onChange={e => setDocForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Q4 Financial Report"
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-doc-name"
                />
              </div>
              <div>
                <Label className="text-white/70">Type</Label>
                <Select value={docForm.type} onValueChange={v => setDocForm(prev => ({ ...prev, type: v }))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70">Description (optional)</Label>
                <Textarea 
                  value={docForm.description}
                  onChange={e => setDocForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description..."
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-doc-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDocOpen(false)} className="border-white/20 text-white/70">
                Cancel
              </Button>
              <Button 
                onClick={handleDocumentSubmit}
                disabled={(!selectedFile && !docForm.url) || createDocMutation.isPending || uploadDocMutation.isPending || isUploadingFile}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                data-testid="button-save-document"
              >
                {isUploadingFile || uploadDocMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : selectedFile ? (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </>
                ) : (
                  "Add Document"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addNoteOpen} onOpenChange={setAddNoteOpen}>
          <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-white/70">Title (optional)</Label>
                <Input 
                  value={noteForm.title}
                  onChange={e => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Note title..."
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-note-title"
                />
              </div>
              <div>
                <Label className="text-white/70">Content</Label>
                <Textarea 
                  value={noteForm.content}
                  onChange={e => setNoteForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Write your note..."
                  rows={5}
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-note-content"
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={noteForm.isPrivate}
                    onCheckedChange={(c) => setNoteForm(prev => ({ ...prev, isPrivate: !!c }))}
                    data-testid="checkbox-note-private"
                  />
                  <Label className="text-white/70">Private</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={noteForm.isPinned}
                    onCheckedChange={(c) => setNoteForm(prev => ({ ...prev, isPinned: !!c }))}
                    data-testid="checkbox-note-pinned"
                  />
                  <Label className="text-white/70">Pinned</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddNoteOpen(false)} className="border-white/20 text-white/70">
                Cancel
              </Button>
              <Button 
                onClick={() => createNoteMutation.mutate(noteForm)}
                disabled={!noteForm.content || createNoteMutation.isPending}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                data-testid="button-save-note"
              >
                Add Note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addMilestoneOpen} onOpenChange={setAddMilestoneOpen}>
          <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Add Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-white/70">Title</Label>
                <Input 
                  value={milestoneForm.title}
                  onChange={e => setMilestoneForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Complete Due Diligence"
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-milestone-title"
                />
              </div>
              <div>
                <Label className="text-white/70">Description (optional)</Label>
                <Textarea 
                  value={milestoneForm.description}
                  onChange={e => setMilestoneForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this milestone..."
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-milestone-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white/70">Priority</Label>
                  <Select value={milestoneForm.priority} onValueChange={v => setMilestoneForm(prev => ({ ...prev, priority: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-milestone-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white/70">Due Date</Label>
                  <Input 
                    type="date"
                    value={milestoneForm.dueDate}
                    onChange={e => setMilestoneForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white"
                    data-testid="input-milestone-due-date"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMilestoneOpen(false)} className="border-white/20 text-white/70">
                Cancel
              </Button>
              <Button 
                onClick={() => createMilestoneMutation.mutate(milestoneForm)}
                disabled={!milestoneForm.title || createMilestoneMutation.isPending}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                data-testid="button-save-milestone"
              >
                Add Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editMilestoneOpen} onOpenChange={setEditMilestoneOpen}>
          <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Edit Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-white/70">Title</Label>
                <Input 
                  value={milestoneForm.title}
                  onChange={e => setMilestoneForm(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-edit-milestone-title"
                />
              </div>
              <div>
                <Label className="text-white/70">Description</Label>
                <Textarea 
                  value={milestoneForm.description}
                  onChange={e => setMilestoneForm(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-edit-milestone-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white/70">Priority</Label>
                  <Select value={milestoneForm.priority} onValueChange={v => setMilestoneForm(prev => ({ ...prev, priority: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-edit-milestone-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white/70">Due Date</Label>
                  <Input 
                    type="date"
                    value={milestoneForm.dueDate}
                    onChange={e => setMilestoneForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white"
                    data-testid="input-edit-milestone-due-date"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMilestoneOpen(false)} className="border-white/20 text-white/70">
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (editingMilestone) {
                    updateMilestoneMutation.mutate({
                      id: editingMilestone.id,
                      data: {
                        title: milestoneForm.title,
                        description: milestoneForm.description || null,
                        status: milestoneForm.status,
                        priority: milestoneForm.priority,
                        dueDate: milestoneForm.dueDate || null,
                      },
                    });
                  }
                }}
                disabled={!milestoneForm.title || updateMilestoneMutation.isPending}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                data-testid="button-update-milestone"
              >
                Update Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Deal Rooms"
      subtitle="Virtual data rooms for sharing documents and tracking deal progress"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.dealrooms}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <SubNavigation />

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input 
                  placeholder="Search deal rooms..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[rgb(142,132,247)]"
                  data-testid="input-search-rooms"
                />
              </div>
              <Button 
                onClick={() => setCreateRoomOpen(true)}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                data-testid="button-create-room"
              >
                <Plus className="h-4 w-4 mr-2" /> Create Room
              </Button>
            </div>

            {filteredRooms?.length === 0 ? (
              <div className="p-12 rounded-xl bg-white/5 border border-white/10 text-center">
                <FolderOpen className="h-16 w-16 mx-auto text-[rgb(142,132,247)] mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No deal rooms yet</h3>
                <p className="text-white/50 mb-6 max-w-md mx-auto">
                  Create your first deal room to start organizing documents and tracking milestones.
                </p>
                <Button 
                  onClick={() => setCreateRoomOpen(true)}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                  data-testid="button-create-first-room"
                >
                  <Plus className="h-4 w-4 mr-2" /> Create Deal Room
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredRooms?.map(room => {
                  const deal = deals?.find(d => d.id === room.dealId);
                  return (
                    <Link key={room.id} href={`/app/deal-rooms/${room.id}`}>
                      <div 
                        className="p-6 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 hover:border-[rgb(142,132,247)]/50 transition-all cursor-pointer group"
                        data-testid={`card-room-${room.id}`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                              <FolderOpen className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <h3 className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                                {room.name}
                              </h3>
                              {deal && (
                                <p className="text-sm text-white/50">{deal.title}</p>
                              )}
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${room.accessLevel === "private" 
                              ? "bg-[rgb(142,132,247)]/10 text-[rgb(142,132,247)] border-[rgb(142,132,247)]/30" 
                              : "bg-white/5 text-white/60 border-white/20"}`}
                          >
                            {room.accessLevel === "private" ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                          </Badge>
                        </div>
                        {room.description && (
                          <p className="text-sm text-white/50 mb-4 line-clamp-2">{room.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-white/40">
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" /> Docs
                            </span>
                            <span className="flex items-center gap-1">
                              <StickyNote className="h-3 w-3" /> Notes
                            </span>
                            <span className="flex items-center gap-1">
                              <Target className="h-3 w-3" /> Milestones
                            </span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
        <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Create Deal Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white/70">Select Deal</Label>
              <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-deal">
                  <SelectValue placeholder="Choose a deal" />
                </SelectTrigger>
                <SelectContent>
                  {deals?.map(deal => (
                    <SelectItem key={deal.id} value={deal.id}>{deal.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/70">Room Name</Label>
              <Input 
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                placeholder="e.g., Due Diligence Documents"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-room-name"
              />
            </div>
            <div>
              <Label className="text-white/70">Description</Label>
              <Textarea 
                value={newRoomDescription}
                onChange={e => setNewRoomDescription(e.target.value)}
                placeholder="Optional description..."
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-room-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRoomOpen(false)} className="border-white/20 text-white/70">
              Cancel
            </Button>
            <Button 
              onClick={() => createRoomMutation.mutate({
                dealId: selectedDealId,
                name: newRoomName,
                description: newRoomDescription || undefined,
              })}
              disabled={!selectedDealId || !newRoomName || createRoomMutation.isPending}
              className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
              data-testid="button-save-room"
            >
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
