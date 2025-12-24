import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, MessageSquare, Trash2, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { formatDistanceToNow } from 'date-fns';
import { cn } from "@/lib/utils";

const noteTypes = [
  { value: 'general', label: 'General', color: 'bg-slate-100 text-slate-700' },
  { value: 'meeting', label: 'Meeting', color: 'bg-blue-100 text-blue-700' },
  { value: 'update', label: 'Update', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'concern', label: 'Concern', color: 'bg-red-100 text-red-700' },
];

export default function DealNotes({ dealRoom }) {
  const [user, setUser] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ content: '', type: 'general' });
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['dealRoom']);
      setFormData({ content: '', type: 'general' });
      setShowAddForm(false);
    },
  });

  const handleAddNote = () => {
    const newNote = {
      ...formData,
      created_by: user?.email,
      timestamp: new Date().toISOString(),
    };

    updateDealRoomMutation.mutate({
      id: dealRoom.id,
      data: {
        notes: [...(dealRoom.notes || []), newNote],
      }
    });
  };

  const deleteNote = (index) => {
    const updatedNotes = dealRoom.notes.filter((_, i) => i !== index);
    updateDealRoomMutation.mutate({
      id: dealRoom.id,
      data: { notes: updatedNotes },
    });
  };

  const notes = [...(dealRoom.notes || [])].reverse();

  return (
    <div className="space-y-6">
      {/* Add Note Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deal Notes & Updates</CardTitle>
        </CardHeader>
        <CardContent>
          {!showAddForm ? (
            <Button onClick={() => setShowAddForm(true)} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Note Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {noteTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  placeholder="Add your note here..."
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddNote}
                  disabled={!formData.content || updateDealRoomMutation.isPending}
                >
                  {updateDealRoomMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Add Note
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes List */}
      {notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Notes Yet</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Add notes to track important updates, meetings, and concerns
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note, index) => {
            const typeConfig = noteTypes.find(t => t.value === note.type) || noteTypes[0];
            const Icon = note.type === 'concern' ? AlertCircle : MessageSquare;

            return (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <Badge className={cn("text-xs", typeConfig.color)}>
                        {typeConfig.label}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {formatDistanceToNow(new Date(note.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteNote(notes.length - 1 - index)}
                      className="text-red-500 hover:text-red-700 h-7 w-7"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Added by {note.created_by || 'Unknown'}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}