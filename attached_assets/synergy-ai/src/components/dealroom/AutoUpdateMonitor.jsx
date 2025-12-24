import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";

export default function AutoUpdateMonitor({ dealRoom, interactions }) {
  const queryClient = useQueryClient();

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dealRoom']);
      queryClient.invalidateQueries(['dealRooms']);
    },
  });

  useEffect(() => {
    if (!dealRoom || !interactions || interactions.length === 0) return;

    const analyzeAndUpdate = async () => {
      // Get recent interactions (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentInteractions = interactions.filter(i => 
        new Date(i.created_date) > oneDayAgo
      );

      if (recentInteractions.length === 0) return;

      // Analyze interactions with AI
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze these recent investor interactions and recommend deal room updates:

Deal Room: ${dealRoom.name}
Current Status: ${dealRoom.status}
Current Temperature: ${dealRoom.deal_temperature || 'unknown'}

Recent Interactions:
${recentInteractions.map(i => `
- Type: ${i.type}
- Subject: ${i.subject}
- Date: ${new Date(i.created_date).toLocaleDateString()}
- Content: ${i.content?.substring(0, 200)}
${i.metadata?.sentiment ? `- Sentiment: ${i.metadata.sentiment}` : ''}
`).join('\n')}

Based on these interactions, determine:
1. Should the deal temperature change? (hot/warm/cold/frozen)
2. Should the status change? (preparing/active/closing/closed/paused)
3. What new risk factors should be added?
4. What opportunities emerged?
5. What notifications should be sent?
6. Success probability (0-100)

Be conservative with status changes - only suggest if there's clear evidence.`,
        response_json_schema: {
          type: 'object',
          properties: {
            should_update: { type: 'boolean' },
            new_temperature: { type: 'string', enum: ['hot', 'warm', 'cold', 'frozen'] },
            new_status: { type: 'string', enum: ['preparing', 'active', 'closing', 'closed', 'paused'] },
            reason: { type: 'string' },
            new_risks: { type: 'array', items: { type: 'string' } },
            new_opportunities: { type: 'array', items: { type: 'string' } },
            notifications: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            },
            success_probability: { type: 'number' }
          }
        }
      });

      if (result.should_update) {
        const updates = {};
        
        if (result.new_temperature && result.new_temperature !== dealRoom.deal_temperature) {
          updates.deal_temperature = result.new_temperature;
        }
        
        if (result.new_status && result.new_status !== dealRoom.status) {
          updates.status = result.new_status;
        }

        if (result.new_risks?.length > 0) {
          updates.risk_factors = [...(dealRoom.risk_factors || []), ...result.new_risks];
        }

        if (result.success_probability) {
          updates.success_probability = result.success_probability;
        }

        if (Object.keys(updates).length > 0) {
          await updateDealRoomMutation.mutateAsync({
            id: dealRoom.id,
            data: {
              ...updates,
              ai_insights: {
                ...dealRoom.ai_insights,
                last_auto_update: new Date().toISOString(),
                update_reason: result.reason,
                detected_opportunities: result.new_opportunities
              }
            }
          });

          toast.success(`Deal room auto-updated: ${result.reason}`);
        }

        // Send notifications
        if (result.notifications?.length > 0) {
          for (const notif of result.notifications) {
            toast.info(notif.message);
          }
        }
      }
    };

    analyzeAndUpdate();
  }, [interactions?.length, dealRoom?.id]);

  return null; // This is a monitoring component with no UI
}