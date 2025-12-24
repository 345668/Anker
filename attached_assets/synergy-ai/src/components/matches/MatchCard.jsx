import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Building2, MapPin, DollarSign, ExternalLink, Star, Bookmark, Mail } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import MatchFeedback from '@/components/matching/MatchFeedback';

export default function MatchCard({ match, firm, contact, onSave, onContact, isSaved, onFeedback }) {
  const scoreColor = match.match_score >= 80 ? 'text-emerald-600 bg-emerald-50' :
                     match.match_score >= 60 ? 'text-amber-600 bg-amber-50' :
                     'text-slate-600 bg-slate-50';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg transition-all duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-slate-500" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
              {firm?.company_name || 'Unknown Firm'}
            </h3>
            <p className="text-sm text-slate-500">{firm?.firm_type}</p>
          </div>
        </div>
        <div className={cn("px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1", scoreColor)}>
          <Star className="w-3.5 h-3.5" />
          {match.match_score}%
        </div>
      </div>

      {/* Investment focus */}
      {firm?.investment_focus?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {firm.investment_focus.slice(0, 3).map((focus, i) => (
            <Badge key={i} variant="secondary" className="bg-indigo-50 text-indigo-700 text-xs">
              {focus}
            </Badge>
          ))}
          {firm.investment_focus.length > 3 && (
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
              +{firm.investment_focus.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Details */}
      <div className="space-y-2 mb-4 text-sm text-slate-600">
        {firm?.investment_stages?.length > 0 && (
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span>{firm.investment_stages.join(', ')}</span>
          </div>
        )}
        {firm?.geographic_focus?.length > 0 && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400" />
            <span>{firm.geographic_focus.slice(0, 2).join(', ')}</span>
          </div>
        )}
      </div>

      {/* Match reasons */}
      {match.match_reasons?.length > 0 && (
        <div className="bg-emerald-50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-emerald-800 mb-1">Why this match?</p>
          <p className="text-xs text-emerald-700">{match.match_reasons.slice(0, 2).join(' • ')}</p>
        </div>
      )}

      {/* Recommended approach */}
      {match.founder_notes && (
        <div className="bg-indigo-50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-indigo-800 mb-1">Recommended Approach</p>
          <p className="text-xs text-indigo-700">{match.founder_notes}</p>
        </div>
      )}

      {/* AI Insights */}
      <div className="space-y-2 mb-4">
        {match.predicted_interest && (
          <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
            <span className="text-xs text-slate-600">Predicted Interest</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full",
                    match.predicted_interest >= 70 ? "bg-emerald-500" :
                    match.predicted_interest >= 40 ? "bg-amber-500" : "bg-red-500"
                  )}
                  style={{ width: `${match.predicted_interest}%` }}
                />
              </div>
              <span className="text-xs font-medium">{match.predicted_interest}%</span>
            </div>
          </div>
        )}
        
        {match.sentiment_analysis?.sentiment_score && (
          <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
            <span className="text-xs text-purple-700">Past Sentiment</span>
            <Badge className="bg-purple-100 text-purple-700 text-xs">
              {match.sentiment_analysis.positive_rate}% positive
            </Badge>
          </div>
        )}
      </div>

      {/* Contact info */}
      {contact && (
        <div className="border-t border-slate-100 pt-3 mb-4">
          <p className="text-sm font-medium text-slate-900">{contact.full_name}</p>
          <p className="text-xs text-slate-500">{contact.title}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <MatchFeedback 
          match={match} 
          onFeedbackSubmit={onFeedback}
        />
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => onContact?.(match)} 
            className="bg-indigo-600 hover:bg-indigo-700"
            size="sm"
          >
            <Mail className="w-4 h-4 mr-1.5" />
            Reach Out
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => onSave?.(match)}
            className={cn(isSaved && "bg-amber-50 border-amber-200")}
          >
            <Bookmark className={cn("w-4 h-4", isSaved && "fill-amber-500 text-amber-500")} />
          </Button>
          {firm?.linkedin_url && (
            <Button variant="outline" size="icon" asChild>
              <a href={firm.linkedin_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}