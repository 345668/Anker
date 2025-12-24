import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function MatchFeedback({ match, onFeedbackSubmit }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(match?.user_feedback?.rating || null);
  const [feedback, setFeedback] = useState(match?.user_feedback?.feedback || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating) {
      toast.error('Please select thumbs up or down');
      return;
    }

    setSubmitting(true);
    try {
      await onFeedbackSubmit?.({
        rating,
        feedback: feedback.trim(),
        timestamp: new Date().toISOString()
      });
      
      toast.success('Feedback submitted. This helps improve future matches!');
      setOpen(false);
    } catch (error) {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const currentRating = match?.user_feedback?.rating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className={cn(
            "text-slate-500 hover:text-slate-700",
            currentRating === 'positive' && "text-emerald-600",
            currentRating === 'negative' && "text-red-600"
          )}
        >
          {currentRating === 'positive' ? (
            <>
              <ThumbsUp className="w-4 h-4 mr-1.5 fill-emerald-600" />
              <span className="text-xs">Helpful</span>
            </>
          ) : currentRating === 'negative' ? (
            <>
              <ThumbsDown className="w-4 h-4 mr-1.5 fill-red-600" />
              <span className="text-xs">Not relevant</span>
            </>
          ) : (
            <>
              <MessageSquare className="w-4 h-4 mr-1.5" />
              <span className="text-xs">Rate match</span>
            </>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How would you rate this match?</DialogTitle>
          <DialogDescription>
            Your feedback helps our AI learn and provide better investor recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Rating Buttons */}
          <div className="flex justify-center gap-4">
            <Button
              variant={rating === 'positive' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setRating('positive')}
              className={cn(
                "flex-1",
                rating === 'positive' && "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              <ThumbsUp className={cn(
                "w-5 h-5 mr-2",
                rating === 'positive' && "fill-white"
              )} />
              Good Match
            </Button>

            <Button
              variant={rating === 'negative' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setRating('negative')}
              className={cn(
                "flex-1",
                rating === 'negative' && "bg-red-600 hover:bg-red-700"
              )}
            >
              <ThumbsDown className={cn(
                "w-5 h-5 mr-2",
                rating === 'negative' && "fill-white"
              )} />
              Poor Match
            </Button>
          </div>

          {/* Feedback Text */}
          {rating && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {rating === 'positive' 
                  ? 'What made this a good match? (optional)'
                  : 'What was wrong with this match? (optional)'}
              </label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={
                  rating === 'positive'
                    ? 'e.g., Perfect stage and sector alignment, strong track record'
                    : 'e.g., Wrong stage, different geography, incompatible thesis'
                }
                rows={3}
                className="resize-none"
              />
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!rating || submitting}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </div>
        </div>

        {/* Learning Note */}
        <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-800">
          <p className="font-medium mb-1">🧠 AI Learning</p>
          <p>
            Your ratings help refine match quality by identifying investor types, sectors, 
            and stages that work best for your profile.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}