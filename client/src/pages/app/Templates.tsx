import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  FileText, Plus, Loader2, Edit, Trash2, Copy, MoreHorizontal,
  Mail, MessageSquare, Calendar, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EmailTemplate } from "@shared/schema";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";

const categories = [
  { value: "intro", label: "Introduction", icon: Mail, color: "rgb(142,132,247)" },
  { value: "followup", label: "Follow-up", icon: MessageSquare, color: "rgb(251,194,213)" },
  { value: "thank_you", label: "Thank You", icon: Sparkles, color: "rgb(196,227,230)" },
  { value: "meeting_request", label: "Meeting Request", icon: Calendar, color: "rgb(254,212,92)" },
  { value: "custom", label: "Custom", icon: FileText, color: "rgb(142,132,247)" },
];

const availableVariables = [
  "{{startup_name}}",
  "{{investor_name}}",
  "{{firm_name}}",
  "{{founder_name}}",
  "{{one_liner}}",
  "{{stage}}",
  "{{industry}}",
];

export default function Templates() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    body: "",
    category: "custom",
  });

  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<EmailTemplate>) => 
      apiRequest("POST", "/api/email-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EmailTemplate> }) => 
      apiRequest("PATCH", `/api/email-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest("DELETE", `/api/email-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", subject: "", body: "", category: "custom" });
    setEditingTemplate(null);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || "",
      subject: template.subject || "",
      body: template.body || "",
      category: template.category || "custom",
    });
    setShowDialog(true);
  };

  const handleDuplicate = (template: EmailTemplate) => {
    setFormData({
      name: `${template.name} (Copy)`,
      subject: template.subject || "",
      body: template.body || "",
      category: template.category || "custom",
    });
    setShowDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const variables = availableVariables.filter(v => 
      formData.body.includes(v) || formData.subject.includes(v)
    );
    const data = { ...formData, variables };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      body: prev.body + variable
    }));
  };

  const templatesByCategory = categories.map(cat => ({
    ...cat,
    templates: templates.filter(t => t.category === cat.value),
  }));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Email Templates"
      subtitle="Create and manage reusable email templates"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.templates}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-end mb-8"
          >
            <button
              onClick={() => { resetForm(); setShowDialog(true); }}
              className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
              data-testid="button-create-template"
            >
              <Plus className="w-5 h-5" />
              Create Template
            </button>
          </motion.div>

          <div className="space-y-12">
            {templatesByCategory.map((category, catIdx) => {
              const CategoryIcon = category.icon;
              if (category.templates.length === 0 && category.value !== "custom") return null;
              
              return (
                <motion.div
                  key={category.value}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: catIdx * 0.1 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <CategoryIcon className="w-5 h-5" style={{ color: category.color }} />
                    </div>
                    <h2 className="text-xl font-light text-white">{category.label}</h2>
                    <Badge className="bg-white/10 text-white/60 border-0">
                      {category.templates.length}
                    </Badge>
                  </div>

                  {category.templates.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] text-center">
                      <p className="text-white/40 mb-4">
                        No {category.label.toLowerCase()} templates yet
                      </p>
                      <button
                        onClick={() => { 
                          resetForm(); 
                          setFormData(prev => ({ ...prev, category: category.value })); 
                          setShowDialog(true); 
                        }}
                        className="h-10 px-5 rounded-full border border-white/20 text-white/70 text-sm hover:bg-white/5 transition-colors inline-flex items-center gap-2"
                        data-testid={`button-create-${category.value}-template`}
                      >
                        <Plus className="w-4 h-4" />
                        Create One
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {category.templates.map((template, idx) => (
                        <motion.div
                          key={template.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: idx * 0.05 }}
                          className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors"
                          data-testid={`card-template-${template.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium text-white truncate">
                                {template.name}
                              </h3>
                              <p className="text-sm text-white/40 truncate mt-1">
                                {template.subject}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 rounded-full text-white/40 opacity-0 group-hover:opacity-100 transition-opacity"
                                  data-testid={`button-template-menu-${template.id}`}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[rgb(28,28,28)] border-white/10">
                                <DropdownMenuItem 
                                  onClick={() => handleEdit(template)}
                                  className="text-white/70"
                                  data-testid={`button-edit-template-${template.id}`}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDuplicate(template)}
                                  className="text-white/70"
                                  data-testid={`button-duplicate-template-${template.id}`}
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteMutation.mutate(template.id)}
                                  className="text-red-400"
                                  data-testid={`button-delete-template-${template.id}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          
                          <p className="text-sm text-white/50 line-clamp-3 mb-4">
                            {template.body}
                          </p>
                          
                          {template.variables && template.variables.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {template.variables.slice(0, 3).map((v, i) => (
                                <Badge key={i} variant="outline" className="text-xs border-white/20 text-white/50">
                                  {v.replace(/\{\{|\}\}/g, "")}
                                </Badge>
                              ))}
                              {template.variables.length > 3 && (
                                <Badge variant="outline" className="text-xs border-white/20 text-white/50">
                                  +{template.variables.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl bg-[rgb(28,28,28)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              {editingTemplate 
                ? "Modify your email template" 
                : "Create a new reusable email template"
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white/70">Template Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Initial Intro"
                  className="bg-white/5 border-white/10 text-white"
                  required
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="text-white/70">Category</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-template-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject" className="text-white/70">Subject Line</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="e.g., Quick intro from {{startup_name}}"
                className="bg-white/5 border-white/10 text-white"
                required
                data-testid="input-template-subject"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body" className="text-white/70">Email Body</Label>
                <div className="flex flex-wrap gap-1">
                  {availableVariables.slice(0, 4).map(v => (
                    <Button
                      key={v}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs rounded-full px-2 text-white/50 hover:text-white hover:bg-white/10"
                      onClick={() => insertVariable(v)}
                      data-testid={`button-insert-variable-${v.replace(/\{\{|\}\}/g, "")}`}
                    >
                      {v.replace(/\{\{|\}\}/g, "")}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Write your email template..."
                className="min-h-[200px] bg-white/5 border-white/10 text-white"
                required
                data-testid="input-template-body"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowDialog(false); resetForm(); }}
                className="border-white/20 text-white hover:bg-white/5"
                data-testid="button-cancel-template"
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="h-10 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                data-testid="button-save-template"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {editingTemplate ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
