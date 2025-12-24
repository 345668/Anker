import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  MessageSquare, Loader2, TrendingUp, TrendingDown, Minus,
  Twitter, Newspaper, Linkedin as LinkedinIcon, RefreshCw
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function SentimentNewsAnalysis({ firm }) {
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyzeSentiment = async () => {
    setLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze sentiment and reputation for this investor firm from recent news, social media, and online sources:

Firm: ${firm.company_name}
Website: ${firm.website || 'N/A'}
LinkedIn: ${firm.linkedin_url || 'N/A'}
Twitter: ${firm.twitter_url || 'N/A'}

SENTIMENT ANALYSIS TASKS:
1. Recent News Mentions (last 6 months):
   - News articles, press releases, media coverage
   - Funding announcements, partnerships
   - Sentiment classification: positive, negative, neutral
   - Key themes and topics

2. Social Media Sentiment:
   - Twitter/X mentions and discussions
   - LinkedIn activity and engagement
   - Founder/portfolio company feedback
   - Overall social sentiment score

3. Reputation Indicators:
   - Positive signals (awards, recognition, success stories)
   - Negative signals (controversies, complaints, issues)
   - Portfolio company testimonials
   - Glassdoor/employee reviews if available

4. Trend Analysis:
   - Sentiment trend over time (improving/declining)
   - Volume of mentions (increasing/decreasing)
   - Key events affecting sentiment

5. Founder Feedback:
   - Testimonials from portfolio founders
   - Reviews on platforms like Signal, Angellist
   - Common praise and common complaints

Provide detailed sentiment breakdown with specific examples and sources.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            overall_sentiment: { 
              type: 'string', 
              enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'] 
            },
            sentiment_score: { type: 'number' },
            confidence: { type: 'number' },
            news_mentions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  source: { type: 'string' },
                  date: { type: 'string' },
                  sentiment: { type: 'string' },
                  summary: { type: 'string' },
                  url: { type: 'string' }
                }
              }
            },
            social_media_sentiment: {
              type: 'object',
              properties: {
                twitter_sentiment: { type: 'string' },
                linkedin_sentiment: { type: 'string' },
                overall_social_score: { type: 'number' },
                key_themes: { type: 'array', items: { type: 'string' } }
              }
            },
            reputation_signals: {
              type: 'object',
              properties: {
                positive: { type: 'array', items: { type: 'string' } },
                negative: { type: 'array', items: { type: 'string' } },
                awards_recognition: { type: 'array', items: { type: 'string' } }
              }
            },
            founder_feedback: {
              type: 'object',
              properties: {
                testimonials: { type: 'array', items: { type: 'string' } },
                common_praise: { type: 'array', items: { type: 'string' } },
                common_complaints: { type: 'array', items: { type: 'string' } },
                founder_friendly_score: { type: 'number' }
              }
            },
            trend_analysis: {
              type: 'object',
              properties: {
                sentiment_trend: { type: 'string' },
                volume_trend: { type: 'string' },
                recent_events: { type: 'array', items: { type: 'string' } }
              }
            },
            summary: { type: 'string' },
            last_analyzed: { type: 'string' }
          }
        }
      });

      setSentiment(result);
    } catch (error) {
      console.error('Sentiment analysis error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (firm) {
      analyzeSentiment();
    }
  }, [firm.id]);

  const getSentimentIcon = (sentiment) => {
    if (sentiment?.includes('positive')) return <TrendingUp className="w-4 h-4 text-emerald-600" />;
    if (sentiment?.includes('negative')) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-slate-600" />;
  };

  const getSentimentColor = (sentiment) => {
    if (sentiment === 'very_positive') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (sentiment === 'positive') return 'bg-green-100 text-green-800 border-green-200';
    if (sentiment === 'neutral') return 'bg-slate-100 text-slate-800 border-slate-200';
    if (sentiment === 'negative') return 'bg-orange-100 text-orange-800 border-orange-200';
    if (sentiment === 'very_negative') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-800';
  };

  if (loading && !sentiment) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm text-slate-600">Analyzing news and social media...</p>
        </CardContent>
      </Card>
    );
  }

  if (!sentiment) return null;

  return (
    <div className="space-y-6">
      {/* Overall Sentiment Card */}
      <Card className={cn("border-2", getSentimentColor(sentiment.overall_sentiment))}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Overall Sentiment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge className={cn("text-sm px-3 py-1", getSentimentColor(sentiment.overall_sentiment))}>
              {sentiment.overall_sentiment?.replace(/_/g, ' ').toUpperCase()}
            </Badge>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">{sentiment.sentiment_score}/100</p>
              <p className="text-xs text-slate-500">{sentiment.confidence}% confidence</p>
            </div>
          </div>
          
          <Progress value={sentiment.sentiment_score} className="h-2" />
          
          {sentiment.summary && (
            <p className="text-sm text-slate-700 leading-relaxed pt-2 border-t">
              {sentiment.summary}
            </p>
          )}
        </CardContent>
      </Card>

      {/* News Mentions */}
      {sentiment.news_mentions?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-slate-700" />
              Recent News Mentions ({sentiment.news_mentions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sentiment.news_mentions.slice(0, 5).map((mention, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 text-sm">{mention.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">{mention.source}</span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-500">{mention.date}</span>
                      </div>
                    </div>
                    {getSentimentIcon(mention.sentiment)}
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{mention.summary}</p>
                  {mention.url && (
                    <a 
                      href={mention.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Read more →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social Media Sentiment */}
      {sentiment.social_media_sentiment && (
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-900">
              <Twitter className="w-5 h-5" />
              Social Media Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {sentiment.social_media_sentiment.twitter_sentiment && (
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1 flex items-center gap-1">
                    <Twitter className="w-3 h-3" />
                    Twitter/X
                  </p>
                  <Badge className={getSentimentColor(sentiment.social_media_sentiment.twitter_sentiment.toLowerCase())}>
                    {sentiment.social_media_sentiment.twitter_sentiment}
                  </Badge>
                </div>
              )}
              {sentiment.social_media_sentiment.linkedin_sentiment && (
                <div className="bg-white rounded-lg p-3">
                  <p className="text-xs text-slate-600 mb-1 flex items-center gap-1">
                    <LinkedinIcon className="w-3 h-3" />
                    LinkedIn
                  </p>
                  <Badge className={getSentimentColor(sentiment.social_media_sentiment.linkedin_sentiment.toLowerCase())}>
                    {sentiment.social_media_sentiment.linkedin_sentiment}
                  </Badge>
                </div>
              )}
            </div>

            {sentiment.social_media_sentiment.overall_social_score !== undefined && (
              <div className="bg-white rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-600">Overall Social Score</p>
                  <p className="text-lg font-bold text-blue-900">
                    {sentiment.social_media_sentiment.overall_social_score}/100
                  </p>
                </div>
                <Progress value={sentiment.social_media_sentiment.overall_social_score} className="h-2" />
              </div>
            )}

            {sentiment.social_media_sentiment.key_themes?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-900 mb-2">Key Themes</p>
                <div className="flex flex-wrap gap-2">
                  {sentiment.social_media_sentiment.key_themes.map((theme, i) => (
                    <Badge key={i} variant="outline" className="bg-blue-100 text-blue-700">
                      {theme}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Founder Feedback */}
      {sentiment.founder_feedback && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              Founder Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sentiment.founder_feedback.founder_friendly_score !== undefined && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-purple-900">Founder Friendly Score</p>
                  <p className={cn("text-2xl font-bold",
                    sentiment.founder_feedback.founder_friendly_score >= 8 ? 'text-emerald-600' :
                    sentiment.founder_feedback.founder_friendly_score >= 6 ? 'text-amber-600' :
                    'text-red-600'
                  )}>
                    {sentiment.founder_feedback.founder_friendly_score}/10
                  </p>
                </div>
                <Progress value={sentiment.founder_feedback.founder_friendly_score * 10} className="h-2 mt-2" />
              </div>
            )}

            {sentiment.founder_feedback.common_praise?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-emerald-700 mb-2">Common Praise</p>
                <ul className="space-y-1">
                  {sentiment.founder_feedback.common_praise.map((praise, i) => (
                    <li key={i} className="text-sm text-slate-600 pl-4">✓ {praise}</li>
                  ))}
                </ul>
              </div>
            )}

            {sentiment.founder_feedback.common_complaints?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 mb-2">Common Complaints</p>
                <ul className="space-y-1">
                  {sentiment.founder_feedback.common_complaints.map((complaint, i) => (
                    <li key={i} className="text-sm text-slate-600 pl-4">✗ {complaint}</li>
                  ))}
                </ul>
              </div>
            )}

            {sentiment.founder_feedback.testimonials?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-900 mb-2">Testimonials</p>
                <div className="space-y-2">
                  {sentiment.founder_feedback.testimonials.map((testimonial, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded border-l-2 border-indigo-300">
                      <p className="text-xs text-slate-700 italic">"{testimonial}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reputation Signals */}
      {sentiment.reputation_signals && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sentiment.reputation_signals.positive?.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-emerald-900">Positive Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {sentiment.reputation_signals.positive.map((signal, i) => (
                    <li key={i} className="text-sm text-emerald-800 pl-4">✓ {signal}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {sentiment.reputation_signals.negative?.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-900">Negative Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {sentiment.reputation_signals.negative.map((signal, i) => (
                    <li key={i} className="text-sm text-red-800 pl-4">✗ {signal}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Trend Analysis */}
      {sentiment.trend_analysis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trend Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-600 mb-1">Sentiment Trend</p>
                <p className={cn("text-sm font-medium",
                  sentiment.trend_analysis.sentiment_trend?.includes('improving') ? 'text-emerald-600' :
                  sentiment.trend_analysis.sentiment_trend?.includes('declining') ? 'text-red-600' :
                  'text-slate-600'
                )}>
                  {sentiment.trend_analysis.sentiment_trend}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-600 mb-1">Mention Volume</p>
                <p className="text-sm font-medium text-slate-900">
                  {sentiment.trend_analysis.volume_trend}
                </p>
              </div>
            </div>

            {sentiment.trend_analysis.recent_events?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-900 mb-2">Recent Events</p>
                <ul className="space-y-1">
                  {sentiment.trend_analysis.recent_events.map((event, i) => (
                    <li key={i} className="text-sm text-slate-600 pl-4">• {event}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={analyzeSentiment}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh Analysis
        </Button>
      </div>
    </div>
  );
}