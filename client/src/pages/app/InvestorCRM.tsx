import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Users, 
  Search, 
  Filter, 
  ArrowRight, 
  Loader2, 
  Building2,
  Mail,
  Phone,
  Linkedin,
  MoreHorizontal,
  Trash2,
  ChevronRight,
  GripVertical
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";

const pipelineStages = [
  { id: "sourced", label: "Sourced", color: "rgb(142, 132, 247)" },
  { id: "first_review", label: "First Review", color: "rgb(196, 227, 230)" },
  { id: "deep_dive", label: "Deep Dive", color: "rgb(251, 194, 213)" },
  { id: "due_diligence", label: "Due Diligence", color: "rgb(254, 212, 92)" },
  { id: "term_sheet", label: "Term Sheet", color: "rgb(142, 132, 247)" },
  { id: "closed", label: "Closed", color: "rgb(196, 227, 230)" },
];

function ContactCard({ 
  contact, 
  onMoveToStage,
  onDelete 
}: { 
  contact: Contact; 
  onMoveToStage: (contactId: string, stage: string) => void;
  onDelete: (contactId: string) => void;
}) {
  const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
      data-testid={`contact-card-${contact.id}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border border-white/20">
          <AvatarImage src={contact.avatar || ''} />
          <AvatarFallback className="bg-white/10 text-white text-sm">
            {initials || '?'}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-white font-medium text-sm truncate">
              {contact.firstName} {contact.lastName}
            </h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`contact-menu-${contact.id}`}
                >
                  <MoreHorizontal className="h-4 w-4 text-white/50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
                {pipelineStages.map((stage) => (
                  <DropdownMenuItem 
                    key={stage.id}
                    onClick={() => onMoveToStage(contact.id, stage.id)}
                    className="text-white/70 hover:text-white focus:text-white cursor-pointer"
                    data-testid={`move-to-${stage.id}`}
                  >
                    <ChevronRight className="h-4 w-4 mr-2" style={{ color: stage.color }} />
                    Move to {stage.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem 
                  onClick={() => onDelete(contact.id)}
                  className="text-red-400 hover:text-red-300 focus:text-red-300 cursor-pointer"
                  data-testid={`delete-contact-${contact.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {contact.title && (
            <p className="text-white/50 text-xs truncate">{contact.title}</p>
          )}
          {contact.company && (
            <p className="text-white/40 text-xs truncate">{contact.company}</p>
          )}
          
          <div className="flex items-center gap-2 mt-2">
            {contact.email && (
              <a 
                href={`mailto:${contact.email}`}
                className="text-white/40 hover:text-white/70 transition-colors"
                data-testid={`email-${contact.id}`}
              >
                <Mail className="h-3.5 w-3.5" />
              </a>
            )}
            {contact.phone && (
              <a 
                href={`tel:${contact.phone}`}
                className="text-white/40 hover:text-white/70 transition-colors"
                data-testid={`phone-${contact.id}`}
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
            )}
            {contact.linkedinUrl && (
              <a 
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 hover:text-white/70 transition-colors"
                data-testid={`linkedin-${contact.id}`}
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PipelineColumn({ 
  stage, 
  contacts, 
  onMoveToStage,
  onDelete 
}: { 
  stage: typeof pipelineStages[0]; 
  contacts: Contact[];
  onMoveToStage: (contactId: string, stage: string) => void;
  onDelete: (contactId: string) => void;
}) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px]" data-testid={`pipeline-column-${stage.id}`}>
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="text-white font-medium text-sm">{stage.label}</h3>
        </div>
        <Badge variant="secondary" className="bg-white/10 text-white/70 text-xs">
          {contacts.length}
        </Badge>
      </div>
      
      <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-400px)] pr-1">
        {contacts.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-white/10 text-center">
            <p className="text-white/30 text-sm">No contacts</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <ContactCard 
              key={contact.id} 
              contact={contact} 
              onMoveToStage={onMoveToStage}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function InvestorCRM() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: !!user,
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: string }) => {
      const res = await apiRequest("PATCH", `/api/contacts/${contactId}`, { pipelineStage: stage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: "Contact Updated",
        description: "Contact moved to new stage",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await apiRequest("DELETE", `/api/contacts/${contactId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: "Contact Removed",
        description: "Contact has been removed from your CRM",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMoveToStage = (contactId: string, stage: string) => {
    updateStageMutation.mutate({ contactId, stage });
  };

  const handleDelete = (contactId: string) => {
    deleteContactMutation.mutate(contactId);
  };

  const filteredContacts = useMemo(() => {
    if (!searchQuery) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.firstName?.toLowerCase().includes(query) ||
        c.lastName?.toLowerCase().includes(query) ||
        c.company?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  const contactsByStage = useMemo(() => {
    const grouped: Record<string, Contact[]> = {};
    for (const stage of pipelineStages) {
      grouped[stage.id] = [];
    }
    for (const contact of filteredContacts) {
      const stage = contact.pipelineStage || "sourced";
      if (grouped[stage]) {
        grouped[stage].push(contact);
      } else {
        grouped["sourced"].push(contact);
      }
    }
    return grouped;
  }, [filteredContacts]);

  const pipelineStats = useMemo(() => {
    return pipelineStages.map((stage) => ({
      ...stage,
      count: contactsByStage[stage.id]?.length || 0,
    }));
  }, [contactsByStage]);

  const maxCount = Math.max(...pipelineStats.map((s) => s.count), 1);

  return (
    <AppLayout
      title="Investor CRM"
      subtitle="Manage your investor relationships and track your fundraising pipeline"
      heroHeight="30vh"
      videoUrl={videoBackgrounds.dashboard}
    >
      <div className="py-8 bg-[rgb(18,18,18)]">
        <div className="max-w-[1600px] mx-auto px-6">
          {/* Pipeline Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl border border-white/10 bg-white/5 mb-8"
            data-testid="pipeline-overview"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-light text-white">Pipeline Overview</h2>
                <p className="text-white/50 text-sm">Deal flow stages</p>
              </div>
              <Badge variant="outline" className="border-white/20 text-white/70">
                LIVE
              </Badge>
            </div>
            
            <div className="space-y-4">
              {pipelineStats.map((stage) => (
                <div key={stage.id} className="space-y-1" data-testid={`pipeline-stat-${stage.id}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{stage.label}</span>
                    <span className="text-white">{stage.count}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(stage.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Search and Actions */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                data-testid="input-search"
              />
            </div>
            <Link href="/app/investors">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                <Users className="w-4 h-4 mr-2" />
                Browse Investors
              </Button>
            </Link>
            <Link href="/app/firms">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                <Building2 className="w-4 h-4 mr-2" />
                Browse Firms
              </Button>
            </Link>
          </div>

          {/* Kanban Board */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-20 px-6 rounded-2xl border border-white/10 bg-white/5">
              <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl text-white mb-2">No contacts yet</h3>
              <p className="text-white/50 mb-6 max-w-md mx-auto">
                Start building your investor pipeline by adding investors or firms to your contacts.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link href="/app/investors">
                  <Button className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80">
                    Browse Investors
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/app/firms">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    Browse Firms
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex gap-6 overflow-x-auto pb-6">
              {pipelineStages.map((stage) => (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  contacts={contactsByStage[stage.id] || []}
                  onMoveToStage={handleMoveToStage}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
