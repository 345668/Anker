import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  LiquidBackground, 
  GlassSurface, 
  UnderGlow, 
  Pill, 
  RainbowButton,
  SecondaryGlassButton 
} from "@/components/liquid-glass";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EmailTemplate } from "@shared/schema";

const categories = [
  { value: "intro", label: "Introduction", icon: Mail },
  { value: "followup", label: "Follow-up", icon: MessageSquare },
  { value: "thank_you", label: "Thank You", icon: Sparkles },
  { value: "meeting_request", label: "Meeting Request", icon: Calendar },
  { value: "custom", label: "Custom", icon: FileText },
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
      <div className="relative min-h-[55vh]">
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading templates...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <LiquidBackground />

      <div className="space-y-6 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Pill className="mb-3">Email Automation</Pill>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
              Email{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Templates
              </span>
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Create and manage reusable email templates
            </p>
          </div>
          <RainbowButton 
            onClick={() => { resetForm(); setShowDialog(true); }}
            data-testid="button-create-template"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </RainbowButton>
        </div>

        <div className="space-y-8">
          {templatesByCategory.map((category) => {
            const CategoryIcon = category.icon;
            if (category.templates.length === 0 && category.value !== "custom") return null;
            
            return (
              <div key={category.value} className="relative">
                <UnderGlow className="opacity-20" />
                
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-2 rounded-full border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 px-3 py-1.5 backdrop-blur-2xl shadow-lg">
                    <CategoryIcon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{category.label}</h2>
                    <Badge className="rounded-full border border-white/60 dark:border-white/20 bg-white/70 dark:bg-slate-700/70 text-slate-800 dark:text-slate-200 text-xs">
                      {category.templates.length}
                    </Badge>
                  </div>
                </div>

                {category.templates.length === 0 ? (
                  <GlassSurface className="border-dashed">
                    <CardContent className="flex flex-col items-center py-8">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl shadow-lg mb-3">
                        <CategoryIcon className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                        No {category.label.toLowerCase()} templates yet
                      </p>
                      <SecondaryGlassButton
                        size="sm"
                        onClick={() => { 
                          resetForm(); 
                          setFormData(prev => ({ ...prev, category: category.value })); 
                          setShowDialog(true); 
                        }}
                        data-testid={`button-create-${category.value}-template`}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Create One
                      </SecondaryGlassButton>
                    </CardContent>
                  </GlassSurface>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {category.templates.map((template) => (
                      <GlassSurface key={template.id} className="group" data-testid={`card-template-${template.id}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base text-slate-900 dark:text-slate-100 truncate">
                                {template.name}
                              </CardTitle>
                              <CardDescription className="text-xs mt-1 line-clamp-1 text-slate-600 dark:text-slate-400">
                                {template.subject}
                              </CardDescription>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                  data-testid={`button-template-menu-${template.id}`}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-2xl">
                                <DropdownMenuItem 
                                  onClick={() => handleEdit(template)}
                                  data-testid={`button-edit-template-${template.id}`}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDuplicate(template)}
                                  data-testid={`button-duplicate-template-${template.id}`}
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteMutation.mutate(template.id)}
                                  className="text-red-600"
                                  data-testid={`button-delete-template-${template.id}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                            {template.body}
                          </p>
                          {template.variables && template.variables.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {template.variables.slice(0, 3).map((v, i) => (
                                <Badge key={i} className="text-xs rounded-full border-2 border-white/60 dark:border-white/20 bg-white/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300">
                                  {v.replace(/\{\{|\}\}/g, "")}
                                </Badge>
                              ))}
                              {template.variables.length > 3 && (
                                <Badge className="text-xs rounded-full border-2 border-white/60 dark:border-white/20 bg-white/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300">
                                  +{template.variables.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </GlassSurface>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl rounded-3xl border-2 border-white/60 dark:border-white/20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-slate-900 dark:text-slate-100">
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400">
              {editingTemplate 
                ? "Modify your email template" 
                : "Create a new reusable email template"
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-700 dark:text-slate-300">Template Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Initial Intro"
                  className="rounded-xl"
                  required
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="text-slate-700 dark:text-slate-300">Category</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger className="rounded-xl" data-testid="select-template-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
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
              <Label htmlFor="subject" className="text-slate-700 dark:text-slate-300">Subject Line</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="e.g., Quick intro from {{startup_name}}"
                className="rounded-xl"
                required
                data-testid="input-template-subject"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body" className="text-slate-700 dark:text-slate-300">Email Body</Label>
                <div className="flex flex-wrap gap-1">
                  {availableVariables.slice(0, 4).map(v => (
                    <Button
                      key={v}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs rounded-full px-2"
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
                className="min-h-[200px] rounded-xl"
                required
                data-testid="input-template-body"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <SecondaryGlassButton
                type="button"
                onClick={() => { setShowDialog(false); resetForm(); }}
                data-testid="button-cancel-template"
              >
                Cancel
              </SecondaryGlassButton>
              <RainbowButton
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-template"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {editingTemplate ? "Save Changes" : "Create Template"}
              </RainbowButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
