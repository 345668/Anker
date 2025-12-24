import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Rocket, Search, Filter, Loader2, Globe, Users, DollarSign,
  FileText, ExternalLink, MoreHorizontal
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

const stages = ['All', 'Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];
const statuses = ['All', 'draft', 'active', 'funded', 'inactive'];

export default function AllStartups() {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const { data: startups = [], isLoading } = useQuery({
    queryKey: ['allStartups'],
    queryFn: () => base44.entities.Startup.list('-created_date', 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date', 500),
  });

  const usersMap = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});

  const filteredStartups = startups.filter(startup => {
    if (stageFilter !== 'All' && startup.stage !== stageFilter) return false;
    if (statusFilter !== 'All' && startup.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!startup.company_name?.toLowerCase().includes(query) &&
          !startup.industry?.some(i => i.toLowerCase().includes(query)) &&
          !startup.one_liner?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const statusColors = {
    draft: 'bg-slate-100 text-slate-700',
    active: 'bg-emerald-100 text-emerald-700',
    funded: 'bg-indigo-100 text-indigo-700',
    inactive: 'bg-red-100 text-red-700',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">All Startups</h1>
        <p className="text-slate-500 mt-1">{startups.length} startups registered</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, industry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage} value={stage}>{stage}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Startup</TableHead>
              <TableHead>Founder</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStartups.map((startup) => {
              const founder = usersMap[startup.founder_id];
              
              return (
                <TableRow key={startup.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center text-white font-bold">
                        {startup.company_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{startup.company_name}</p>
                        <p className="text-sm text-slate-500 line-clamp-1 max-w-xs">
                          {startup.one_liner || '—'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-slate-700">
                      {founder?.full_name || 'Unknown'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{startup.stage || '—'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {startup.industry?.slice(0, 2).map((ind, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {ind}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("capitalize", statusColors[startup.status])}>
                      {startup.status || 'draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-slate-500">
                      {startup.created_date ? format(new Date(startup.created_date), 'MMM d, yyyy') : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {startup.pitch_deck_url && (
                          <DropdownMenuItem asChild>
                            <a href={startup.pitch_deck_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="w-4 h-4 mr-2" />
                              View Deck
                            </a>
                          </DropdownMenuItem>
                        )}
                        {startup.website && (
                          <DropdownMenuItem asChild>
                            <a href={startup.website} target="_blank" rel="noopener noreferrer">
                              <Globe className="w-4 h-4 mr-2" />
                              Website
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link to={createPageUrl(`Matches?startup=${startup.id}`)}>
                            <Rocket className="w-4 h-4 mr-2" />
                            View Matches
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}