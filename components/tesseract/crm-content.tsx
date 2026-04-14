"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import type { Contact, InvestmentFirm } from "@/lib/db/types"
import { 
  Users, 
  Plus,
  Search,
  Filter,
  Mail,
  Phone,
  Calendar,
  MoreHorizontal,
  Building2,
  MessageSquare,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CRMContentProps {
  user: User
  contacts: Contact[]
  firms: InvestmentFirm[]
}

function getInitials(firstName: string | null, lastName: string | null): string {
  const first = firstName?.[0] || ""
  const last = lastName?.[0] || ""
  return (first + last).toUpperCase() || "?"
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString()
}

export function CRMContent({ user, contacts, firms }: CRMContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTag, setFilterTag] = useState<string | null>(null)

  // Create a firm lookup map
  const firmMap = new Map(firms.map(f => [f.id, f]))

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact => {
    const fullName = `${contact.first_name || ""} ${contact.last_name || ""}`.toLowerCase()
    const matchesSearch = !searchQuery || 
      fullName.includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesTag = !filterTag || contact.tags?.includes(filterTag)
    
    return matchesSearch && matchesTag
  })

  // Get unique tags for filtering
  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))]

  // Stats
  const recentContacts = contacts.filter(c => {
    if (!c.last_contacted_at) return false
    const diff = Date.now() - new Date(c.last_contacted_at).getTime()
    return diff < 7 * 24 * 60 * 60 * 1000 // Last 7 days
  }).length

  return (
    <div className="min-h-screen">
      {/* Top bar - Optimus style */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
              <span className="w-8 h-px bg-foreground/30" />
              CRM
            </span>
            <h1 className="font-display text-2xl tracking-tight">
              Contacts
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full">
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats Grid - Optimus style */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-foreground/10">
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Total Contacts</p>
            <p className="font-display text-3xl tracking-tight">{contacts.length}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">With Firms</p>
            <p className="font-display text-3xl tracking-tight">{contacts.filter(c => c.firm_id).length}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</p>
            <p className="font-display text-3xl tracking-tight">{recentContacts}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
            <p className="font-display text-3xl tracking-tight">{allTags.length}</p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search contacts..." 
              className="pl-10 bg-background border-foreground/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {allTags.slice(0, 6).map(tag => (
              <Button 
                key={tag}
                variant={filterTag === tag ? "default" : "outline"} 
                size="sm"
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={filterTag === tag ? "bg-foreground text-background" : ""}
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            {filteredContacts.length} Contacts
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        {/* Contacts list - Optimus style */}
        <div className="border border-foreground/10">
          {filteredContacts.length > 0 ? (
            <div className="divide-y divide-foreground/10">
              {filteredContacts.map((contact) => {
                const firm = contact.firm_id ? firmMap.get(contact.firm_id) : null
                return (
                  <div 
                    key={contact.id}
                    className="p-6 hover:bg-foreground/[0.02] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {contact.photo_url ? (
                          <img 
                            src={contact.photo_url} 
                            alt={`${contact.first_name} ${contact.last_name}`}
                            className="w-12 h-12 object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-foreground/5 flex items-center justify-center">
                            <span className="font-mono text-sm font-medium text-muted-foreground">
                              {getInitials(contact.first_name, contact.last_name)}
                            </span>
                          </div>
                        )}
                        <div>
                          <h3 className="font-medium flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                            {contact.first_name} {contact.last_name}
                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {contact.title && <span>{contact.title}</span>}
                            {contact.title && (firm || contact.company) && <span> at </span>}
                            {firm?.name || contact.company}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          {contact.email && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={`mailto:${contact.email}`}>
                                <Mail className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          {contact.phone && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={`tel:${contact.phone}`}>
                                <Phone className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          {contact.linkedin_url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Last contact</p>
                          <p className="text-sm">{formatDate(contact.last_contacted_at)}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {contact.notes && (
                      <div className="mt-4 ml-16 text-sm text-muted-foreground flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{contact.notes}</span>
                      </div>
                    )}
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="mt-3 ml-16 flex items-center gap-2">
                        {contact.tags.map((tag) => (
                          <span 
                            key={tag}
                            className="px-2 py-1 bg-foreground/5 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-display text-lg mb-2">No contacts found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterTag ? "Try adjusting your search or filters" : "Add your first contact to get started"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
