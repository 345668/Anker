import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Search, Download, Trash2, Edit3,
  X, Save, ChevronDown, ChevronUp, Loader2, RefreshCw, Building2,
  Users, Filter, Eye, EyeOff, AlertCircle, XCircle, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";

// ── Issue badge config ────────────────────────────────────────────────────────

const ISSUE_META: Record<string, { label: string; color: string; icon: typeof AlertCircle }> = {
  MISSING_NAME:   { label: "No name",         color: "#f87171", icon: XCircle },
  BAD_NAME_CHARS: { label: "Bad name chars",  color: "#fb923c", icon: AlertCircle },
  MISSING_EMAIL:  { label: "No email",        color: "#facc15", icon: Info },
  DUPLICATE_NAME: { label: "Duplicate",       color: "#c084fc", icon: AlertCircle },
};

function getIssueMeta(issue: string) {
  if (ISSUE_META[issue]) return ISSUE_META[issue];
  if (issue.startsWith("BAD_URL:")) {
    const field = issue.replace("BAD_URL:", "");
    return { label: `Bad URL: ${field}`, color: "#fb923c", icon: AlertCircle };
  }
  return { label: issue, color: "#94a3b8", icon: Info };
}

function IssueBadge({ issue }: { issue: string }) {
  const meta = getIssueMeta(issue);
  const Icon = meta.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
      borderRadius: 6, fontSize: 10, fontWeight: 500,
      background: `${meta.color}18`, color: meta.color,
      border: `1px solid ${meta.color}40`,
    }}>
      <Icon size={9} /> {meta.label}
    </span>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────

type EditState = Record<string, string>;

function EditRow({
  record, fields, onSave, onDelete, saving, deleting, type,
}: {
  record: any;
  fields: { key: string; label: string; wide?: boolean }[];
  onSave: (id: string, data: EditState) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
  type: "firm" | "investor";
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>({});
  const [confirmDel, setConfirmDel] = useState(false);

  const hasIssues = record._issues?.length > 0;

  function startEdit() {
    const init: EditState = {};
    for (const f of fields) init[f.key] = record[f.key] ?? "";
    setForm(init);
    setEditing(true);
  }

  const name = type === "investor"
    ? [record.firstName, record.lastName].filter(Boolean).join(" ") || "—"
    : record.name || "—";

  return (
    <>
      <tr
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: hasIssues ? "rgba(251,146,60,0.03)" : "transparent",
        }}
        data-testid={`row-${type}-${record.id}`}
      >
        {/* Name + ID */}
        <td style={{ padding: "10px 16px", minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: hasIssues ? "#fb923c" : "#fff" }}>
            {name}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
            {record.id}
          </div>
        </td>

        {/* Issues */}
        <td style={{ padding: "10px 16px", minWidth: 200 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {hasIssues
              ? record._issues.map((iss: string) => <IssueBadge key={iss} issue={iss} />)
              : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={11} style={{ color: "#4ade80" }} /> Clean
                </span>
            }
          </div>
        </td>

        {/* Key fields preview */}
        <td style={{ padding: "10px 16px", minWidth: 180 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {type === "firm" ? (record.website || record.type || "—") : (record.email || record.title || "—")}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            {type === "firm" ? (record.location || "") : (record.firm || record.company || "")}
          </div>
        </td>

        {/* Actions */}
        <td style={{ padding: "10px 16px", textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={startEdit}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                borderRadius: 8, background: "rgba(142,132,247,0.12)", border: "1px solid rgba(142,132,247,0.25)",
                color: "rgb(142,132,247)", fontSize: 11, cursor: "pointer",
              }}
              data-testid={`button-edit-${record.id}`}
            >
              <Edit3 size={11} /> Edit
            </button>
            {!confirmDel ? (
              <button
                onClick={() => setConfirmDel(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                  borderRadius: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
                  color: "#f87171", fontSize: 11, cursor: "pointer",
                }}
                data-testid={`button-delete-${record.id}`}
              >
                <Trash2 size={11} /> Delete
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => onDelete(record.id)}
                  disabled={deleting}
                  style={{ padding: "5px 10px", borderRadius: 8, background: "#f87171", color: "#fff", fontSize: 11, cursor: "pointer", border: "none" }}
                  data-testid={`button-confirm-delete-${record.id}`}
                >
                  {deleting ? <Loader2 size={10} className="animate-spin" /> : "Confirm"}
                </button>
                <button onClick={() => setConfirmDel(false)} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", border: "none" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>

      {/* Inline edit row */}
      {editing && (
        <tr style={{ background: "rgba(142,132,247,0.06)", borderBottom: "1px solid rgba(142,132,247,0.15)" }}>
          <td colSpan={4} style={{ padding: "16px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
              {fields.map(f => (
                <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</label>
                  <input
                    value={form[f.key] || ""}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    data-testid={`input-edit-${f.key}-${record.id}`}
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 12, outline: "none",
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { onSave(record.id, form); setEditing(false); }}
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, background: "rgb(142,132,247)", color: "#fff", fontSize: 12, cursor: "pointer", border: "none", fontWeight: 500 }}
                data-testid={`button-save-${record.id}`}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{ padding: "7px 16px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Issue summary bar ─────────────────────────────────────────────────────────

function IssueSummary({ records, type }: { records: any[]; type: string }) {
  const counts: Record<string, number> = {};
  for (const r of records) for (const iss of (r._issues || [])) {
    const key = iss.startsWith("BAD_URL:") ? "BAD_URL" : iss;
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = records.filter(r => r._issues?.length > 0).length;
  const clean = records.length - total;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
      <div style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", display: "flex", gap: 6, alignItems: "center" }}>
        <CheckCircle2 size={13} style={{ color: "#4ade80" }} />
        <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}>{clean.toLocaleString()} clean</span>
      </div>
      {total > 0 && <div style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", display: "flex", gap: 6, alignItems: "center" }}>
        <AlertTriangle size={13} style={{ color: "#fb923c" }} />
        <span style={{ fontSize: 12, color: "#fb923c", fontWeight: 500 }}>{total.toLocaleString()} with issues</span>
      </div>}
      {Object.entries(counts).map(([key, count]) => {
        const meta = getIssueMeta(key);
        return (
          <div key={key} style={{ padding: "8px 14px", borderRadius: 10, background: `${meta.color}10`, border: `1px solid ${meta.color}30`, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: meta.color, fontWeight: 500 }}>{count} {meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Firms tab ─────────────────────────────────────────────────────────────────

const FIRM_FIELDS = [
  { key: "name",               label: "Name" },
  { key: "type",               label: "Type" },
  { key: "firmClassification", label: "Classification" },
  { key: "website",            label: "Website URL" },
  { key: "linkedinUrl",        label: "LinkedIn URL" },
  { key: "twitterUrl",         label: "Twitter URL" },
  { key: "location",           label: "Location" },
  { key: "description",        label: "Description" },
  { key: "aum",                label: "AUM" },
  { key: "email",              label: "Email" },
];

function FirmsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [dSearch, setDSearch] = useState("");
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  const [pendingDel, setPendingDel] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: any[]; total: number; scanned: number }>({
    queryKey: ["/api/admin/cleanup/firms", dSearch, issuesOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (dSearch) params.set("search", dSearch);
      if (issuesOnly) params.set("issuesOnly", "true");
      const res = await fetch(`/api/admin/cleanup/firms?${params}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditState }) =>
      apiRequest("PATCH", `/api/admin/cleanup/firms/${id}`, data).then(r => r.json()),
    onMutate: ({ id }) => setPendingEdit(id),
    onSettled: () => setPendingEdit(null),
    onSuccess: () => { refetch(); toast({ title: "Firm updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/cleanup/firms/${id}`),
    onMutate: (id) => setPendingDel(id),
    onSettled: () => setPendingDel(null),
    onSuccess: () => { refetch(); toast({ title: "Firm deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const records = data?.data ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r => (r.name || "").toLowerCase().includes(q));
  }, [records, search]);

  async function downloadCSV() {
    const res = await fetch("/api/admin/cleanup/firms/export", { credentials: "include" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `investment_firms_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", flex: "1 1 200px" }}>
          <Search size={13} style={{ color: "rgba(255,255,255,0.3)" }} />
          <input value={search} onChange={e => { setSearch(e.target.value); if (!e.target.value) setDSearch(""); }}
            onKeyDown={e => e.key === "Enter" && setDSearch(search)}
            placeholder="Search firms…" data-testid="input-search-firms"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
          {search && <button onClick={() => { setSearch(""); setDSearch(""); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={12} style={{ color: "rgba(255,255,255,0.3)" }} /></button>}
        </div>
        <button
          onClick={() => setIssuesOnly(!issuesOnly)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12,
            background: issuesOnly ? "rgba(251,146,60,0.15)" : "rgba(255,255,255,0.04)",
            border: issuesOnly ? "1px solid rgba(251,146,60,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: issuesOnly ? "#fb923c" : "rgba(255,255,255,0.5)" }}
          data-testid="button-toggle-issues-firms"
        >
          <Filter size={12} /> {issuesOnly ? "Issues only" : "Show all"}
        </button>
        <button onClick={() => refetch()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }} data-testid="button-refresh-firms">
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
        </button>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
          {filtered.length.toLocaleString()} / {data?.scanned?.toLocaleString() ?? "…"} firms
        </span>
        <button
          onClick={downloadCSV}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12, background: "rgba(196,227,230,0.1)", border: "1px solid rgba(196,227,230,0.3)", color: "rgb(196,227,230)" }}
          data-testid="button-export-firms"
        >
          <Download size={12} /> Export all CSV
        </button>
      </div>

      {records.length > 0 && <IssueSummary records={records} type="firms" />}

      {isLoading ? (
        <div style={{ padding: 48, textAlign: "center" }}><Loader2 className="animate-spin" size={24} style={{ color: "#8e84f7", margin: "0 auto" }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No firms match your filters.</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Firm", "Issues", "Details", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: h === "Actions" ? "right" : "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => (
                <EditRow
                  key={record.id}
                  record={record}
                  fields={FIRM_FIELDS}
                  type="firm"
                  saving={pendingEdit === record.id}
                  deleting={pendingDel === record.id}
                  onSave={(id, data) => updateMutation.mutate({ id, data })}
                  onDelete={id => deleteMutation.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Investors tab ─────────────────────────────────────────────────────────────

const INVESTOR_FIELDS = [
  { key: "firstName",   label: "First Name" },
  { key: "lastName",    label: "Last Name" },
  { key: "title",       label: "Title" },
  { key: "email",       label: "Email" },
  { key: "firm",        label: "Firm" },
  { key: "location",    label: "Location" },
  { key: "linkedinUrl", label: "LinkedIn URL" },
  { key: "twitterUrl",  label: "Twitter URL" },
  { key: "website",     label: "Website URL" },
  { key: "fundingStage",label: "Stage" },
  { key: "bio",         label: "Bio" },
];

function InvestorsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [dSearch, setDSearch] = useState("");
  const [pendingEdit, setPendingEdit] = useState<string | null>(null);
  const [pendingDel, setPendingDel] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ data: any[]; total: number; scanned: number }>({
    queryKey: ["/api/admin/cleanup/investors", dSearch, issuesOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (dSearch) params.set("search", dSearch);
      if (issuesOnly) params.set("issuesOnly", "true");
      const res = await fetch(`/api/admin/cleanup/investors?${params}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditState }) =>
      apiRequest("PATCH", `/api/admin/cleanup/investors/${id}`, data).then(r => r.json()),
    onMutate: ({ id }) => setPendingEdit(id),
    onSettled: () => setPendingEdit(null),
    onSuccess: () => { refetch(); toast({ title: "Investor updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/cleanup/investors/${id}`),
    onMutate: (id) => setPendingDel(id),
    onSettled: () => setPendingDel(null),
    onSuccess: () => { refetch(); toast({ title: "Investor deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const records = data?.data ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      [r.firstName, r.lastName, r.email, r.firm].some(v => v?.toLowerCase().includes(q))
    );
  }, [records, search]);

  async function downloadCSV() {
    const res = await fetch("/api/admin/cleanup/investors/export", { credentials: "include" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `investors_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", flex: "1 1 200px" }}>
          <Search size={13} style={{ color: "rgba(255,255,255,0.3)" }} />
          <input value={search} onChange={e => { setSearch(e.target.value); if (!e.target.value) setDSearch(""); }}
            onKeyDown={e => e.key === "Enter" && setDSearch(search)}
            placeholder="Search investors…" data-testid="input-search-investors"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13 }} />
          {search && <button onClick={() => { setSearch(""); setDSearch(""); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={12} style={{ color: "rgba(255,255,255,0.3)" }} /></button>}
        </div>
        <button
          onClick={() => setIssuesOnly(!issuesOnly)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12,
            background: issuesOnly ? "rgba(251,146,60,0.15)" : "rgba(255,255,255,0.04)",
            border: issuesOnly ? "1px solid rgba(251,146,60,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: issuesOnly ? "#fb923c" : "rgba(255,255,255,0.5)" }}
          data-testid="button-toggle-issues-investors"
        >
          <Filter size={12} /> {issuesOnly ? "Issues only" : "Show all"}
        </button>
        <button onClick={() => refetch()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontSize: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }} data-testid="button-refresh-investors">
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
        </button>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>
          {filtered.length.toLocaleString()} / {data?.scanned?.toLocaleString() ?? "…"} investors
        </span>
        <button
          onClick={downloadCSV}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 12, background: "rgba(142,132,247,0.1)", border: "1px solid rgba(142,132,247,0.3)", color: "rgb(142,132,247)" }}
          data-testid="button-export-investors"
        >
          <Download size={12} /> Export all CSV
        </button>
      </div>

      {records.length > 0 && <IssueSummary records={records} type="investors" />}

      {isLoading ? (
        <div style={{ padding: 48, textAlign: "center" }}><Loader2 className="animate-spin" size={24} style={{ color: "#8e84f7", margin: "0 auto" }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No investors match your filters.</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Investor", "Issues", "Details", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: h === "Actions" ? "right" : "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => (
                <EditRow
                  key={record.id}
                  record={record}
                  fields={INVESTOR_FIELDS}
                  type="investor"
                  saving={pendingEdit === record.id}
                  deleting={pendingDel === record.id}
                  onSave={(id, data) => updateMutation.mutate({ id, data })}
                  onDelete={id => deleteMutation.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DataCleanup() {
  const [tab, setTab] = useState<"firms" | "investors">("firms");

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ padding: 10, borderRadius: 12, background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)" }}>
              <AlertTriangle size={20} style={{ color: "#fb923c" }} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Data Cleanup</h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                Detect and fix data quality issues across investment firms and investors
              </p>
            </div>
          </div>

          {/* Issue legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginRight: 4 }}>Detected issues:</span>
            {Object.entries(ISSUE_META).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <span key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: meta.color, padding: "2px 8px", borderRadius: 6, background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}>
                  <Icon size={9} /> {meta.label}
                </span>
              );
            })}
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#fb923c", padding: "2px 8px", borderRadius: 6, background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)" }}>
              <AlertCircle size={9} /> Bad URL fields
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4, width: "fit-content", border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["firms", "investors"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-testid={`tab-${t}`}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 20px",
                borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 500, border: "none",
                background: tab === t ? "rgba(142,132,247,0.2)" : "transparent",
                color: tab === t ? "rgb(142,132,247)" : "rgba(255,255,255,0.4)",
                transition: "all 0.15s",
              }}
            >
              {t === "firms" ? <Building2 size={14} /> : <Users size={14} />}
              {t === "firms" ? "Investment Firms" : "Investors"}
            </button>
          ))}
        </div>

        {tab === "firms" ? <FirmsTab /> : <InvestorsTab />}
      </div>
    </AdminLayout>
  );
}
