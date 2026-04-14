"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  MessageSquare, 
  Send,
  Sparkles,
  Lightbulb,
  FileText,
  Users,
  TrendingUp,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ChatContentProps {
  user: User
}

const suggestedPrompts = [
  {
    icon: FileText,
    title: "Pitch Feedback",
    prompt: "Can you review my pitch deck and give feedback?",
  },
  {
    icon: Users,
    title: "Investor Outreach",
    prompt: "How should I approach cold emailing investors?",
  },
  {
    icon: TrendingUp,
    title: "Fundraising Strategy",
    prompt: "What's the best strategy for my seed round?",
  },
  {
    icon: Lightbulb,
    title: "Valuation Help",
    prompt: "How do I determine my startup's valuation?",
  },
]

export function ChatContent({ user }: ChatContentProps) {
  const [message, setMessage] = useState("")
  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "Founder"

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">AI Assistant</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Chat with Anker AI
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">Online</span>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 px-8 py-8 flex flex-col">
        {/* Welcome message */}
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-semibold mb-2">
            Hi {firstName}, I&apos;m Anker AI
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Your AI-powered fundraising advisor. Ask me anything about pitching, investor outreach, or fundraising strategy.
          </p>

          {/* Suggested prompts */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt.title}
                onClick={() => setMessage(prompt.prompt)}
                className="p-4 bg-card/50 border border-border/50 rounded-xl text-left hover:border-primary/30 hover:bg-card/80 transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <prompt.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="font-medium text-sm">{prompt.title}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{prompt.prompt}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="max-w-2xl mx-auto w-full mt-8">
          <div className="relative">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask anything about fundraising..."
              className="pr-12 py-6"
            />
            <Button 
              size="icon" 
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              disabled={!message.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Anker AI can make mistakes. Verify important information with your advisors.
          </p>
        </div>
      </div>
    </div>
  )
}
