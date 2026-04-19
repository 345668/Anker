"use client"

import { useState, useTransition } from "react"
import type { User } from "@supabase/supabase-js"
import type { Outreach } from "@/lib/db/types"
import { 
  Mail, Send, Plus, Search, Filter, Users, FileText, Sparkles,
  ChevronRight, Edit3, Trash2, Copy, Eye, MoreHorizontal, Clock,
  CheckCircle2, XCircle, AlertCircle, Calendar, RefreshCw, Loader2,
  ArrowRight, Zap, PenLine, LayoutTemplate, Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { sendOutreachEmailAction, generateEmailWithAIAction, saveEmailTemplateAction } from "@/app/dashboard/outreach/actions"

type OutreachWithDetails = Outreach & {
  investor_name?: string
  investor_email?: string
  investor_title?: string
  firm_name?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  is_default?: boolean
}

interface Startup {
  id: string
  name: string
  description: string | null
  industry: string | null
  stage: string | null
}

interface OutreachContentProps {
  user: User
  startup: Startup | null
  outreaches: OutreachWithDetails[]
  templates: EmailTemplate[]
}

const EMAIL_STATUS = [
  { key: 'draft', label: 'Draft', icon: Edit3, color: 'bg-gray-100 text-gray-600' },
  { key: 'scheduled', label: 'Scheduled', icon: Clock, color: 'bg-amber-100 text-amber-600' },
  { key: 'sent', label: 'Sent', icon: Send, color: 'bg-blue-100 text-blue-600' },
  { key: 'opened', label: 'Opened', icon: Eye, color: 'bg-purple-100 text-purple-600' },
  { key: 'replied', label: 'Replied', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-600' },
  { key: 'bounced', label: 'Bounced', icon: XCircle, color: 'bg-red-100 text-red-600' },
]

export function OutreachContent({ user, startup, outreaches = [], templates = [] }: OutreachContentProps) {
  // Ensure arrays are never undefined
  const safeOutreaches = Array.isArray(outreaches) ? outreaches : []
  const safeTemplates = Array.isArray(templates) ? templates : []
  
  const [view, setView] = useState<'list' | 'compose'>('list')
  const [selectedOutreach, setSelectedOutreach] = useState<OutreachWithDetails | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Compose state
  const [composeTo, setComposeTo] = useState("")
  const [composeToName, setComposeToName] = useState("")
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBody, setComposeBody] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Custom sender email configuration
  const [senderEmail, setSenderEmail] = useState(user.email || "")
  const [senderName, setSenderName] = useState(user.user_metadata?.first_name || "")

  // Filter outreaches
  const filteredOutreaches = safeOutreaches.filter(o => {
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch = !searchQuery || 
      (o.investor_name?.toLowerCase().includes(searchLower) ||
       o.investor_email?.toLowerCase().includes(searchLower) ||
       o.firm_name?.toLowerCase().includes(searchLower))
    const matchesStatus = statusFilter === 'all' || o.stage === statusFilter
    return matchesSearch && matchesStatus
  })

  // Stats
  const totalEmails = safeOutreaches.length
  const sentCount = safeOutreaches.filter(o => o.sent_at).length
  const openedCount = safeOutreaches.filter(o => o.opened_at).length
  const repliedCount = safeOutreaches.filter(o => o.replied_at).length
  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0

  const handleSelectTemplate = (templateId: string) => {
    const template = safeTemplates.find(t => t.id === templateId)
    if (template) {
      setSelectedTemplate(templateId)
      setComposeSubject(template.subject)
      setComposeBody(template.body)
    }
  }

  const handleGenerateWithAI = async () => {
    if (!startup) return
    setIsGeneratingAI(true)
    try {
      const result = await generateEmailWithAIAction({
        startupName: startup.name,
        startupDescription: startup.description || '',
        investorName: composeToName,
        firmName: '',
        senderName: user.user_metadata?.first_name || 'Founder',
      })
      if (result.success && result.email) {
        setComposeSubject(result.email.subject)
        setComposeBody(result.email.body)
      }
    } catch (error) {
      console.error('Failed to generate email:', error)
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleSendEmail = async () => {
    if (!composeTo || !composeSubject || !composeBody) return
    setIsSending(true)
    try {
      const result = await sendOutreachEmailAction({
        to: composeTo,
        toName: composeToName,
        subject: composeSubject,
        body: composeBody,
        outreachId: selectedOutreach?.id,
      })
      if (result.success) {
        // Reset compose form
        setComposeTo("")
        setComposeToName("")
        setComposeSubject("")
        setComposeBody("")
        setSelectedTemplate("")
        setView('list')
      }
    } catch (error) {
      console.error('Failed to send email:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleComposeToOutreach = (outreach: OutreachWithDetails) => {
    setSelectedOutreach(outreach)
    setComposeTo(outreach.investor_email || '')
    setComposeToName(outreach.investor_name || '')
    setView('compose')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl">Email Outreach</h1>
                <p className="text-sm text-muted-foreground">
                  Send personalized emails to investors
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {view === 'compose' ? (
                <Button variant="outline" onClick={() => setView('list')}>
                  Back to List
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="gap-2">
                    <LayoutTemplate className="w-4 h-4" />
                    Templates
                  </Button>
                  <Button 
                    className="gap-2 bg-foreground text-background"
                    onClick={() => {
                      setSelectedOutreach(null)
                      setComposeTo("")
                      setComposeToName("")
                      setComposeSubject("")
                      setComposeBody("")
                      setView('compose')
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Compose Email
                  </Button>
                </>
              )}
            </div>
          </div>

          {view === 'list' && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="p-4 border border-foreground/10 rounded-lg">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Total Emails</p>
                  <p className="text-2xl font-display">{totalEmails}</p>
                </div>
                <div className="p-4 border border-foreground/10 rounded-lg">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Sent</p>
                  <p className="text-2xl font-display">{sentCount}</p>
                </div>
                <div className="p-4 border border-foreground/10 rounded-lg">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Open Rate</p>
                  <p className="text-2xl font-display text-purple-600">{openRate}%</p>
                </div>
                <div className="p-4 border border-foreground/10 rounded-lg">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Reply Rate</p>
                  <p className="text-2xl font-display text-emerald-600">{replyRate}%</p>
                </div>
                <div className="p-4 border border-foreground/10 rounded-lg">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Replies</p>
                  <p className="text-2xl font-display text-blue-600">{repliedCount}</p>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex items-center gap-4">
                <div className="flex-1 relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-foreground/5 border-foreground/10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-background border border-foreground/10 rounded-md"
                >
                  <option value="all">All Status</option>
                  {EMAIL_STATUS.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {view === 'compose' ? (
          <ComposeView
            to={composeTo}
            setTo={setComposeTo}
            toName={composeToName}
            setToName={setComposeToName}
            subject={composeSubject}
            setSubject={setComposeSubject}
            body={composeBody}
            setBody={setComposeBody}
            senderEmail={senderEmail}
            setSenderEmail={setSenderEmail}
            senderName={senderName}
            setSenderName={setSenderName}
            templates={safeTemplates}
            selectedTemplate={selectedTemplate}
            onSelectTemplate={handleSelectTemplate}
            onGenerateAI={handleGenerateWithAI}
            onSend={handleSendEmail}
            isGeneratingAI={isGeneratingAI}
            isSending={isSending}
            startup={startup}
          />
        ) : (
          <EmailListView
            outreaches={filteredOutreaches}
            onCompose={handleComposeToOutreach}
          />
        )}
      </div>
    </div>
  )
}

function ComposeView({
  to, setTo, toName, setToName, subject, setSubject, body, setBody,
  senderEmail, setSenderEmail, senderName, setSenderName,
  templates, selectedTemplate, onSelectTemplate, onGenerateAI, onSend,
  isGeneratingAI, isSending, startup
}: {
  to: string
  setTo: (v: string) => void
  toName: string
  setToName: (v: string) => void
  subject: string
  setSubject: (v: string) => void
  body: string
  setBody: (v: string) => void
  senderEmail: string
  setSenderEmail: (v: string) => void
  senderName: string
  setSenderName: (v: string) => void
  templates: EmailTemplate[]
  selectedTemplate: string
  onSelectTemplate: (id: string) => void
  onGenerateAI: () => void
  onSend: () => void
  isGeneratingAI: boolean
  isSending: boolean
  startup: Startup | null
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        {/* Compose Header */}
        <div className="bg-foreground/[0.02] px-6 py-4 border-b border-foreground/10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">New Email</h2>
            <div className="flex items-center gap-2">
              <select
                value={selectedTemplate}
                onChange={(e) => onSelectTemplate(e.target.value)}
                className="px-3 py-1.5 text-sm bg-background border border-foreground/10 rounded-md"
              >
                <option value="">Select Template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateAI}
                disabled={isGeneratingAI || !startup}
                className="gap-2"
              >
                {isGeneratingAI ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate with AI
              </Button>
            </div>
          </div>
        </div>

        {/* Email Fields */}
        <div className="p-6 space-y-4">
          {/* Sender Configuration - Your Email */}
          <div className="p-4 bg-foreground/[0.02] border border-foreground/10 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Send From (Your Email)</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Your Name
                </label>
                <Input
                  placeholder="Your Name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="border-foreground/20 bg-background"
                />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Your Email Address
                </label>
                <Input
                  placeholder="you@company.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  className="border-foreground/20 bg-background"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Emails will be sent from this address. Must be verified in your SendGrid account.
            </p>
          </div>

          {/* Recipient */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                To (Email)
              </label>
              <Input
                placeholder="investor@firm.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border-foreground/20"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Recipient Name
              </label>
              <Input
                placeholder="John Smith"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                className="border-foreground/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Subject
            </label>
            <Input
              placeholder="Your email subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border-foreground/20"
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Message
            </label>
            <textarea
              placeholder="Write your message here...

Use {{investor_name}} to personalize with investor's name.
Use {{firm_name}} to include their firm name.
Use {{startup_name}} to include your startup name."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full h-64 p-4 border border-foreground/20 bg-foreground/5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20 rounded-md"
            />
          </div>

          {/* Personalization hints */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Personalization Variables</p>
                <p className="text-xs text-blue-700 mt-1">
                  Use these variables in your email and they will be replaced automatically:
                  <code className="mx-1 px-1 py-0.5 bg-blue-100 rounded">{"{{investor_name}}"}</code>
                  <code className="mx-1 px-1 py-0.5 bg-blue-100 rounded">{"{{firm_name}}"}</code>
                  <code className="mx-1 px-1 py-0.5 bg-blue-100 rounded">{"{{startup_name}}"}</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-foreground/[0.02] px-6 py-4 border-t border-foreground/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            Make sure SendGrid is configured in Settings
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">Save as Draft</Button>
            <Button
              onClick={onSend}
              disabled={isSending || !to || !subject || !body}
              className="gap-2 bg-foreground text-background"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Email
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailListView({ outreaches, onCompose }: {
  outreaches: OutreachWithDetails[]
  onCompose: (o: OutreachWithDetails) => void
}) {
  if (outreaches.length === 0) {
    return (
      <div className="text-center py-16">
        <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold mb-2">No emails yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add investors from Discover to your pipeline, then send outreach emails
        </p>
        <Button asChild>
          <a href="/dashboard/discover">Go to Discover</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-foreground/[0.03]">
          <tr className="border-b border-foreground/10">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Recipient</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Firm</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Sent</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Opened</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Replied</th>
            <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {outreaches.map((outreach) => {
            const status = EMAIL_STATUS.find(s => s.key === outreach.stage) || EMAIL_STATUS[0]
            const StatusIcon = status.icon
            return (
              <tr key={outreach.id} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-medium">
                      {outreach.investor_name?.split(' ').map(n => n[0]).join('') || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{outreach.investor_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {outreach.investor_email || 'No email'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">{outreach.firm_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${status.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {outreach.sent_at ? formatDate(outreach.sent_at) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {outreach.opened_at ? formatDate(outreach.opened_at) : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {outreach.replied_at ? (
                    <span className="text-emerald-600">{formatDate(outreach.replied_at)}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {outreach.investor_email && !outreach.sent_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCompose(outreach)}
                        className="gap-1"
                      >
                        <Send className="w-4 h-4" />
                        Send
                      </Button>
                    )}
                    {outreach.sent_at && !outreach.replied_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCompose(outreach)}
                        className="gap-1"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Follow Up
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="w-4 h-4 mr-2" />
                          View Email
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
