import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface QuickAnswer {
  question: string;
  answer: string;
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: quickAnswers = [] } = useQuery<QuickAnswer[]>({
    queryKey: ["/api/chatbot/quick-answers"],
  });

  const chatMutation = useMutation({
    mutationFn: async ({ userMessage, history }: { userMessage: string; history: ChatMessage[] }) => {
      const response = await apiRequest("POST", "/api/chatbot/chat", {
        message: userMessage,
        conversationHistory: history,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
      setSuggestedQuestions(data.suggestedQuestions || []);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    if (!message.trim() || chatMutation.isPending) return;

    const userMessage = message.trim();
    const newUserMsg: ChatMessage = { role: "user", content: userMessage };
    const updatedHistory = [...messages, newUserMsg];
    
    setMessage("");
    setMessages(updatedHistory);
    chatMutation.mutate({ userMessage, history: updatedHistory });
  }, [message, messages, chatMutation]);

  const handleQuickQuestion = useCallback((question: string) => {
    const newUserMsg: ChatMessage = { role: "user", content: question };
    const updatedHistory = [...messages, newUserMsg];
    
    setMessages(updatedHistory);
    chatMutation.mutate({ userMessage: question, history: updatedHistory });
  }, [messages, chatMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 w-[380px] h-[500px] bg-[rgb(28,28,28)] border border-white/10 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          data-testid="chatbot-panel"
        >
          <div className="flex items-center justify-between gap-4 p-4 border-b border-white/10 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-medium text-white">Anker Assistant</h3>
                <p className="text-xs text-white/70">Ask me anything</p>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white hover:bg-white/10"
              data-testid="button-close-chatbot"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-[rgb(142,132,247)]" />
                  <p className="text-white/60 text-sm" data-testid="text-welcome">
                    Hi! How can I help you with Anker today?
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-white/40 uppercase tracking-wide">
                    Quick Questions
                  </p>
                  {quickAnswers.slice(0, 4).map((qa, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickQuestion(qa.question)}
                      className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 group"
                      data-testid={`button-quick-question-${idx}`}
                    >
                      <ChevronRight className="w-4 h-4 text-[rgb(142,132,247)] invisible group-hover:visible" />
                      {qa.question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                    data-testid={`message-${msg.role}-${idx}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] p-3 rounded-xl text-sm ${
                        msg.role === "user"
                          ? "bg-[rgb(142,132,247)] text-white"
                          : "bg-white/10 text-white/90"
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white/60" />
                      </div>
                    )}
                  </div>
                ))}

                {chatMutation.isPending && (
                  <div className="flex gap-3" data-testid="loading-indicator">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl">
                      <Loader2 className="w-4 h-4 animate-spin text-white/60" />
                    </div>
                  </div>
                )}

                {suggestedQuestions.length > 0 && !chatMutation.isPending && (
                  <div className="pt-2 space-y-1">
                    <p className="text-xs text-white/40">Suggested:</p>
                    {suggestedQuestions.slice(0, 2).map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuickQuestion(q)}
                        className="block text-left text-xs text-[rgb(142,132,247)] hover:underline"
                        data-testid={`button-suggested-${idx}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                disabled={chatMutation.isPending}
                data-testid="input-chatbot-message"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!message.trim() || chatMutation.isPending}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] hover:opacity-90"
                data-testid="button-send-message"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] shadow-lg flex items-center justify-center z-50 hover:scale-105 active:scale-95 transition-transform"
        data-testid="button-toggle-chatbot"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white" />
        )}
      </button>
    </>
  );
}
