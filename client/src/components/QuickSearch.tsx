import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Building2, Users, Rocket, X, ArrowRight, Loader2 } from "lucide-react";

const LIMIT = 4;

interface QuickSearchProps {
  open: boolean;
  onClose: () => void;
}

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function QuickSearch({ open, onClose }: QuickSearchProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(-1);

  const q = useDebounce(query, 220);
  const enabled = open && q.length >= 2;
  const enc = encodeURIComponent(q);

  const { data: firmsData, isFetching: fFetch } = useQuery<{ data: any[] }>({
    queryKey: [`/api/firms?search=${enc}&limit=${LIMIT}`],
    enabled,
  });
  const { data: investorsData, isFetching: iFetch } = useQuery<{ data: any[] }>({
    queryKey: [`/api/investors?search=${enc}&limit=${LIMIT}`],
    enabled,
  });
  const { data: startupsData, isFetching: sFetch } = useQuery<{ data: any[] }>({
    queryKey: [`/api/startups?search=${enc}&limit=${LIMIT}`],
    enabled,
  });

  const firms = firmsData?.data ?? [];
  const investors = investorsData?.data ?? [];
  const startups = startupsData?.data ?? [];
  const loading = fFetch || iFetch || sFetch;

  type ResultItem = { label: string; sub: string; href: string; icon: "firm" | "investor" | "startup" };

  const results: ResultItem[] = [
    ...firms.map(f => ({ label: f.name, sub: [f.type, f.location].filter(Boolean).join(" · "), href: `/app/investor-db?firm=${f.id}`, icon: "firm" as const })),
    ...investors.map(i => ({ label: i.name, sub: [i.title, i.firm].filter(Boolean).join(" · "), href: `/app/investor-db?investor=${i.id}`, icon: "investor" as const })),
    ...startups.map(s => ({ label: s.name, sub: [s.industry, s.stage].filter(Boolean).join(" · "), href: `/app/startups/${s.id}`, icon: "startup" as const })),
  ];

  const seeAllHref = `/app/search?q=${enc}`;

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      setCursor(-1);
    } else {
      setQuery("");
      setCursor(-1);
    }
  }, [open]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor(c => Math.min(c + 1, results.length)); // +1 for "see all"
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor(c => Math.max(c - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cursor === results.length) {
          navigate(seeAllHref);
          onClose();
        } else if (cursor >= 0 && results[cursor]) {
          navigate(results[cursor].href);
          onClose();
        } else if (q.length >= 2) {
          navigate(seeAllHref);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, cursor, results, q, seeAllHref, navigate, onClose]);

  const iconFor = (type: ResultItem["icon"]) => {
    if (type === "firm") return <Building2 className="w-3.5 h-3.5 flex-shrink-0" />;
    if (type === "investor") return <Users className="w-3.5 h-3.5 flex-shrink-0" />;
    return <Rocket className="w-3.5 h-3.5 flex-shrink-0" />;
  };

  const colorFor = (type: ResultItem["icon"]) => {
    if (type === "firm") return "rgb(196,227,230)";
    if (type === "investor") return "rgb(142,132,247)";
    return "rgb(200,170,130)";
  };

  const labelFor = (type: ResultItem["icon"]) => {
    if (type === "firm") return "Firm";
    if (type === "investor") return "Investor";
    return "Startup";
  };

  // Group by type for section headers
  const sections = [
    { type: "firm" as const, label: "Investment Firms", items: firms, color: "rgb(196,227,230)" },
    { type: "investor" as const, label: "Investors", items: investors, color: "rgb(142,132,247)" },
    { type: "startup" as const, label: "Startups", items: startups, color: "rgb(200,170,130)" },
  ].filter(s => s.items.length > 0);

  const hasResults = results.length > 0;
  const showEmpty = enabled && !loading && !hasResults;
  const showHint = !enabled && q.length === 0;
  const showShort = !enabled && q.length === 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl"
            style={{
              background: "rgb(20,20,28)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            }}
          >
            {/* Input row */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "rgb(142,132,247)" }} />
                : <Search className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
              }
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setCursor(-1); }}
                placeholder="Search firms, investors, startups…"
                data-testid="input-quick-search"
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: "#fff",
                  fontSize: 15,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                  <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </button>
              )}
              <kbd style={{ fontSize: 11, padding: "2px 6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", flexShrink: 0 }}>
                esc
              </kbd>
            </div>

            {/* Results */}
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {showHint && (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                  Type to search across firms, investors &amp; startups
                </div>
              )}
              {showShort && (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                  Type at least 2 characters…
                </div>
              )}
              {loading && !hasResults && (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                  Searching…
                </div>
              )}
              {showEmpty && (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                  No results for <strong style={{ color: "rgba(255,255,255,0.5)" }}>"{q}"</strong>
                </div>
              )}

              {hasResults && (
                <div style={{ padding: "8px 0" }}>
                  {(() => {
                    let globalIdx = 0;
                    return sections.map(section => {
                      const sectionStart = globalIdx;
                      const els = section.items.map((item, i) => {
                        const idx = sectionStart + i;
                        const active = cursor === idx;
                        const href =
                          section.type === "firm"
                            ? `/app/investor-db?firm=${item.id}`
                            : section.type === "investor"
                            ? `/app/investor-db?investor=${item.id}`
                            : `/app/startups/${item.id}`;
                        globalIdx++;
                        return (
                          <button
                            key={item.id}
                            onMouseEnter={() => setCursor(idx)}
                            onClick={() => { navigate(href); onClose(); }}
                            data-testid={`result-${section.type}-${item.id}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              width: "100%",
                              padding: "9px 20px",
                              background: active ? "rgba(255,255,255,0.05)" : "none",
                              border: "none",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "background 0.1s",
                            }}
                          >
                            <span style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: `${section.color}18`,
                              border: `1px solid ${section.color}30`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: section.color,
                              flexShrink: 0,
                            }}>
                              {iconFor(section.type)}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#fff", fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {item.name}
                              </span>
                              {(item.sub ?? [item.type ?? item.industry ?? "", item.location ?? item.stage ?? ""].filter(Boolean).join(" · ")) && (
                                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {[item.type ?? item.industry, item.location ?? item.stage].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </span>
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: `${section.color}18`, color: section.color, border: `1px solid ${section.color}28`, flexShrink: 0 }}>
                              {section.label.replace("Investment ", "").replace("s", "").replace("up", "up")}
                            </span>
                          </button>
                        );
                      });
                      return (
                        <div key={section.type}>
                          <div style={{ padding: "6px 20px 4px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.28)" }}>
                            {section.label}
                          </div>
                          {els}
                        </div>
                      );
                    });
                  })()}

                  {/* See all */}
                  {q.length >= 2 && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 6, paddingTop: 6 }}>
                      <button
                        onMouseEnter={() => setCursor(results.length)}
                        onClick={() => { navigate(seeAllHref); onClose(); }}
                        data-testid="button-quick-search-see-all"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "10px 20px",
                          background: cursor === results.length ? "rgba(142,132,247,0.08)" : "none",
                          border: "none",
                          cursor: "pointer",
                          color: "rgb(142,132,247)",
                          fontSize: 13,
                          fontWeight: 500,
                          fontFamily: "'DM Sans',sans-serif",
                          transition: "background 0.1s",
                        }}
                      >
                        <span>See all results for "{q}"</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer shortcuts */}
            <div style={{ padding: "8px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 16, alignItems: "center" }}>
              {[
                { key: "↑↓", label: "navigate" },
                { key: "↵", label: "open" },
                { key: "esc", label: "close" },
              ].map(s => (
                <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                  <kbd style={{ padding: "1px 5px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, fontFamily: "monospace", fontSize: 10 }}>{s.key}</kbd>
                  {s.label}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
                {results.length > 0 ? `${results.length} result${results.length !== 1 ? "s" : ""}` : ""}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
