import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bookmark, Search, Loader2, Sparkles, Star, Trash2,
  Users, DollarSign, Globe, FileText, ExternalLink, MoreHorizontal,
  Calendar, ArrowRight, Mail
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function SavedStartups() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: savedDeals = [], isLoading } = useQuery({
    queryKey: ['savedDeals', user?.id],
    queryFn: () => base44.entities.Match.filter({ lead_id: user?.id }),
    enabled: !!user,
  });

  const { data: startups = [] } = useQuery({
    queryKey: ['allStartups'],
    queryFn: () => base44.entities.Startup.list('-created_date', 500),
  });

  const startupsMap = startups.reduce((acc, s) => ({ ...acc, [s.id]: s }), {});

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Match.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['savedDeals']),
  });

  const filteredDeals = savedDeals.filter(deal => {
    const startup = startupsMap[deal.startup_id];
    if (!startup) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!startup.company_name?.toLowerCase().includes(q) &&
          !startup.industry?.some(i => i.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saved Startups</h1>
          <p className="text-slate-500 mt-1">{savedDeals.length} startups saved</p>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
          <Link to={createPageUrl('DealFlow')}>
            <Sparkles className="w-4 h-4 mr-2" />
            Discover More
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search saved startups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredDeals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Bookmark className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">No saved startups yet</h3>
            <p className="text-slate-500 text-center max-w-md mb-6">
              Browse the deal flow and save startups you're interested in
            </p>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <Link to={createPageUrl('DealFlow')}>
                Browse Deal Flow
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Startup</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeals.map((deal) => {
                const startup = startupsMap[deal.startup_id];
                if (!startup) return null;

                return (
                  <TableRow key={deal.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center text-white font-bold">
                          {startup.company_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{startup.company_name}</p>
                          <p className="text-sm text-slate-500 line-clamp-1 max-w-xs">
                            {startup.one_liner}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{startup.stage}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {startup.industry?.slice(0, 2).map((ind, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{ind}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {deal.match_score && (
                        <Badge className="bg-violet-100 text-violet-700">
                          <Star className="w-3 h-3 mr-1 fill-violet-500" />
                          {deal.match_score}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-500">
                        {deal.created_date ? format(new Date(deal.created_date), 'MMM d, yyyy') : '—'}
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
                          <DropdownMenuItem 
                            onClick={() => deleteMutation.mutate(deal.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove
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
      )}
    </div>
  );
}