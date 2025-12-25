import { useState, KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Search, Users, Mail, Phone, MoreVertical, Trash2, Edit, Linkedin, Twitter, X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { Contact } from "@shared/schema";

const contactTypes = ["investor", "founder", "advisor", "other"];
const contactStatuses = ["active", "archived"];

const emptyFormData = {
  type: "investor",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  title: "",
  notes: "",
  linkedinUrl: "",
  twitterUrl: "",
  status: "active",
  tags: [] as string[],
};

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [tagInput, setTagInput] = useState("");
  const { toast } = useToast();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/contacts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      closeDialog();
      toast({ title: "Contact created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create contact", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      closeDialog();
      toast({ title: "Contact updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update contact", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete contact", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingContact(null);
    setFormData(emptyFormData);
    setTagInput("");
  };

  const openCreateDialog = () => {
    setEditingContact(null);
    setFormData(emptyFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      type: contact.type || "investor",
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      phone: contact.phone || "",
      company: contact.company || "",
      title: contact.title || "",
      notes: contact.notes || "",
      linkedinUrl: contact.linkedinUrl || "",
      twitterUrl: contact.twitterUrl || "",
      status: contact.status || "active",
      tags: Array.isArray(contact.tags) ? contact.tags : [],
    });
    setIsDialogOpen(true);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim();
      if (tag && !formData.tags.includes(tag)) {
        setFormData({ ...formData, tags: [...formData.tags, tag] });
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tagToRemove) });
  };

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch =
      !searchQuery ||
      contact.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "all" || contact.type === typeFilter;
    const matchesStatus = statusFilter === "all" || contact.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName.trim()) {
      return;
    }
    
    const submitData: Record<string, unknown> = {
      type: formData.type,
      firstName: formData.firstName.trim(),
      status: formData.status,
      tags: formData.tags,
    };
    
    const optionalFields = ["lastName", "email", "phone", "company", "title", "notes", "linkedinUrl", "twitterUrl"] as const;
    
    for (const field of optionalFields) {
      const value = formData[field].trim();
      if (editingContact) {
        const originalValue = editingContact[field] || "";
        if (value !== originalValue) {
          submitData[field] = value || null;
        }
      } else {
        if (value) {
          submitData[field] = value;
        }
      }
    }
    
    if (editingContact) {
      const originalTags = Array.isArray(editingContact.tags) ? editingContact.tags : [];
      const tagsChanged = JSON.stringify(formData.tags.sort()) !== JSON.stringify(originalTags.sort());
      if (!tagsChanged) {
        delete submitData.tags;
      }
      updateMutation.mutate({ id: editingContact.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="My Contacts"
      subtitle="Manage your professional network and connections"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.contacts}
    >
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-[rgb(28,28,28)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">{editingContact ? "Edit Contact" : "Add New Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white/70 font-light">Type</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-contact-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contactTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70 font-light">First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-contact-first-name"
                />
              </div>
              <div>
                <Label className="text-white/70 font-light">Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-contact-last-name"
                />
              </div>
            </div>

            <div>
              <Label className="text-white/70 font-light">Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-contact-email"
              />
            </div>

            <div>
              <Label className="text-white/70 font-light">Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-contact-phone"
              />
            </div>

            <div>
              <Label className="text-white/70 font-light">Company</Label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-contact-company"
              />
            </div>

            <div>
              <Label className="text-white/70 font-light">Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-contact-title"
              />
            </div>

            <div>
              <Label className="text-white/70 font-light">LinkedIn URL</Label>
              <Input
                value={formData.linkedinUrl}
                onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-contact-linkedin"
              />
            </div>

            <div>
              <Label className="text-white/70 font-light">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-contact-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contactStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white/70 font-light">Tags</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-white"
                      data-testid={`button-remove-tag-${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type and press Enter to add tags"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                data-testid="input-contact-tags"
              />
            </div>

            <div>
              <Label className="text-white/70 font-light">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-contact-notes"
                rows={3}
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-12 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-submit-contact"
            >
              {isPending ? (editingContact ? "Updating..." : "Creating...") : (editingContact ? "Update Contact" : "Create Contact")}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row gap-4 mb-8"
          >
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                data-testid="input-search-contacts"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {contactTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {contactStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button 
              onClick={openCreateDialog}
              className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(196,227,230)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
              data-testid="button-add-contact"
            >
              <Plus className="w-5 h-5" />
              Add Contact
            </button>
          </motion.div>

          {filteredContacts.length === 0 ? (
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
                <Users className="w-10 h-10 text-[rgb(142,132,247)]" />
              </div>
              <h3 className="text-2xl font-light text-white mb-2">
                No contacts found
              </h3>
              <p className="text-white/50 font-light mb-8 max-w-md mx-auto">
                {contacts.length === 0
                  ? "Start building your network by adding contacts."
                  : "Try adjusting your search or filters."}
              </p>
              {contacts.length === 0 && (
                <button 
                  onClick={openCreateDialog}
                  className="h-12 px-8 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                  data-testid="button-add-first-contact"
                >
                  <Plus className="w-5 h-5" />
                  Add Your First Contact
                </button>
              )}
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredContacts.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <Card className="hover-elevate bg-white/5 border-white/10 overflow-visible" data-testid={`card-contact-${contact.id}`}>
                    <CardHeader className="flex flex-row items-start gap-4">
                      <Avatar className="h-14 w-14 border-2 border-white/10">
                        <AvatarImage src={contact.avatar || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium">
                          {contact.firstName?.charAt(0)}
                          {contact.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg font-light truncate text-white">
                          {contact.firstName} {contact.lastName}
                        </CardTitle>
                        {contact.title && (
                          <p className="text-sm text-white/50 font-light truncate">
                            {contact.title}
                          </p>
                        )}
                        {contact.company && (
                          <p className="text-sm font-medium text-[rgb(142,132,247)] truncate">
                            {contact.company}
                          </p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-white/40 hover:text-white" data-testid={`button-contact-menu-${contact.id}`}>
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[rgb(28,28,28)] border-white/10">
                          <DropdownMenuItem
                            onClick={() => openEditDialog(contact)}
                            className="text-white/70 focus:text-white"
                            data-testid={`button-edit-contact-${contact.id}`}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-400 focus:text-red-300"
                            onClick={() => deleteMutation.mutate(contact.id)}
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge 
                          className="capitalize bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0"
                        >
                          {contact.type}
                        </Badge>
                        {contact.status && contact.status !== "active" && (
                          <Badge variant="outline" className="capitalize border-white/20 text-white/60">
                            {contact.status}
                          </Badge>
                        )}
                        {Array.isArray(contact.tags) && contact.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs border-white/20 text-white/60">
                            <Tag className="w-3 h-3 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                        {Array.isArray(contact.tags) && contact.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                            +{contact.tags.length - 2}
                          </Badge>
                        )}
                      </div>

                      {contact.email && (
                        <div className="flex items-center gap-3 text-sm">
                          <Mail className="w-4 h-4 text-[rgb(196,227,230)]" />
                          <a href={`mailto:${contact.email}`} className="text-white/70 hover:text-white transition-colors truncate">
                            {contact.email}
                          </a>
                        </div>
                      )}

                      {contact.phone && (
                        <div className="flex items-center gap-3 text-sm">
                          <Phone className="w-4 h-4 text-[rgb(251,194,213)]" />
                          <span className="text-white/70">{contact.phone}</span>
                        </div>
                      )}

                      {contact.notes && (
                        <p className="text-sm text-white/40 font-light line-clamp-2">
                          {contact.notes}
                        </p>
                      )}

                      <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                        {contact.linkedinUrl && (
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
                          >
                            <Linkedin className="w-5 h-5" />
                          </a>
                        )}
                        {contact.twitterUrl && (
                          <a
                            href={contact.twitterUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[rgb(196,227,230)] transition-colors"
                          >
                            <Twitter className="w-5 h-5" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
