"use client"

import type { User } from "@supabase/supabase-js"
import { 
  Users, 
  Plus,
  Search,
  Filter,
  Mail,
  Phone,
  Calendar,
  Star,
  MoreHorizontal,
  Building2,
  MessageSquare,
  ArrowUpRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CRMContentProps {
  user: User
}

const mockContacts = [
  {
    id: 1,
    name: "Sarah Chen",
    title: "Partner",
    company: "Sequoia Capital",
    email: "sarah@sequoiacap.com",
    phone: "+1 (650) 854-3927",
    lastContact: "2 days ago",
    status: "Hot",
    notes: "Very interested in Series A. Follow up next week.",
    tags: ["VC", "Series A", "Tech"],
  },
  {
    id: 2,
    name: "Michael Ross",
    title: "Investment Director",
    company: "Andreessen Horowitz",
    email: "michael@a16z.com",
    phone: "+1 (650) 823-1234",
    lastContact: "1 week ago",
    status: "Warm",
    notes: "Met at TechCrunch Disrupt. Scheduled intro call.",
    tags: ["VC", "Growth", "AI"],
  },
  {
    id: 3,
    name: "Emily Watson",
    title: "General Partner",
    company: "First Round Capital",
    email: "emily@firstround.com",
    phone: "+1 (415) 555-0123",
    lastContact: "3 weeks ago",
    status: "Cold",
    notes: "Initial outreach sent. No response yet.",
    tags: ["VC", "Seed", "Enterprise"],
  },
]

const statusColors: Record<string, string> = {
  "Hot": "bg-red-100 text-red-700",
  "Warm": "bg-amber-100 text-amber-700",
  "Cold": "bg-blue-100 text-blue-700",
}

export function CRMContent({ user }: CRMContentProps) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Relationships</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              CRM
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Total Contacts</p>
            <p className="font-display text-2xl font-semibold">{mockContacts.length}</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Hot Leads</p>
            <p className="font-display text-2xl font-semibold text-red-600">1</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Warm Leads</p>
            <p className="font-display text-2xl font-semibold text-amber-600">1</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Follow-ups Due</p>
            <p className="font-display text-2xl font-semibold">2</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search contacts..." 
              className="pl-10"
            />
          </div>
        </div>

        {/* Contacts list */}
        <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50">
            <h2 className="font-display font-semibold">All Contacts</h2>
          </div>
          <div className="divide-y divide-border/50">
            {mockContacts.map((contact) => (
              <div 
                key={contact.id}
                className="px-6 py-5 hover:bg-muted/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <span className="font-mono text-sm font-medium">
                        {contact.name.split(" ").map(n => n[0]).join("")}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        {contact.name}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[contact.status]}`}>
                          {contact.status}
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {contact.title} at {contact.company}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Phone className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Calendar className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Last contact</p>
                      <p className="text-xs text-muted-foreground">{contact.lastContact}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {contact.notes && (
                  <div className="mt-3 ml-16 text-sm text-muted-foreground flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                    {contact.notes}
                  </div>
                )}
                <div className="mt-3 ml-16 flex items-center gap-2">
                  {contact.tags.map((tag) => (
                    <span 
                      key={tag}
                      className="px-2 py-0.5 bg-muted rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
