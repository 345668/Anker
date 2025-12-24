import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { 
  FolderOpen, Plus, FileText, StickyNote, Target, 
  ArrowLeft, MoreVertical, Search, Trash2, Pencil,
  Check, Clock, XCircle, Lock, Unlock, Users, ChevronRight
} from "lucide-react";
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
import type { DealRoom, DealRoomDocument, DealRoomNote, DealRoomMilestone, Deal } from "@shared/schema";

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
  
  const { toast } = useToast();

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

  if (roomId && currentRoom) {
    const deal = deals?.find(d => d.id === currentRoom.dealId);
    
    return (
      <div className="h-full flex flex-col p-6 overflow-y-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/app/deal-rooms">
            <Button variant="ghost" size="icon" data-testid="button-back-rooms">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-room-name">{currentRoom.name}</h1>
            {deal && (
              <p className="text-sm text-muted-foreground">Deal: {deal.title}</p>
            )}
          </div>
          <Badge variant={currentRoom.accessLevel === "private" ? "secondary" : "outline"}>
            {currentRoom.accessLevel === "private" ? (
              <><Lock className="h-3 w-3 mr-1" /> Private</>
            ) : (
              <><Unlock className="h-3 w-3 mr-1" /> Shared</>
            )}
          </Badge>
        </div>

        <Tabs defaultValue="documents" className="flex-1">
          <TabsList className="mb-4">
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents ({documents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <StickyNote className="h-4 w-4 mr-2" />
              Notes ({notes?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="milestones" data-testid="tab-milestones">
              <Target className="h-4 w-4 mr-2" />
              Milestones ({milestones?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Documents</h3>
              <Button onClick={() => setAddDocOpen(true)} data-testid="button-add-document">
                <Plus className="h-4 w-4 mr-2" /> Add Document
              </Button>
            </div>
            {documents?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No documents yet. Add your first document to this deal room.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {documents?.map(doc => (
                  <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="secondary" className="text-xs">
                              {documentTypes.find(t => t.value === doc.type)?.label || doc.type}
                            </Badge>
                            {doc.createdAt && (
                              <span>{format(new Date(doc.createdAt), "MMM d, yyyy")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={doc.url} target="_blank" rel="noopener noreferrer">View</a>
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteDocMutation.mutate(doc.id)}
                          data-testid={`button-delete-doc-${doc.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Notes</h3>
              <Button onClick={() => setAddNoteOpen(true)} data-testid="button-add-note">
                <Plus className="h-4 w-4 mr-2" /> Add Note
              </Button>
            </div>
            {notes?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No notes yet. Add your first note to this deal room.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {notes?.map(note => (
                  <Card key={note.id} data-testid={`card-note-${note.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          {note.isPinned && <Badge variant="outline" className="text-xs">Pinned</Badge>}
                          {note.title || "Untitled Note"}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {note.isPrivate && (
                            <Badge variant="secondary" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" /> Private
                            </Badge>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteNoteMutation.mutate(note.id)}
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {note.createdAt && (
                        <CardDescription>
                          {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="milestones" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Milestones</h3>
              <Button onClick={() => setAddMilestoneOpen(true)} data-testid="button-add-milestone">
                <Plus className="h-4 w-4 mr-2" /> Add Milestone
              </Button>
            </div>
            {milestones?.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No milestones yet. Track key progress points by adding milestones.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {milestones?.map(milestone => {
                  const statusConfig = milestoneStatuses.find(s => s.value === milestone.status) || milestoneStatuses[0];
                  const StatusIcon = statusConfig.icon;
                  return (
                    <Card key={milestone.id} data-testid={`card-milestone-${milestone.id}`}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full bg-muted ${statusConfig.color}`}>
                            <StatusIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">{milestone.title}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs capitalize">{milestone.priority}</Badge>
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
                            <SelectTrigger className="w-[140px]" data-testid={`select-status-${milestone.id}`}>
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
                              <Button variant="ghost" size="icon">
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Name</Label>
                <Input 
                  value={docForm.name}
                  onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Document name"
                  data-testid="input-doc-name"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={docForm.type} onValueChange={v => setDocForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger data-testid="select-doc-type">
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
                <Label>URL</Label>
                <Input 
                  value={docForm.url}
                  onChange={e => setDocForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  data-testid="input-doc-url"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={docForm.description}
                  onChange={e => setDocForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-doc-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDocOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createDocMutation.mutate(docForm)}
                disabled={!docForm.name || createDocMutation.isPending}
                data-testid="button-save-document"
              >
                Add Document
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addNoteOpen} onOpenChange={setAddNoteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Title (optional)</Label>
                <Input 
                  value={noteForm.title}
                  onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Note title"
                  data-testid="input-note-title"
                />
              </div>
              <div>
                <Label>Content</Label>
                <Textarea 
                  value={noteForm.content}
                  onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Write your note..."
                  rows={5}
                  data-testid="input-note-content"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <Checkbox 
                    checked={noteForm.isPrivate}
                    onCheckedChange={c => setNoteForm(f => ({ ...f, isPrivate: c === true }))}
                    data-testid="checkbox-note-private"
                  />
                  Private
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox 
                    checked={noteForm.isPinned}
                    onCheckedChange={c => setNoteForm(f => ({ ...f, isPinned: c === true }))}
                    data-testid="checkbox-note-pinned"
                  />
                  Pin to top
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddNoteOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createNoteMutation.mutate(noteForm)}
                disabled={!noteForm.content || createNoteMutation.isPending}
                data-testid="button-save-note"
              >
                Add Note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addMilestoneOpen} onOpenChange={setAddMilestoneOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Title</Label>
                <Input 
                  value={milestoneForm.title}
                  onChange={e => setMilestoneForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Milestone title"
                  data-testid="input-milestone-title"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={milestoneForm.description}
                  onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  data-testid="input-milestone-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select value={milestoneForm.priority} onValueChange={v => setMilestoneForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger data-testid="select-milestone-priority">
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
                  <Label>Due Date</Label>
                  <Input 
                    type="date"
                    value={milestoneForm.dueDate}
                    onChange={e => setMilestoneForm(f => ({ ...f, dueDate: e.target.value }))}
                    data-testid="input-milestone-due-date"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMilestoneOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMilestoneMutation.mutate({
                  ...milestoneForm,
                  dueDate: milestoneForm.dueDate || undefined,
                })}
                disabled={!milestoneForm.title || createMilestoneMutation.isPending}
                data-testid="button-save-milestone"
              >
                Add Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editMilestoneOpen} onOpenChange={setEditMilestoneOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Title</Label>
                <Input 
                  value={milestoneForm.title}
                  onChange={e => setMilestoneForm(f => ({ ...f, title: e.target.value }))}
                  data-testid="input-edit-milestone-title"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={milestoneForm.description}
                  onChange={e => setMilestoneForm(f => ({ ...f, description: e.target.value }))}
                  data-testid="input-edit-milestone-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={milestoneForm.status} onValueChange={v => setMilestoneForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger data-testid="select-edit-milestone-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {milestoneStatuses.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={milestoneForm.priority} onValueChange={v => setMilestoneForm(f => ({ ...f, priority: v }))}>
                    <SelectTrigger data-testid="select-edit-milestone-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input 
                  type="date"
                  value={milestoneForm.dueDate}
                  onChange={e => setMilestoneForm(f => ({ ...f, dueDate: e.target.value }))}
                  data-testid="input-edit-milestone-due-date"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMilestoneOpen(false)}>Cancel</Button>
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
                data-testid="button-update-milestone"
              >
                Update Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-deal-rooms-title">Deal Rooms</h1>
          <p className="text-muted-foreground">Virtual data rooms for sharing documents and tracking deal progress</p>
        </div>
        <Button onClick={() => setCreateRoomOpen(true)} data-testid="button-create-room">
          <Plus className="h-4 w-4 mr-2" /> Create Room
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search deal rooms..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-rooms"
          />
        </div>
      </div>

      {roomsLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      ) : filteredRooms?.length === 0 ? (
        <Card className="flex-1 flex items-center justify-center">
          <CardContent className="text-center py-12">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No deal rooms yet</h3>
            <p className="text-muted-foreground mb-4">Create your first deal room to start organizing documents and tracking milestones.</p>
            <Button onClick={() => setCreateRoomOpen(true)} data-testid="button-create-first-room">
              <Plus className="h-4 w-4 mr-2" /> Create Deal Room
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRooms?.map(room => {
            const deal = deals?.find(d => d.id === room.dealId);
            return (
              <Card key={room.id} className="hover-elevate cursor-pointer" data-testid={`card-room-${room.id}`}>
                <Link href={`/app/deal-rooms/${room.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{room.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {room.accessLevel === "private" ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      </Badge>
                    </div>
                    {deal && (
                      <CardDescription>{deal.title}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    {room.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{room.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Deal Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Select Deal</Label>
              <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                <SelectTrigger data-testid="select-deal">
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
              <Label>Room Name</Label>
              <Input 
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                placeholder="e.g., Due Diligence Documents"
                data-testid="input-room-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea 
                value={newRoomDescription}
                onChange={e => setNewRoomDescription(e.target.value)}
                placeholder="Optional description..."
                data-testid="input-room-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRoomOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createRoomMutation.mutate({
                dealId: selectedDealId,
                name: newRoomName,
                description: newRoomDescription || undefined,
              })}
              disabled={!selectedDealId || !newRoomName || createRoomMutation.isPending}
              data-testid="button-save-room"
            >
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
