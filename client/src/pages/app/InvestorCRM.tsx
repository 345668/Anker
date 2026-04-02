import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Download, Trash2, Mail, Phone, Linkedin,
  CheckCircle2, Circle, XCircle, ChevronDown, Loader2, X,
  Building2, UserPlus, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";

// ── Stage definitions ─────────────────────────────────────────────────────────

const CRM_STAGES = [
  { id: "identified",   label: "Identified",    short: "ID",       color: "#8e84f7", weight: 1, terminal: false },
  { id: "cold_email",   label: "Cold Email",    short: "Cold",     color: "#c4e3e6", weight: 2, terminal: false },
  { id: "warm_intro",   label: "Warm Intro",    short: "Warm",     color: "#c8aa82", weight: 2, terminal: false },
  { id: "no_response",  label: "No Response",   short: "No Rep",   color: "#f87171", weight: 99, terminal: true },
  { id: "responded",    label: "Responded",     short: "Reply",    color: "#4ade80", weight: 3, terminal: false },
  { id: "pact_signed",  label: "PACT Signed",   short: "PACT",     color: "#8e84f7", weight: 4, terminal: false },
  { id: "due_diligence","label": "Due Diligence","short": "DD",     color: "#c4e3e6", weight: 5, terminal: false },
  { id: "soft_commit",  label: "Soft Commit",   short: "Soft",     color: "#c8aa82", weight: 6, terminal: false },
  { id: "review",       label: "Review",        short: "Rev",      color: "#fde68a", weight: 7, terminal: false },
  { id: "won",          label: "Closed Won",    short: "Won",      color: "#4ade80", weight: 8, terminal: true },
  { id: "passed",       label: "Passed",        short: "Lost",     color: "#f87171", weight: 99, terminal: true },
] as const;

type StageId = typeof CRM_STAGES[number]["id"];

const STAGE_MAP = Object.fromEntries(CRM_STAGES.map(s => [s.id, s])) as Record<string, typeof CRM_STAGES[number]>;

// Legacy stage normalisation (old kanban stages → new stages)
const LEGACY: Record<string, StageId> = {
  sourced: "identified", first_review: "cold_email", deep_dive: "responded",
  due_diligence: "due_diligence", term_sheet: "pact_signed", closed: "won",
};

function normaliseStage(raw: string | null | undefined): StageId {
  if (!raw) return "identified";
  if (STAGE_MAP[raw]) return raw as StageId;
  return LEGACY[raw] ?? "identified";
}

function getCellState(contactStage: StageId, col: typeof CRM_STAGES[number]) {
  if (contactStage === col.id) return "active";
  if (col.terminal) return "empty"; // terminal cols: only active when exactly that stage
  const cw = STAGE_MAP[contactStage]?.weight ?? 0;
  if (col.weight < cw && !STAGE_MAP[contactStage]?.terminal) return "done";
  return "empty";
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(contacts: Contact[]) {
  const headers = ["Name", "Company", "Title", "Email", "Stage", "LinkedIn", "Notes", "Added"];
  const rows = contacts.map(c => [
    [c.firstName, c.lastName].filter(Boolean).join(" "),
    c.company || "", c.title || "", c.email || "",
    normaliseStage(c.pipelineStage),
    c.linkedinUrl || "", (c.notes || "").replace(/\n/g, " "),
    c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `investor_crm_${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Stage cell ────────────────────────────────────────────────────────────────

function StageCell({
  state, stage, onClick, pending,
}: { state: "active" | "done" | "empty"; stage: typeof CRM_STAGES[number]; onClick: () => void; pending: boolean }) {
  return (
    <td
      style={{ padding: "0 4px", textAlign: "center", minWidth: 52, cursor: "pointer" }}
      onClick={onClick}
      data-testid={`cell-stage-${stage.id}`}
    >
      <button
        disabled={pending}
        style={{
          width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto",
          transition: "background 0.15s, transform 0.1s",
          background:
            state === "active" ? `${stage.color}30` :
            state === "done"   ? "rgba(74,222,128,0.12)" :
            "transparent",
          transform: state === "active" ? "scale(1.15)" : "scale(1)",
        }}
        title={stage.label}
      >
        {pending ? (
          <Loader2 size={13} style={{ color: stage.color }} className="animate-spin" />
        ) : state === "active" ? (
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: stage.color, display: "block", boxShadow: `0 0 6px ${stage.color}80` }} />
        ) : state === "done" ? (
          <CheckCircle2 size={13} style={{ color: "#4ade80" }} />
        ) : (
          <Circle size={13} style={{ color: "rgba(255,255,255,0.12)" }} />
        )}
      </button>
    </td>
  );
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({
  contact, onStageChange, onDelete, pendingStage,
}: {
  contact: Contact;
  onStageChange: (id: string, stage: StageId) => void;
  onDelete: (id: string) => void;
  pendingStage: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const stage = normaliseStage(contact.pipelineStage);
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <tr
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      className="crm-row"
      data-testid={`row-contact-${contact.id}`}
    >
      {/* Identity */}
      <td style={{ padding: "10px 16px", minWidth: 220 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600,
            background: "rgba(142,132,247,0.2)", color: "rgb(142,132,247)", border: "1px solid rgba(142,132,247,0.3)",
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[contact.title, contact.company].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </td>

      {/* Stage cells */}
      {CRM_STAGES.map(col => (
        <StageCell
          key={col.id}
          stage={col}
          state={getCellState(stage, col)}
          onClick={() => onStageChange(contact.id, col.id)}
          pending={pendingStage === col.id}
        />
      ))}

      {/* Actions */}
      <td style={{ padding: "0 16px", textAlign: "right", minWidth: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ color: "rgba(255,255,255,0.3)", transition: "color 0.1s" }}
               onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
               onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
               data-testid={`link-email-${contact.id}`}>
              <Mail size={13} />
            </a>
          )}
          {contact.linkedinUrl && (
            <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
               style={{ color: "rgba(255,255,255,0.3)", transition: "color 0.1s" }}
               onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
               onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
               data-testid={`link-linkedin-${contact.id}`}>
              <Linkedin size={13} />
            </a>
          )}
          <button
            onClick={() => onDelete(contact.id)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: 2, transition: "color 0.1s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.2)")}
            data-testid={`button-delete-${contact.id}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvestorCRM() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [pendingMap, setPendingMap] = useState<Record<string, string>>({});

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: StageId }) =>
      apiRequest("PATCH", `/api/contacts/${id}`, { pipelineStage: stage }).then(r => r.json()),
    onMutate: ({ id, stage }) => setPendingMap(m => ({ ...m, [id]: stage })),
    onSettled: (_, __, { id }) => setPendingMap(m => { const n = { ...m }; delete n[id]; return n; }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let list = contacts;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        [c.firstName, c.lastName, c.company, c.email, c.title]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    if (stageFilter !== "all") {
      list = list.filter(c => normaliseStage(c.pipelineStage) === stageFilter);
    }
    return list;
  }, [contacts, search, stageFilter]);

  // Stage summary counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contacts.length };
    for (const c of contacts) counts[normaliseStage(c.pipelineStage)] = (counts[normaliseStage(c.pipelineStage)] || 0) + 1;
    return counts;
  }, [contacts]);

  const stageProgress = useMemo(() => {
    // funnel: how many have reached each non-terminal stage or beyond
    return CRM_STAGES.filter(s => !s.terminal && s.id !== "no_response").map(s => ({
      ...s,
      count: contacts.filter(c => {
        const cs = normaliseStage(c.pipelineStage);
        const cw = STAGE_MAP[cs]?.weight ?? 0;
        const terminal = STAGE_MAP[cs]?.terminal ?? false;
        return cs === s.id || (!terminal && cw >= s.weight);
      }).length,
    }));
  }, [contacts]);

  return (
    <AppLayout
      title="Investor CRM"
      subtitle="Track every investor relationship through your fundraising pipeline"
      heroHeight="28vh"
      videoUrl={videoBackgrounds.dashboard}
    >
      <div className="py-8 bg-[rgb(18,18,18)]">
        <div className="max-w-[1700px] mx-auto px-6">

          {/* ── Funnel overview ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "20px 24px",
              overflowX: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: "max-content" }}>
              {stageProgress.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={() => setStageFilter(stageFilter === s.id ? "all" : s.id)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                      background: stageFilter === s.id ? `${s.color}20` : "transparent",
                      border: `1px solid ${stageFilter === s.id ? s.color + "50" : "rgba(255,255,255,0.08)"}`,
                      transition: "all 0.15s",
                    }}
                    data-testid={`button-funnel-${s.id}`}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700, color: stageFilter === s.id ? s.color : "#fff" }}>
                      {s.count}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>{s.short}</span>
                  </button>
                  {i < stageProgress.length - 1 && (
                    <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 12 }}>›</div>
                  )}
                </div>
              ))}
              <div style={{ marginLeft: "auto", paddingLeft: 16, display: "flex", gap: 12 }}>
                {[
                  { id: "no_response", label: "No Reply", color: "#f87171" },
                  { id: "passed", label: "Passed", color: "#f87171" },
                  { id: "won", label: "Won", color: "#4ade80" },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setStageFilter(stageFilter === t.id ? "all" : t.id)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                      background: stageFilter === t.id ? `${t.color}20` : "transparent",
                      border: `1px solid ${stageFilter === t.id ? t.color + "50" : "rgba(255,255,255,0.08)"}`,
                    }}
                    data-testid={`button-funnel-${t.id}`}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700, color: stageFilter === t.id ? t.color : "#fff" }}>
                      {stageCounts[t.id] ?? 0}
                    </span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Toolbar ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "8px 14px", flex: "1 1 220px",
            }}>
              <Search size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search contacts…"
                data-testid="input-search-crm"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13 }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <X size={12} style={{ color: "rgba(255,255,255,0.35)" }} />
                </button>
              )}
            </div>

            {stageFilter !== "all" && (
              <button
                onClick={() => setStageFilter("all")}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                  borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer",
                }}
                data-testid="button-clear-stage-filter"
              >
                <X size={11} />
                Clear stage filter
              </button>
            )}

            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
              {filtered.length} of {contacts.length} contacts
            </span>
            {contacts.length > 0 && (
              <button
                onClick={() => exportCSV(filtered)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                  borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer",
                }}
                data-testid="button-export-crm"
              >
                <Download size={13} /> Export CSV
              </button>
            )}
            <Link
              href="/app/investor-db"
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                borderRadius: 10, background: "rgba(142,132,247,0.15)", border: "1px solid rgba(142,132,247,0.3)",
                color: "rgb(142,132,247)", fontSize: 12, textDecoration: "none",
              }}
              data-testid="link-add-contacts"
            >
              <UserPlus size={13} /> Add contacts
            </Link>
          </div>

          {/* ── Table ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {isLoading ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <Loader2 className="animate-spin" style={{ color: "#8e84f7", margin: "0 auto 12px" }} size={24} />
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Loading your CRM…</p>
              </div>
            ) : contacts.length === 0 ? (
              <div style={{ padding: 64, textAlign: "center" }}>
                <Users size={40} style={{ color: "rgba(255,255,255,0.1)", margin: "0 auto 16px" }} />
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, marginBottom: 8 }}>No investors in your CRM yet</p>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 24 }}>
                  Go to Investor Database and use "Add all to CRM" to import investors.
                </p>
                <Link
                  href="/app/investor-db"
                  style={{
                    padding: "10px 20px", borderRadius: 10, background: "rgba(142,132,247,0.15)",
                    border: "1px solid rgba(142,132,247,0.3)", color: "rgb(142,132,247)", fontSize: 13, textDecoration: "none",
                  }}
                >
                  Go to Investor Database
                </Link>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No contacts match your filters.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th style={{ padding: "12px 16px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", minWidth: 220 }}>
                        Contact
                      </th>
                      {CRM_STAGES.map(s => (
                        <th
                          key={s.id}
                          style={{
                            padding: "12px 4px", textAlign: "center", minWidth: 52,
                            color: stageFilter === s.id ? s.color : "rgba(255,255,255,0.3)",
                            fontWeight: stageFilter === s.id ? 600 : 400,
                            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px",
                            cursor: "pointer", transition: "color 0.15s",
                            borderBottom: stageFilter === s.id ? `2px solid ${s.color}` : "2px solid transparent",
                          }}
                          onClick={() => setStageFilter(stageFilter === s.id ? "all" : s.id)}
                          data-testid={`th-stage-${s.id}`}
                        >
                          {s.short}
                        </th>
                      ))}
                      <th style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.3)", fontSize: 11, minWidth: 100 }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(contact => (
                      <ContactRow
                        key={contact.id}
                        contact={contact}
                        onStageChange={(id, stage) => updateMutation.mutate({ id, stage })}
                        onDelete={id => deleteMutation.mutate(id)}
                        pendingStage={pendingMap[contact.id] ?? null}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          {/* ── Legend ── */}
          <div style={{ marginTop: 16, display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { icon: <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#8e84f7", display: "inline-block", boxShadow: "0 0 6px #8e84f780" }} />, label: "Current stage" },
              { icon: <CheckCircle2 size={12} style={{ color: "#4ade80" }} />, label: "Completed" },
              { icon: <Circle size={12} style={{ color: "rgba(255,255,255,0.15)" }} />, label: "Not yet reached" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                {item.icon} {item.label}
              </div>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              Click any stage cell to move a contact to that stage
            </span>
          </div>

        </div>
      </div>

      <style>{`
        .crm-row:hover { background: rgba(255,255,255,0.02); }
        .crm-row td { vertical-align: middle; }
      `}</style>
    </AppLayout>
  );
}
