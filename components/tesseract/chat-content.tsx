"use client"

import { useState, useRef, useEffect } from "react"
import type { User } from "@supabase/supabase-js"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { 
  MessageSquare, 
  Send,
  Sparkles,
  Lightbulb,
  FileText,
  Users,
  TrendingUp,
  Loader2,
  Bot,
  User as UserIcon,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ChatContentProps {
  user: User
  startup?: { name: string; industry?: string } | null
}

const suggestedPrompts = [
  {
    icon: FileText,
    title: "Pitch Feedback",
    prompt: "Can you review my pitch deck and give me feedback on how to improve it for investors?",
  },
  {
    icon: Users,
    title: "Investor Outreach",
    prompt: "What's the best approach for cold emailing VCs? Give me a template and tips.",
  },
  {
    icon: TrendingUp,
    title: "Fundraising Strategy",
    prompt: "Help me plan my seed round fundraising strategy. What should I prepare?",
  },
  {
    icon: Lightbulb,
    title: "Valuation Help",
    prompt: "How do I determine my startup's pre-money valuation for a seed round?",
  },
]

export function ChatContent({ user, startup }: ChatContentProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "Founder"

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ 
      api: '/api/chat',
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          messages,
          id,
          context: startup ? { startup: startup.name, industry: startup.industry } : undefined
        }
      })
    }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput("")
  }

  const handlePromptClick = (prompt: string) => {
    setInput(prompt)
  }

  const handleClearChat = () => {
    setMessages([])
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">AI Assistant</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Chat with Anker AI
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearChat} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Clear Chat
              </Button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 px-8 py-8 flex flex-col">
        {messages.length === 0 ? (
          /* Welcome message */
          <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-foreground" />
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
                  onClick={() => handlePromptClick(prompt.prompt)}
                  className="p-4 bg-foreground/[0.02] border border-foreground/10 rounded-xl text-left hover:border-foreground/30 hover:bg-foreground/[0.05] transition-all group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
                      <prompt.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-sm">{prompt.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{prompt.prompt}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="max-w-3xl mx-auto w-full flex-1 space-y-6 pb-32">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={cn(
                  "flex gap-4",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-background" />
                  </div>
                )}
                <div 
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === 'user' 
                      ? "bg-foreground text-background" 
                      : "bg-foreground/[0.03] border border-foreground/10"
                  )}
                >
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    {message.parts.map((part, index) => {
                      if (part.type === 'text') {
                        return (
                          <p key={index} className="whitespace-pre-wrap m-0 text-sm leading-relaxed">
                            {part.text}
                          </p>
                        )
                      }
                      return null
                    })}
                  </div>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-4 justify-start">
                <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-background" />
                </div>
                <div className="bg-foreground/[0.03] border border-foreground/10 rounded-2xl px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input area */}
        <div className="fixed bottom-0 left-64 right-0 bg-gradient-to-t from-background via-background to-transparent pt-8 pb-6 px-8">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative flex items-center">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about fundraising..."
                className="w-full px-5 py-4 pr-14 bg-foreground/[0.03] border border-foreground/20 rounded-xl focus:outline-none focus:border-foreground/40 transition-colors"
                disabled={isLoading}
              />
              <Button 
                type="submit"
                size="icon" 
                className="absolute right-2 h-10 w-10 rounded-lg"
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Anker AI can make mistakes. Verify important information with your advisors.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
