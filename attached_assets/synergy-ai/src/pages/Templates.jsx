import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  FileText, Plus, Loader2, Edit, Trash2, Copy, MoreHorizontal,
  Mail, MessageSquare, Calendar, Sparkles
} from 'lucide-react';
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
  Card,
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
import { cn } from "@/lib/utils";

/* -------------------------------------------
   SynergyAI: Liquid Glass primitives
-------------------------------------------- */

const GlobalStyles = () => (
  <style>{`
    @keyframes synergyGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes synergySweep {
      0% { transform: translateX(0) rotate(12deg); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translateX(220%) rotate(12deg); opacity: 0; }
    }
  `}</style>
);

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl" />
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[28px]",
        "bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25 blur-3xl opacity-35",
        className
      )}
    />
  );
}

function GlassCard({ className, children }) {
  return (
    <Card
      className={cn(
        "relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
    >
      {children}
    </Card>
  );
}

function PrimaryRainbowButton({ className, children, ...props }) {
  return (
    <Button
      className={cn(
        "relative overflow-hidden rounded-full px-6 h-11 text-white shadow-lg",
        "bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]",
        "bg-[length:220%_220%] animate-[synergyGradient_10s_ease_infinite]",
        "hover:shadow-xl",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
        <span className="absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-white/25 blur-xl animate-[synergySweep_1.2s_ease_forwards]" />
      </span>
      <span className="relative z-10 inline-flex items-center">{children}</span>
    </Button>
  );
}

function SecondaryGlassButton({ className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 backdrop-blur-2xl",
        "hover:bg-white/70",
        className
      )}
      {...props}
    />
  );
}

/* -------------------------------------------
   Config
-------------------------------------------- */

const categories = [
  { value: 'intro', label: 'Introduction', icon: Mail },
  { value: 'followup', label: 'Follow-up', icon: MessageSquare },
  { value: 'thank_you', label: 'Thank You', icon: Sparkles },
  { value: 'meeting_request', label: 'Meeting Request', icon: Calendar },
  { value: 'custom', label: 'Custom', icon: FileText },
];

const availableVariables = [
  '{{startup_name}}',
  '{{investor_name}}',
  '{{firm_name}}',
  '{{founder_name}}',
  '{{one_liner}}',
  '{{stage}}',
  '{{industry}}',
];

/* -------------------------------------------
   Page
-------------------------------------------- */

export default function Templates() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
    category: 'custom',
  });

  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.EmailTemplate.list('-created_date', 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EmailTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmailTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EmailTemplate.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['templates']),
  });

  const resetForm = () => {
    setFormData({ name: '', subject: '', body: '', category: 'custom' });
    setEditingTemplate(null);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || '',
      subject: template.subject || '',
      body: template.body || '',
      category: template.category || 'custom',
    });
    setShowDialog(true);
  };

  const handleDuplicate = (template) => {
    setFormData({
      name: `${template.name} (Copy)`,
      subject: template.subject || '',
      body: template.body || '',
      category: template.category || 'custom',
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const variables = availableVariables.filter(v => formData.body.includes(v) || formData.subject.includes(v));
    const data = { ...formData, variables };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const generateWithAI = async () => {
    if (!formData.category) return;
    setIsGenerating(true);

    try {
      const prompt = `Generate a professional ${formData.category} email template for a startup founder reaching out to investors.
      The template should be concise, professional, and compelling.
      Use these placeholders where appropriate: ${availableVariables.join(', ')}
      
      Return:
      - A subject line
      - An email body (2-3 paragraphs max)`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            body: { type: 'string' },
          }
        }
      });

      if (result) {
        setFormData(prev => ({
          ...prev,
          subject: result.subject || prev.subject,
          body: result.body || prev.body,
        }));
      }
    } catch (error) {
      console.error('Error generating template:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const insertVariable = (variable) => {
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
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading templates…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GlobalStyles />
      <LiquidBackground />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 px-3 py-1 backdrop-blur-2xl text-xs font-semibold text-slate-700 shadow-lg mb-3">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
              Email Automation
            </div>
            <h1 className="text-4xl font-bold text-slate-900">
              Email{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Templates
              </span>
            </h1>
            <p className="text-slate-600 mt-1">Create and manage reusable email templates with AI</p>
          </div>
          <PrimaryRainbowButton onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </PrimaryRainbowButton>
        </div>

        {/* Templates by category */}
        <div className="space-y-8">
          {templatesByCategory.map((category) => {
            const CategoryIcon = category.icon;
            if (category.templates.length === 0 && category.value !== 'custom') return null;
            
            return (
              <div key={category.value} className="relative">
                <UnderGlow className="opacity-20" />
                
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-2 rounded-full border-2 border-white/60 bg-white/55 px-3 py-1.5 backdrop-blur-2xl shadow-lg">
                    <CategoryIcon className="w-4 h-4 text-slate-700" />
                    <h2 className="text-sm font-semibold text-slate-900">{category.label}</h2>
                    <Badge className="rounded-full border border-white/60 bg-white/70 text-slate-800 text-xs">
                      {category.templates.length}
                    </Badge>
                  </div>
                </div>

                {category.templates.length === 0 ? (
                  <GlassCard className="border-dashed">
                    <CardContent className="flex flex-col items-center py-8">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl shadow-lg mb-3">
                        <CategoryIcon className="h-6 w-6 text-slate-500" />
                      </div>
                      <p className="text-slate-600 text-sm mb-4">No {category.label.toLowerCase()} templates yet</p>
                      <SecondaryGlassButton
                        size="sm"
                        onClick={() => { 
                          resetForm(); 
                          setFormData(prev => ({ ...prev, category: category.value })); 
                          setShowDialog(true); 
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Create One
                      </SecondaryGlassButton>
                    </CardContent>
                  </GlassCard>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {category.templates.map((template) => (
                      <GlassCard key={template.id} className="group">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base text-slate-900 truncate">{template.name}</CardTitle>
                              <CardDescription className="text-xs mt-1 line-clamp-1 text-slate-600">
                                {template.subject}
                              </CardDescription>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/70"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-2xl border-2 border-white/60 bg-white/95 backdrop-blur-2xl">
                                <DropdownMenuItem onClick={() => handleEdit(template)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteMutation.mutate(template.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-slate-600 line-clamp-3">
                            {template.body}
                          </p>
                          {template.variables?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {template.variables.slice(0, 3).map((v, i) => (
                                <Badge key={i} className="text-xs rounded-full border-2 border-white/60 bg-white/70 text-slate-700">
                                  {v.replace(/\{\{|\}\}/g, '')}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </GlassCard>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className={cn(
            "max-w-2xl max-h-[90vh] overflow-y-auto",
            "rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-2xl shadow-xl"
          )}>
            <DialogHeader>
              <DialogTitle className="text-slate-900">{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
              <DialogDescription className="text-slate-600">
                Create a reusable email template with dynamic placeholders
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Template Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Warm Intro"
                    required
                    className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {categories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Subject Line *</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g., Introduction: {{startup_name}} - {{one_liner}}"
                  required
                  className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-700">Email Body *</Label>
                  <SecondaryGlassButton
                    type="button" 
                    size="sm"
                    onClick={generateWithAI}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1" />
                    )}
                    Generate with AI
                  </SecondaryGlassButton>
                </div>
                <Textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  placeholder="Write your email body here..."
                  rows={10}
                  required
                  className="rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-slate-600">Available Variables (click to insert)</Label>
                <div className="flex flex-wrap gap-2">
                  {availableVariables.map((variable) => (
                    <Badge
                      key={variable}
                      className="cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 rounded-full border-2 border-white/60 bg-white/70 text-slate-700"
                      onClick={() => insertVariable(variable)}
                    >
                      {variable}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <SecondaryGlassButton type="button" onClick={() => setShowDialog(false)}>
                  Cancel
                </SecondaryGlassButton>
                <PrimaryRainbowButton
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </PrimaryRainbowButton>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}