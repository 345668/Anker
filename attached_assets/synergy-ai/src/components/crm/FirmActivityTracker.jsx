import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  TrendingUp, Newspaper, Users, DollarSign, Calendar,
  ExternalLink, Loader2, RefreshCw, CheckCircle, AlertCircle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FirmActivityTracker({ firm }) {
  const [tracking, setTracking] = useState(false);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const trackActivity = async () => {
    setTracking(true);
    setProgress(20);
    
    try {
      toast.info(`Tracking ${firm.company_name} activity...`);
      
      // Call LLM to research recent activity
      const activityData = await base44.integrations.Core.InvokeLLM({
        prompt: `Research recent investment activity and news for ${firm.company_name}.

Firm: ${firm.company_name}
Website: ${firm.website || 'Unknown'}
LinkedIn: ${firm.linkedin_url || 'Unknown'}
Type: ${firm.firm_type || 'Unknown'}

RESEARCH TASKS:
1. Recent Investments (last 6 months):
   - Portfolio companies invested in
   - Investment amounts if disclosed
   - Funding round stages
   - Investment dates

2. News & Announcements:
   - New fund announcements
   - Team changes (new partners, hires)
   - Press releases
   - Awards or recognition

3. Portfolio Activity:
   - Portfolio company exits
   - Follow-on investments
   - Successful portfolio company funding rounds

4. Team Updates:
   - New investment team members
   - Promotions
   - Departures

5. Social/Thought Leadership:
   - Recent blog posts or articles
   - Speaking engagements
   - Twitter/LinkedIn activity

Return timestamped, factual data with sources where possible.
Focus on last 3-6 months of activity.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            recent_investments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company_name: { type: 'string' },
                  amount: { type: 'number' },
                  round: { type: 'string' },
                  date: { type: 'string' },
                  source_url: { type: 'string' }
                }
              }
            },
            news_items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  summary: { type: 'string' },
                  date: { type: 'string' },
                  category: { type: 'string' },
                  source_url: { type: 'string' }
                }
              }
            },
            team_updates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  change_type: { type: 'string' },
                  date: { type: 'string' }
                }
              }
            },
            portfolio_exits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company_name: { type: 'string' },
                  exit_type: { type: 'string' },
                  amount: { type: 'number' },
                  date: { type: 'string' }
                }
              }
            },
            thought_leadership: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  type: { type: 'string' },
                  url: { type: 'string' },
                  date: { type: 'string' }
                }
              }
            },
            activity_score: { type: 'number' },
            last_tracked: { type: 'string' }
          }
        }
      });

      setProgress(60);

      // Update firm with tracked activity
      await base44.entities.InvestorFirm.update(firm.id, {
        recent_investments: activityData.recent_investments || [],
        recent_news: activityData.news_items?.map(n => n.title) || [],
        team_updates: activityData.team_updates || [],
        portfolio_exits: activityData.portfolio_exits || [],
        thought_leadership: activityData.thought_leadership || [],
        activity_score: activityData.activity_score || 0,
        last_activity_tracked: new Date().toISOString(),
        activity_tracking_data: activityData
      });

      setProgress(100);
      queryClient.invalidateQueries(['firms']);
      toast.success('Activity tracking complete!');
      
    } catch (error) {
      console.error('Activity tracking error:', error);
      toast.error('Failed to track activity');
    } finally {
      setTracking(false);
      setProgress(0);
    }
  };

  const activityData = firm.activity_tracking_data;
  const hasActivity = activityData && (
    activityData.recent_investments?.length > 0 ||
    activityData.news_items?.length > 0 ||
    activityData.team_updates?.length > 0
  );

  return (
    <div className="bg-white/60 rounded-lg border-2 border-white/60 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-600" />
          <h4 className="font-semibold text-sm text-slate-700">Investment Activity & News</h4>
          {firm.last_activity_tracked && (
            <Badge variant="outline" className="text-xs">
              Last tracked {new Date(firm.last_activity_tracked).toLocaleDateString()}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={trackActivity}
          disabled={tracking}
        >
          {tracking ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {tracking ? 'Tracking...' : 'Track Activity'}
        </Button>
      </div>

      {tracking && (
        <div className="mb-4">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-slate-500 mt-2">
            Researching recent investments, news, and team changes...
          </p>
        </div>
      )}

      {!hasActivity && !tracking ? (
        <p className="text-sm text-slate-500 text-center py-6">
          No activity data yet. Click "Track Activity" to research recent news and investments.
        </p>
      ) : hasActivity ? (
        <div className="space-y-4">
          {/* Recent Investments */}
          {activityData.recent_investments?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-3 h-3 text-emerald-600" />
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Recent Investments ({activityData.recent_investments.length})
                </h5>
              </div>
              <div className="space-y-2">
                {activityData.recent_investments.slice(0, 5).map((inv, i) => (
                  <div key={i} className="flex items-start justify-between p-2 bg-white/60 rounded-lg border border-white/60">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{inv.company_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {inv.round && (
                          <Badge className="text-xs bg-indigo-100 text-indigo-800">{inv.round}</Badge>
                        )}
                        {inv.amount && (
                          <span className="text-xs text-slate-600">
                            ${(inv.amount / 1000000).toFixed(1)}M
                          </span>
                        )}
                        {inv.date && (
                          <span className="text-xs text-slate-500">
                            {new Date(inv.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {inv.source_url && (
                      <a
                        href={inv.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* News & Announcements */}
          {activityData.news_items?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Newspaper className="w-3 h-3 text-blue-600" />
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  News & Announcements ({activityData.news_items.length})
                </h5>
              </div>
              <div className="space-y-2">
                {activityData.news_items.slice(0, 5).map((news, i) => (
                  <div key={i} className="p-2 bg-white/60 rounded-lg border border-white/60">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{news.title}</p>
                        {news.summary && (
                          <p className="text-xs text-slate-600 mt-1">{news.summary}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {news.category && (
                            <Badge className="text-xs bg-blue-100 text-blue-800">{news.category}</Badge>
                          )}
                          {news.date && (
                            <span className="text-xs text-slate-500">
                              {new Date(news.date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {news.source_url && (
                        <a
                          href={news.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Updates */}
          {activityData.team_updates?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3 h-3 text-purple-600" />
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Team Changes ({activityData.team_updates.length})
                </h5>
              </div>
              <div className="space-y-2">
                {activityData.team_updates.slice(0, 5).map((update, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/60 rounded-lg border border-white/60">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{update.name}</p>
                      <p className="text-xs text-slate-600">{update.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        "text-xs",
                        update.change_type === 'joined' && "bg-green-100 text-green-800",
                        update.change_type === 'promoted' && "bg-blue-100 text-blue-800",
                        update.change_type === 'departed' && "bg-red-100 text-red-800"
                      )}>
                        {update.change_type}
                      </Badge>
                      {update.date && (
                        <span className="text-xs text-slate-500">
                          {new Date(update.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio Exits */}
          {activityData.portfolio_exits?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-3 h-3 text-green-600" />
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Portfolio Exits ({activityData.portfolio_exits.length})
                </h5>
              </div>
              <div className="space-y-2">
                {activityData.portfolio_exits.slice(0, 3).map((exit, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/60 rounded-lg border border-white/60">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{exit.company_name}</p>
                      <p className="text-xs text-slate-600">{exit.exit_type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {exit.amount && (
                        <span className="text-xs font-medium text-slate-900">
                          ${(exit.amount / 1000000).toFixed(0)}M
                        </span>
                      )}
                      {exit.date && (
                        <span className="text-xs text-slate-500">
                          {new Date(exit.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Score */}
          {activityData.activity_score !== undefined && (
            <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Activity Score</span>
                <div className="flex items-center gap-2">
                  <Progress value={activityData.activity_score} className="w-24 h-2" />
                  <span className="text-sm font-bold text-indigo-600">
                    {activityData.activity_score}/100
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Based on deal velocity, news frequency, and portfolio performance
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}