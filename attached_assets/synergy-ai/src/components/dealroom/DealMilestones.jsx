import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Check, Calendar, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function DealMilestones({ dealRoom }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', due_date: '' });
  const queryClient = useQueryClient();

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['dealRoom']),
  });

  const handleAddMilestone = () => {
    const newMilestone = {
      ...formData,
      completed: false,
      completed_date: null,
    };
    
    updateDealRoomMutation.mutate({
      id: dealRoom.id,
      data: {
        milestones: [...(dealRoom.milestones || []), newMilestone],
      }
    });

    setFormData({ title: '', description: '', due_date: '' });
    setShowAddDialog(false);
  };

  const toggleMilestone = (index) => {
    const updatedMilestones = [...(dealRoom.milestones || [])];
    updatedMilestones[index] = {
      ...updatedMilestones[index],
      completed: !updatedMilestones[index].completed,
      completed_date: !updatedMilestones[index].completed ? new Date().toISOString() : null,
    };

    updateDealRoomMutation.mutate({
      id: dealRoom.id,
      data: { milestones: updatedMilestones },
    });
  };

  const deleteMilestone = (index) => {
    const updatedMilestones = dealRoom.milestones.filter((_, i) => i !== index);
    updateDealRoomMutation.mutate({
      id: dealRoom.id,
      data: { milestones: updatedMilestones },
    });
  };

  const milestones = dealRoom.milestones || [];
  const completed = milestones.filter(m => m.completed).length;
  const total = milestones.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Deal Milestones</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                {completed} of {total} milestones completed
              </p>
            </div>
            <Button onClick={() => setShowAddDialog(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Milestone
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Milestones List */}
      {milestones.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Milestones Yet</h3>
            <p className="text-slate-500 text-sm max-w-md mb-6">
              Track important deal milestones like term sheet, due diligence, and closing
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Milestone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <Card key={index} className={cn(milestone.completed && "bg-slate-50")}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={milestone.completed}
                    onCheckedChange={() => toggleMilestone(index)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h4 className={cn(
                      "font-medium text-slate-900",
                      milestone.completed && "line-through text-slate-500"
                    )}>
                      {milestone.title}
                    </h4>
                    {milestone.description && (
                      <p className="text-sm text-slate-600 mt-1">{milestone.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      {milestone.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due: {new Date(milestone.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {milestone.completed && milestone.completed_date && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <Check className="w-3 h-3" />
                          Completed {new Date(milestone.completed_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMilestone(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Sign term sheet"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Additional details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddMilestone}
                disabled={!formData.title || updateDealRoomMutation.isPending}
              >
                {updateDealRoomMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Milestone
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}