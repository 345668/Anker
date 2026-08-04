"use client"

import { useState, useMemo, useTransition } from "react"
import type { User } from "@supabase/supabase-js"
import type { Outreach, Investor } from "@/lib/db/types"
import { 
  Users, Plus, Search, Filter, Mail, Phone, Calendar, MoreHorizontal,
  Building2, ChevronRight, Send, Eye, MessageSquare, Clock, CheckCircle2,
  XCircle, ArrowRight, Linkedin, ExternalLink, Loader2, LayoutGrid, List,
  Kanban, GripVertical, Trash2, Edit3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateOutreachStageAction, deleteOutreachAction } from "@/app/dashboard/crm/actions"

type OutreachWithDetails = Outreach & {
  investor_name?: string
  investor_email?: string
  firm_name?: string
}

interface CRMContentProps {
  user: User
  outreaches: OutreachWithDetails[]
  stageCounts: Record<string, number>
  investors: Investor[]
  startupId: string | null
}

const PIPELINE_STAGES = [
  { key: 'draft', label: 'Draft', icon: Edit3, color: 'bg-muted text-muted-foreground' },
  { key: 'sent', label: 'Sent', icon: Send, color: 'bg-blue-100 text-blue-600' },
  { key: 'opened', label: 'Opened', icon: Eye, color: 'bg-purple-100 text-purple-600' },
  { key: 'replied', label: 'Replied', icon: MessageSquare, color: 'bg-amber-100 text-amber-600' },
  { key: 'meeting_scheduled', label: 'Meeting', icon: Calendar, color: 'bg-cyan-100 text-cyan-600' },
  { key: 'meeting_completed', label: 'Met', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-600' },
  { key: 'follow_up', label: 'Follow Up', icon: Clock, color: 'bg-orange-100 text-orange-600' },
  { key: 'closed', label: 'Closed', icon: XCircle, color: 'bg-red-100 text-red-600' },
]

type ViewMode = 'table' | 'kanban'

export function CRMContent({ user, outreaches, stageCounts, investors, startupId }: CRMContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [isPending, startTransition] = useTransition()

  // Filter outreaches
  const filteredOutreaches = useMemo(() => {
    return outreaches.filter(o => {
      const matchesSearch = !searchQuery || 
        o.investor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.investor_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.firm_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStage = stageFilter === 'all' || o.stage === stageFilter
      return matchesSearch && matchesStage
    })
  }, [outreaches, searchQuery, stageFilter])

  // Group by stage for kanban
  const groupedByStage = useMemo(() => {
    const groups: Record<string, OutreachWithDetails[]> = {}
    PIPELINE_STAGES.forEach(s => groups[s.key] = [])
    filteredOutreaches.forEach(o => {
      const stage = o.stage || 'draft'
      if (groups[stage]) groups[stage].push(o)
      else groups['draft'].push(o)
    })
    return groups
  }, [filteredOutreaches])

  const handleStageChange = (outreachId: string, newStage: string) => {
    startTransition(async () => {
      await updateOutreachStageAction(outreachId, newStage)
    })
  }

  const totalOutreaches = outreaches.length
  const sentCount = stageCounts['sent'] || 0
  const repliedCount = stageCounts['replied'] || 0
  const meetingCount = (stageCounts['meeting_scheduled'] || 0) + (stageCounts['meeting_completed'] || 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl">Pipeline CRM</h1>
                <p className="text-sm text-muted-foreground">
                  Track your investor outreach and meetings
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                Filter
              </Button>
              <Button className="gap-2 bg-foreground text-background">
                <Plus className="w-4 h-4" />
                Add Outreach
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 border border-foreground/10 rounded-lg">
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Total Pipeline</p>
              <p className="text-2xl font-display">{totalOutreaches}</p>
            </div>
            <div className="p-4 border border-foreground/10 rounded-lg">
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Sent</p>
              <p className="text-2xl font-display">{sentCount}</p>
            </div>
            <div className="p-4 border border-foreground/10 rounded-lg">
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Replied</p>
              <p className="text-2xl font-display text-emerald-600">{repliedCount}</p>
            </div>
            <div className="p-4 border border-foreground/10 rounded-lg">
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Meetings</p>
              <p className="text-2xl font-display text-blue-600">{meetingCount}</p>
            </div>
          </div>

          {/* Search & View Toggle */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search pipeline..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-foreground/5 border-foreground/10"
              />
            </div>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-foreground/10 rounded-md"
            >
              <option value="all">All Stages</option>
              {PIPELINE_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            <div className="flex border border-foreground/10 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-foreground/10' : ''}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-foreground/10' : ''}`}
              >
                <Kanban className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {viewMode === 'table' ? (
          <TableView 
            outreaches={filteredOutreaches} 
            onStageChange={handleStageChange}
            isPending={isPending}
          />
        ) : (
          <KanbanView 
            groupedByStage={groupedByStage} 
            onStageChange={handleStageChange}
            isPending={isPending}
          />
        )}

        {filteredOutreaches.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold mb-2">No outreaches yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add investors from the Discover page to start your pipeline
            </p>
            <Button asChild>
              <a href="/dashboard/discover">Go to Discover</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function TableView({ outreaches, onStageChange, isPending }: {
  outreaches: OutreachWithDetails[]
  onStageChange: (id: string, stage: string) => void
  isPending: boolean
}) {
  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-foreground/[0.03]">
          <tr className="border-b border-foreground/10">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Investor</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Firm</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Stage</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Sent</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Opened</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Replied</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Meeting</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Notes</th>
            <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {outreaches.map((outreach) => {
            const stageConfig = PIPELINE_STAGES.find(s => s.key === outreach.stage) || PIPELINE_STAGES[0]
            return (
              <tr key={outreach.id} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-medium">
                      {outreach.investor_name?.split(' ').map(n => n[0]).join('') || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{outreach.investor_name || 'Unknown'}</p>
                      {outreach.investor_email && (
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">{outreach.investor_email}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">{outreach.firm_name || '—'}</td>
                <td className="px-4 py-3">
                  <select
                    value={outreach.stage || 'draft'}
                    onChange={(e) => onStageChange(outreach.id, e.target.value)}
                    disabled={isPending}
                    className={`px-2 py-1 text-xs rounded-md border-0 ${stageConfig.color}`}
                  >
                    {PIPELINE_STAGES.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-sm">
                  {outreach.sent_at ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {formatDate(outreach.sent_at)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {outreach.opened_at ? formatDate(outreach.opened_at) : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {outreach.replied_at ? (
                    <span className="text-emerald-600">{formatDate(outreach.replied_at)}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {outreach.scheduled_call_at ? (
                    <span className="text-blue-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(outreach.scheduled_call_at)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">
                  {outreach.notes || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {outreach.investor_email && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={`mailto:${outreach.investor_email}`}>
                          <Mail className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
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

function KanbanView({ groupedByStage, onStageChange, isPending }: {
  groupedByStage: Record<string, OutreachWithDetails[]>
  onStageChange: (id: string, stage: string) => void
  isPending: boolean
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => {
        const items = groupedByStage[stage.key] || []
        const Icon = stage.icon
        return (
          <div key={stage.key} className="flex-shrink-0 w-72">
            <div className="flex items-center gap-2 mb-3 px-2">
              <div className={`p-1.5 rounded ${stage.color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-medium text-sm">{stage.label}</h3>
              <span className="ml-auto px-2 py-0.5 bg-foreground/5 rounded-full text-xs">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((outreach) => (
                <div 
                  key={outreach.id}
                  className="p-4 bg-background border border-foreground/10 rounded-lg hover:border-foreground/20 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-medium">
                        {outreach.investor_name?.split(' ').map(n => n[0]).join('') || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{outreach.investor_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{outreach.firm_name || ''}</p>
                      </div>
                    </div>
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  </div>
                  {outreach.notes && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{outreach.notes}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {outreach.investor_email && (
                        <a href={`mailto:${outreach.investor_email}`} className="text-muted-foreground hover:text-foreground">
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(outreach.created_at)}</p>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="p-4 border border-dashed border-foreground/10 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">No items</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
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
