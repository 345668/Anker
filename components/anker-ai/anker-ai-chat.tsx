"use client";

/**
 * ANKER AI — a Claude-style chatbot. Streaming responses, a model picker over
 * the full catalog, markdown rendering, new-chat/stop. Chat runs on the
 * selected DashScope model via /api/anker/chat (SSE → text stream).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Square, Plus, ChevronDown, Sparkles, Bot, User as UserIcon, Loader2, Check,
  Wrench, Download, Cpu, Paperclip, X, FileText, MessageSquare, Trash2,
} from "lucide-react";

interface ChatSummary { id: string; title: string; model?: string; updatedAt?: string }

interface CatalogModel {
  id: string; name: string; category: string; provider: string; freeTier?: boolean;
  contextTokens?: number; priceIn?: string; priceOut?: string; price?: string; blurb: string;
}
interface Artifact { name: string; url: string; kind?: string }
interface Msg { role: "user" | "assistant"; content: string; images?: string[]; video?: string; artifacts?: Artifact[]; tools?: string[] }

/** Categories the composer can drive directly. */
const SELECTABLE = ["chat", "vision", "omni", "image", "video"];

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
  const [agentMode, setAgentMode] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  const chatIdRef = useRef<string | null>(null);
  const prevStreaming = useRef(false);
  messagesRef.current = messages;
  chatIdRef.current = chatId;

  const loadHistory = useCallback(async () => {
    try { const r = await fetch("/api/anker/chats"); if (r.ok) setHistory((await r.json()).chats ?? []); } catch {}
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const saveCurrentChat = useCallback(async () => {
    const msgs = messagesRef.current;
    const last = msgs[msgs.length - 1];
    if (msgs.length < 2 || !last || (last.role === "assistant" && !last.content && !last.images && !last.video && !last.artifacts)) return;
    try {
      const res = await fetch("/api/anker/chats", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: chatIdRef.current, title: msgs.find((m) => m.role === "user")?.content, model: modelId, messages: msgs }),
      });
      const j = await res.json();
      if (res.ok && j.id) { setChatId(j.id); chatIdRef.current = j.id; }
      loadHistory();
    } catch {}
  }, [modelId, loadHistory]);

  // Persist a conversation each time a turn finishes streaming.
  useEffect(() => {
    if (prevStreaming.current && !streaming) saveCurrentChat();
    prevStreaming.current = streaming;
  }, [streaming, saveCurrentChat]);

  async function loadChat(id: string) {
    if (streaming) stop();
    try {
      const r = await fetch(`/api/anker/chats/${id}`);
      if (!r.ok) return;
      const j = await r.json();
      setMessages(j.messages ?? []); setChatId(j.id); chatIdRef.current = j.id;
      setError(null); setFiles([]);
    } catch {}
  }
  async function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/anker/chats/${id}`, { method: "DELETE" }).catch(() => {});
    if (chatId === id) { setMessages([]); setChatId(null); chatIdRef.current = null; }
    loadHistory();
  }
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

  const setLastAssistant = (updater: (m: Msg) => Msg) =>
    setMessages((prev) => { const c = prev.slice(); c[c.length - 1] = updater(c[c.length - 1]); return c; });

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && files.length === 0) || streaming) return;
    setError(null);
    const cat = selected?.category ?? "chat";
    const att = files;
    const label = att.length ? `${text}${text ? "\n\n" : ""}📎 ${att.map((f) => f.name).join(", ")}` : text;
    const next: Msg[] = [...messages, { role: "user", content: label }, { role: "assistant", content: "" }];
    setMessages(next);
    setInput("");
    setFiles([]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      if (agentMode) {
        // ── Agent: the platform's tool-using assistant (CRM/deals/docs/…) ──
        setLastAssistant((m) => ({ ...m, content: "Working with your data…" }));
        const task = text || "Please review the attached document(s).";
        const useModel = selected && chattable.includes(selected.category) ? modelId : undefined;
        let res: Response;
        if (att.length) {
          const fd = new FormData();
          fd.set("task", task); fd.set("maxSteps", "6");
          if (useModel) fd.set("model", useModel);
          att.forEach((f) => fd.append("files", f));
          res = await fetch("/api/assistant", { method: "POST", body: fd, signal: ac.signal });
        } else {
          res = await fetch("/api/assistant", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ task, maxSteps: 6, model: useModel }), signal: ac.signal,
          });
        }
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
        const tools = Array.isArray(j?.steps) ? j.steps.map((s: any) => s.tool).filter(Boolean) : [];
        setLastAssistant((m) => ({ ...m, content: j.answer || "Done.", artifacts: j.artifacts || [], tools }));
      } else if (cat === "image" || cat === "video") {
        // ── Media generation ──────────────────────────────────────────────
        const res = await fetch("/api/anker/media", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: modelId, prompt: text }), signal: ac.signal,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || `Error ${res.status}`);
        if (j.kind === "image") {
          setLastAssistant((m) => ({ ...m, content: "", images: j.images }));
        } else if (j.kind === "video") {
          setLastAssistant((m) => ({ ...m, content: "Rendering video… this can take a minute." }));
          // Poll the task until it's done.
          for (let i = 0; i < 90; i++) {
            if (ac.signal.aborted) break;
            await new Promise((r) => setTimeout(r, 4000));
            const pr = await fetch(`/api/anker/media?task=${encodeURIComponent(j.taskId)}`, { signal: ac.signal });
            const ps = await pr.json();
            if (ps.status === "SUCCEEDED" && ps.videoUrl) { setLastAssistant((m) => ({ ...m, content: "", video: ps.videoUrl })); break; }
            if (ps.status === "FAILED") throw new Error(ps.message || "Video generation failed");
            setLastAssistant((m) => ({ ...m, content: `Rendering video… (${ps.status?.toLowerCase?.() || "working"})` }));
          }
        }
      } else {
        // ── Streaming chat ────────────────────────────────────────────────
        const apiMessages = [...messages, { role: "user", content: text || "Please review the attached document(s)." }];
        let res: Response;
        if (att.length) {
          const fd = new FormData();
          fd.set("payload", JSON.stringify({ model: modelId, messages: apiMessages }));
          att.forEach((f) => fd.append("files", f));
          res = await fetch("/api/anker/chat", { method: "POST", body: fd, signal: ac.signal });
        } else {
          res = await fetch("/api/anker/chat", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: modelId, messages: apiMessages }), signal: ac.signal,
          });
        }
        if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || `Error ${res.status}`); }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          setLastAssistant((m) => ({ ...m, content: m.content + chunk }));
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Something went wrong");
        setMessages((prev) => prev.filter((_, i) => !(i === prev.length - 1 && prev[i].role === "assistant" && !prev[i].content && !prev[i].images && !prev[i].video)));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, modelId, selected, agentMode, chattable, files]);

  function stop() { abortRef.current?.abort(); }
  function newChat() { if (streaming) stop(); setMessages([]); setError(null); setInput(""); setFiles([]); setChatId(null); chatIdRef.current = null; }

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* History rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border md:flex">
        <div className="p-2">
          <button onClick={newChat} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
            <Plus className="h-4 w-4" /> New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <div className="px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent (max 10)</div>
          {history.length === 0 ? (
            <div className="px-1 py-2 text-xs text-muted-foreground">No saved chats yet.</div>
          ) : history.map((h) => (
            <button
              key={h.id}
              onClick={() => loadChat(h.id)}
              className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${chatId === h.id ? "bg-muted" : "hover:bg-muted/60"}`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{h.title || "New chat"}</span>
              <span onClick={(e) => deleteChat(h.id, e)} className="shrink-0 text-muted-foreground opacity-0 hover:text-red-500 group-hover:opacity-100" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
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
                  const isSel = SELECTABLE.includes(cat);
                  return (
                    <div key={cat} className="mb-1">
                      <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABEL[cat] ?? cat}{!isSel && <span className="ml-1 opacity-60">· tool</span>}
                      </div>
                      {list.map((m) => (
                        <button
                          key={m.id}
                          disabled={!isSel}
                          onClick={() => { if (isSel) { setModelId(m.id); setPickerOpen(false); } }}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${isSel ? "hover:bg-muted" : "cursor-default opacity-50"}`}
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
        <button
          onClick={() => setAgentMode((v) => !v)}
          title="Agent mode: let ANKER AI use platform tools — query investors, matchmake, draft outreach, build spreadsheets/docs."
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${agentMode ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
        >
          <Wrench className="h-4 w-4" /> Agent {agentMode ? "on" : "off"}
        </button>
        <button onClick={newChat} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted">
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
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-primary">
            <input
              ref={fileRef} type="file" multiple className="sr-only"
              accept=".pdf,.txt,.md,.csv,.json,.tsv,.log,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx"
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) setFiles((prev) => [...prev, ...fs].slice(0, 6)); if (fileRef.current) fileRef.current.value = ""; }}
            />
            <button onClick={() => fileRef.current?.click()} title="Attach documents" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-muted">
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={
                agentMode ? "Ask ANKER AI to act — e.g. 'find 20 seed fintech investors and draft outreach'…"
                : selected?.category === "image" ? `Describe an image to generate with ${selected.name}…`
                : selected?.category === "video" ? `Describe a video to generate with ${selected.name}…`
                : `Message ANKER AI (${selected?.name ?? modelId})…`}
              rows={1}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
            />
            {streaming ? (
              <button onClick={stop} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/70" title="Stop">
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim() && files.length === 0} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40" title="Send">
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
            {msg.images?.length ? (
              <div className={`grid gap-2 ${msg.images.length > 1 ? "grid-cols-2" : "grid-cols-1"} max-w-lg`}>
                {msg.images.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="generated" className="h-auto w-full" />
                  </a>
                ))}
              </div>
            ) : msg.video ? (
              <video src={msg.video} controls className="max-w-lg rounded-lg border border-border" />
            ) : msg.content ? (
              <Markdown text={msg.content} />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…</span>
            )}
            {streaming && msg.content && !msg.images && !msg.video && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/40 align-middle" />}
            {msg.tools && msg.tools.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <Cpu className="h-3 w-3" /> used:
                {[...new Set(msg.tools)].map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5">{t}</span>)}
              </div>
            )}
            {msg.artifacts && msg.artifacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {msg.artifacts.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                    <Download className="h-3.5 w-3.5" /> {a.name}{a.kind ? <span className="text-muted-foreground">.{a.kind}</span> : null}
                  </a>
                ))}
              </div>
            )}
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
