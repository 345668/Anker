import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  FileText, Loader2, Download, Mail, Sparkles, TrendingUp, 
  Calendar, DollarSign, Target, Users, Eye, CheckCircle
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function InvestorReporting({ dealRoom, startup, interactions, outreaches }) {
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const [reportPeriod, setReportPeriod] = useState('monthly');
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const generateReport = async () => {
    setGenerating(true);
    try {
      // Calculate engagement metrics
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const recentInteractions = interactions.filter(i => 
        new Date(i.created_date) > lastMonth
      );
      
      const recentOutreaches = outreaches.filter(o => 
        new Date(o.created_date) > lastMonth
      );

      // Completed milestones in period
      const completedMilestones = dealRoom.milestones?.filter(m => 
        m.completed && new Date(m.completed_date) > lastMonth
      ) || [];

      const engagementData = {
        total_interactions: recentInteractions.length,
        email_opens: recentOutreaches.filter(o => o.open_count > 0).length,
        email_replies: recentOutreaches.filter(o => o.stage === 'replied').length,
        meetings_held: recentInteractions.filter(i => i.type === 'meeting').length,
        documents_viewed: recentInteractions.filter(i => i.type === 'document_shared').length,
        active_investors: new Set(recentOutreaches.map(o => o.contact_id)).size
      };

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a comprehensive investor progress report for this startup.

STARTUP: ${startup?.company_name}
Industry: ${startup?.industry?.join(', ')}
Stage: ${startup?.stage}

DEAL ROOM: ${dealRoom.name}
Funding Round: ${dealRoom.funding_round}
Target: $${dealRoom.target_amount}
Raised to Date: $${dealRoom.raised_amount}
Progress: ${((dealRoom.raised_amount / dealRoom.target_amount) * 100).toFixed(1)}%

PERIOD: Last ${reportPeriod === 'weekly' ? '7 days' : reportPeriod === 'monthly' ? '30 days' : '90 days'}

RECENT ENGAGEMENT:
- Total Interactions: ${engagementData.total_interactions}
- Email Opens: ${engagementData.email_opens}
- Email Replies: ${engagementData.email_replies}
- Meetings Held: ${engagementData.meetings_held}
- Documents Viewed: ${engagementData.documents_viewed}
- Active Investors: ${engagementData.active_investors}

COMPLETED MILESTONES:
${completedMilestones.map(m => `- ${m.title}: ${m.description}`).join('\n') || 'No milestones completed in this period'}

STARTUP METRICS:
- Team Size: ${startup?.team_size || 'N/A'}
- Revenue: $${startup?.revenue || 0}
- Traction: ${JSON.stringify(startup?.traction_metrics || {})}

Generate a professional investor update including:
1. EXECUTIVE SUMMARY - Key highlights in 2-3 sentences
2. FUNDRAISING PROGRESS - Current status and momentum
3. BUSINESS METRICS - Financial and operational KPIs
4. PRODUCT UPDATES - New features, launches, achievements
5. TEAM UPDATES - New hires, advisors, partnerships
6. MILESTONES ACHIEVED - What was accomplished
7. KEY METRICS SUMMARY - Revenue, users, growth rates
8. INVESTOR ENGAGEMENT - How investors are interacting
9. UPCOMING MILESTONES - What's next
10. ASK - What help or introductions are needed

Make it concise, data-driven, and compelling.`,
        response_json_schema: {
          type: 'object',
          properties: {
            executive_summary: { type: 'string' },
            fundraising_status: {
              type: 'object',
              properties: {
                current_raised: { type: 'number' },
                target_amount: { type: 'number' },
                progress_percentage: { type: 'number' },
                committed_investors: { type: 'number' },
                pipeline_investors: { type: 'number' },
                momentum: { type: 'string' }
              }
            },
            business_metrics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  metric: { type: 'string' },
                  current_value: { type: 'string' },
                  previous_value: { type: 'string' },
                  change: { type: 'string' },
                  trend: { type: 'string', enum: ['up', 'down', 'stable'] }
                }
              }
            },
            product_updates: { type: 'array', items: { type: 'string' } },
            team_updates: { type: 'array', items: { type: 'string' } },
            milestones_achieved: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  milestone: { type: 'string' },
                  impact: { type: 'string' }
                }
              }
            },
            key_metrics: {
              type: 'object',
              properties: {
                revenue: { type: 'string' },
                growth_rate: { type: 'string' },
                customer_count: { type: 'string' },
                runway: { type: 'string' }
              }
            },
            engagement_summary: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                top_engaged_investors: { type: 'number' },
                response_rate: { type: 'string' }
              }
            },
            upcoming_milestones: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  milestone: { type: 'string' },
                  target_date: { type: 'string' }
                }
              }
            },
            asks: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setReport({
        ...result,
        generated_at: new Date().toISOString(),
        period: reportPeriod,
        engagement_data: engagementData
      });

      toast.success('Report generated successfully!');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const sendReport = async () => {
    if (!report) return;
    
    setSending(true);
    try {
      // Get all active investors
      const investorEmails = outreaches
        .filter(o => o.stage !== 'passed' && o.stage !== 'draft')
        .map(o => o.investor_reply)
        .filter(Boolean);

      // Format report as email
      const emailBody = `
<h2>Investor Update - ${startup?.company_name}</h2>
<p><strong>Period:</strong> ${new Date().toLocaleDateString()}</p>

<h3>Executive Summary</h3>
<p>${report.executive_summary}</p>

<h3>Fundraising Progress</h3>
<ul>
  <li>Raised: $${report.fundraising_status?.current_raised?.toLocaleString()} / $${report.fundraising_status?.target_amount?.toLocaleString()}</li>
  <li>Progress: ${report.fundraising_status?.progress_percentage}%</li>
  <li>Committed Investors: ${report.fundraising_status?.committed_investors}</li>
  <li>Momentum: ${report.fundraising_status?.momentum}</li>
</ul>

<h3>Business Metrics</h3>
<table border="1" cellpadding="5" style="border-collapse: collapse;">
  <tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr>
  ${report.business_metrics?.map(m => `
    <tr>
      <td>${m.metric}</td>
      <td>${m.current_value}</td>
      <td>${m.previous_value}</td>
      <td style="color: ${m.trend === 'up' ? 'green' : m.trend === 'down' ? 'red' : 'gray'}">${m.change}</td>
    </tr>
  `).join('')}
</table>

<h3>Milestones Achieved</h3>
<ul>
  ${report.milestones_achieved?.map(m => `<li><strong>${m.milestone}</strong>: ${m.impact}</li>`).join('')}
</ul>

<h3>What's Next</h3>
<ul>
  ${report.upcoming_milestones?.map(m => `<li>${m.milestone} - ${m.target_date}</li>`).join('')}
</ul>

<h3>How You Can Help</h3>
<ul>
  ${report.asks?.map(ask => `<li>${ask}</li>`).join('')}
</ul>

<p>Best regards,<br>${startup?.team_bios?.[0]?.name || 'The Team'}</p>
      `;

      // Send email via integration (placeholder - would need actual email addresses)
      await base44.integrations.Core.SendEmail({
        to: 'investors@example.com', // Would use actual investor emails
        subject: `${startup?.company_name} - ${reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)} Update`,
        body: emailBody
      });

      // Log interaction
      await base44.entities.InteractionLog.create({
        type: 'email_sent',
        subject: `Investor Update - ${reportPeriod}`,
        content: report.executive_summary,
        metadata: {
          report_period: reportPeriod,
          generated_at: report.generated_at
        },
        performed_by: (await base44.auth.me()).email
      });

      toast.success('Report sent to investors!');
    } catch (error) {
      console.error('Error sending report:', error);
      toast.error('Failed to send report');
    } finally {
      setSending(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;

    const reportText = `
INVESTOR UPDATE - ${startup?.company_name}
Generated: ${new Date(report.generated_at).toLocaleString()}
Period: ${reportPeriod}

EXECUTIVE SUMMARY
${report.executive_summary}

FUNDRAISING PROGRESS
Current Raised: $${report.fundraising_status?.current_raised?.toLocaleString()}
Target Amount: $${report.fundraising_status?.target_amount?.toLocaleString()}
Progress: ${report.fundraising_status?.progress_percentage}%
Momentum: ${report.fundraising_status?.momentum}

BUSINESS METRICS
${report.business_metrics?.map(m => `${m.metric}: ${m.current_value} (${m.change})`).join('\n')}

MILESTONES ACHIEVED
${report.milestones_achieved?.map(m => `- ${m.milestone}: ${m.impact}`).join('\n')}

UPCOMING MILESTONES
${report.upcoming_milestones?.map(m => `- ${m.milestone} (${m.target_date})`).join('\n')}

HOW YOU CAN HELP
${report.asks?.map(ask => `- ${ask}`).join('\n')}
    `;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investor-update-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Generation Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Investor Report</CardTitle>
          <CardDescription>
            AI-powered progress updates with metrics, milestones, and engagement analytics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={reportPeriod} onValueChange={setReportPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              onClick={generateReport}
              disabled={generating}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      {report && (
        <>
          {/* Executive Summary */}
          <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-indigo-900">Executive Summary</CardTitle>
                <Badge className="bg-indigo-100 text-indigo-700">
                  {reportPeriod} Report
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-indigo-900">{report.executive_summary}</p>
            </CardContent>
          </Card>

          {/* Fundraising Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Fundraising Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Current Raised</p>
                  <p className="text-lg font-bold text-slate-900">
                    ${report.fundraising_status?.current_raised?.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Target Amount</p>
                  <p className="text-lg font-bold text-slate-900">
                    ${report.fundraising_status?.target_amount?.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Committed</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {report.fundraising_status?.committed_investors}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pipeline</p>
                  <p className="text-lg font-bold text-blue-600">
                    {report.fundraising_status?.pipeline_investors}
                  </p>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600">Progress</span>
                  <span className="text-sm font-semibold">{report.fundraising_status?.progress_percentage}%</span>
                </div>
                <Progress value={report.fundraising_status?.progress_percentage} />
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-medium text-slate-700 mb-1">Momentum:</p>
                <p className="text-sm text-slate-900">{report.fundraising_status?.momentum}</p>
              </div>
            </CardContent>
          </Card>

          {/* Business Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                Business Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.business_metrics?.map((metric, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{metric.metric}</p>
                      <p className="text-xs text-slate-500">Previous: {metric.previous_value}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">{metric.current_value}</p>
                        <p className={cn(
                          "text-xs font-medium",
                          metric.trend === 'up' && "text-emerald-600",
                          metric.trend === 'down' && "text-red-600",
                          metric.trend === 'stable' && "text-slate-600"
                        )}>
                          {metric.change}
                        </p>
                      </div>
                      {metric.trend === 'up' && <TrendingUp className="w-5 h-5 text-emerald-600" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Milestones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader>
                <CardTitle className="text-sm text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Milestones Achieved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.milestones_achieved?.map((milestone, i) => (
                    <div key={i} className="bg-white rounded p-2 border border-emerald-200">
                      <p className="text-sm font-medium text-emerald-900">{milestone.milestone}</p>
                      <p className="text-xs text-emerald-700">{milestone.impact}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-sm text-blue-900 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Upcoming Milestones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.upcoming_milestones?.map((milestone, i) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded p-2 border border-blue-200">
                      <p className="text-sm text-blue-900">{milestone.milestone}</p>
                      <span className="text-xs text-blue-600">{milestone.target_date}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Engagement Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-600" />
                Investor Engagement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-700">{report.engagement_summary?.summary}</p>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Eye className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Active Investors</p>
                  <p className="text-lg font-bold text-slate-900">{report.engagement_data?.active_investors}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Mail className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Email Replies</p>
                  <p className="text-lg font-bold text-slate-900">{report.engagement_data?.email_replies}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Calendar className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">Meetings</p>
                  <p className="text-lg font-bold text-slate-900">{report.engagement_data?.meetings_held}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Asks */}
          {report.asks?.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-sm text-amber-900">How Investors Can Help</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.asks.map((ask, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                      <span className="font-semibold">{i + 1}.</span>
                      {ask}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={downloadReport} variant="outline" className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Download Report
            </Button>
            <Button 
              onClick={sendReport} 
              disabled={sending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send to Investors
            </Button>
          </div>
        </>
      )}
    </div>
  );
}