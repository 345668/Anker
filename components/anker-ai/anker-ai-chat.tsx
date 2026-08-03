"use client";

/**
 * ANKER AI — a Claude-style chatbot. Streaming responses, a model picker over
 * the full catalog, markdown rendering, new-chat/stop. Chat runs on the
 * selected DashScope model via /api/anker/chat (SSE → text stream).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Square, Plus, ChevronDown, Sparkles, Bot, User as UserIcon, Loader2, Check,
} from "lucide-react";

interface CatalogModel {
  id: string; name: string; category: string; provider: string; freeTier?: boolean;
  contextTokens?: number; priceIn?: string; priceOut?: string; price?: string; blurb: string;
}
interface Msg { role: "user" | "assistant"; content: string }

const CATEGORY_LABEL: Record<string, string> = {
  chat: "Chat", vision: "Vision + chat", omni: "Omni (multimodal)",
  image: "Image", video: "Video", tts: "Speech (TTS)", asr: "Speech (ASR)",
  embedding: "Embedding", rerank: "Rerank", translation: "Translation",
};

export function AnkerAiChat() {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [chattable, setChattable] = useState<string[]>(["chat", "vision", "omni"]);
  const [modelId, setModelId] = useState<string>("qwen-flash");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/anker/models");
      if (!res.ok) return;
      const j = await res.json();
      setModels(j.models); setChattable(j.chattable); setModelId(j.default);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const selected = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const grouped = useMemo(() => {
    const g: Record<string, CatalogModel[]> = {};
    for (const m of models) (g[m.category] ??= []).push(m);
    return g;
  }, [models]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/anker/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: modelId, messages: next.slice(0, -1) }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Something went wrong");
        setMessages((prev) => prev.filter((_, i) => !(i === prev.length - 1 && prev[i].role === "assistant" && !prev[i].content)));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, modelId]);

  function stop() { abortRef.current?.abort(); }
  function newChat() { if (streaming) stop(); setMessages([]); setError(null); setInput(""); }

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></div>
          <span className="font-semibold">ANKER AI</span>
        </div>
        {/* Model picker */}
        <div className="relative">
          <button onClick={() => setPickerOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted">
            {selected?.name ?? modelId}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
                {Object.entries(grouped).map(([cat, list]) => {
                  const isChat = chattable.includes(cat);
                  return (
                    <div key={cat} className="mb-1">
                      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABEL[cat] ?? cat}{!isChat && <span className="ml-1 opacity-60">· tool</span>}
                      </div>
                      {list.map((m) => (
                        <button
                          key={m.id}
                          disabled={!isChat}
                          onClick={() => { if (isChat) { setModelId(m.id); setPickerOpen(false); } }}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${isChat ? "hover:bg-muted" : "cursor-default opacity-50"}`}
                          title={m.blurb}
                        >
                          <span className="mt-0.5 w-4 shrink-0">{m.id === modelId && <Check className="h-4 w-4 text-primary" />}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 font-medium">
                              {m.name}
                              {m.freeTier && <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600">free</span>}
                            </span>
                            <span className="line-clamp-2 text-xs text-muted-foreground">{m.blurb}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <button onClick={newChat} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted">
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState onPick={(q) => { setInput(q); taRef.current?.focus(); }} />
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => <Bubble key={i} msg={m} streaming={streaming && i === messages.length - 1} />)}
            </div>
          )}
          {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-primary">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Message ANKER AI (${selected?.name ?? modelId})…`}
              rows={1}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
            />
            {streaming ? (
              <button onClick={stop} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/70" title="Stop">
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim()} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40" title="Send">
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            ANKER AI can make mistakes. Model: {selected?.name ?? modelId}. Enter to send · Shift+Enter for newline.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const suggestions = [
    "Draft a warm intro email to a seed-stage fintech investor.",
    "Summarize what makes a strong pre-seed pitch deck.",
    "What questions should I prepare for a Series A partner meeting?",
    "Turn these bullet points into a crisp investor update.",
  ];
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Sparkles className="h-7 w-7 text-primary" /></div>
      <h1 className="text-2xl font-semibold">ANKER AI</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">Your fundraising copilot. Ask anything, or pick a model up top — Qwen3.x, GLM-5.2, DeepSeek, Kimi and more.</p>
      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="rounded-xl border border-border p-3 text-left text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className="flex gap-3">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isUser ? "bg-muted" : "bg-primary/10"}`}>
        {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-muted-foreground">{isUser ? "You" : "ANKER AI"}</div>
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
        ) : (
          <div className="text-sm leading-relaxed">
            {msg.content ? <Markdown text={msg.content} /> : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…</span>}
            {streaming && msg.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/40 align-middle" />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lightweight, dependency-free Markdown ────────────────────────────────────
function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const code = nl >= 0 ? part.slice(nl + 1) : part;
      blocks.push(
        <pre key={`c${i}`} className="my-2 overflow-x-auto rounded-lg bg-muted/70 p-3 text-[13px] leading-relaxed"><code>{code.replace(/\n$/, "")}</code></pre>,
      );
    } else {
      part.split(/\n{2,}/).forEach((para, j) => {
        const t = para.trim();
        if (!t) return;
        const lines = t.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          blocks.push(<ul key={`u${i}-${j}`} className="my-2 list-disc space-y-1 pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>);
        } else if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
          blocks.push(<ol key={`o${i}-${j}`} className="my-2 list-decimal space-y-1 pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>)}</ol>);
        } else if (/^#{1,3}\s/.test(t)) {
          const level = t.match(/^#+/)![0].length;
          const content = inline(t.replace(/^#+\s/, ""));
          blocks.push(level === 1 ? <h3 key={`h${i}-${j}`} className="mb-1 mt-3 text-lg font-semibold">{content}</h3> : <h4 key={`h${i}-${j}`} className="mb-1 mt-2 font-semibold">{content}</h4>);
        } else {
          blocks.push(<p key={`p${i}-${j}`} className="my-1.5 whitespace-pre-wrap">{lines.map((l, k) => <span key={k}>{inline(l)}{k < lines.length - 1 && <br />}</span>)}</p>);
        }
      });
    }
  });
  return <>{blocks}</>;
}

/** Inline: **bold**, *italic*, `code`, [text](url). */
function inline(s: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0; let m: RegExpExecArray | null; let key = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={key++} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) { const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!; nodes.push(<a key={key++} href={mm[2]} target="_blank" rel="noreferrer" className="text-primary underline">{mm[1]}</a>); }
    else nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}
