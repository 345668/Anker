/**
 * client/src/pages/app/InvestorDatabase.tsx
 *
 * Unified Investor Database hub.
 * Tabs: Firms (investment firms) | Contacts (individual investors)
 *
 * ROUTE: /app/investor-db
 * Deep-link: ?tab=firms|contacts
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Building2, Users, MapPin, Globe, Linkedin, Sparkles, ChevronLeft, ChevronRight,
  UserPlus, X, Loader2, CheckCircle, XCircle, AlertCircle, Clock, CheckCircle2,
  Pencil, Trash2, Plus, ShieldCheck, Save, Ban,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { UrlHealthButton } from "@/components/UrlHealthButton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FIRM_CLASSIFICATIONS } from "@shared/schema";
import type { BatchEnrichmentJob } from "@shared/schema";

type Tab = "firms" | "contacts";

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: "firms",    label: "Investment Firms", icon: "🏦", desc: "Fund-level records, AUM & thesis" },
  { id: "contacts", label: "Contacts",         icon: "👤", desc: "Individual investors & Folk CRM sync" },
];

const PAGE_SIZE = 24;

const STAGES = [
  "All Stages", "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Growth", "Bridge",
];

const SECTORS = [
  "All Sectors",
  "SaaS", "FinTech", "HealthTech", "AI/ML", "Consumer", "Enterprise",
  "CleanTech", "Crypto / Web3", "DeepTech", "E-commerce", "EdTech", "Cybersecurity",
  "Film / Media", "Real Estate", "Energy & Infrastructure",
  "BioTech", "SpaceTech", "AgriTech", "PropTech", "InsurTech", "LegalTech",
  "FoodTech", "Mobility", "Gaming", "Social Impact",
];

const FIRM_TABS = ["All", ...FIRM_CLASSIFICATIONS, "Unclassified"] as const;

const GEO_GROUPS = [
  { group: "", presets: [{ label: "All Regions", value: "" }] },
  { group: "North America", presets: [
    { label: "🇺🇸 USA", value: "United States" },
    { label: "🇨🇦 Canada", value: "Canada" },
  ]},
  { group: "South America", presets: [
    { label: "🇧🇷 Brazil", value: "Brazil" },
    { label: "🌎 LatAm", value: "Latin America" },
  ]},
  { group: "Europe", presets: [
    { label: "🇬🇧 UK", value: "United Kingdom" },
    { label: "🇩🇪 Germany", value: "Germany" },
    { label: "🇫🇷 France", value: "France" },
    { label: "🇳🇱 Netherlands", value: "Netherlands" },
    { label: "🇧🇪 Belgium", value: "Belgium" },
    { label: "🇨🇭 Switzerland", value: "Switzerland" },
    { label: "🇸🇪 Sweden", value: "Sweden" },
    { label: "🇩🇰 Denmark", value: "Denmark" },
    { label: "🇳🇴 Norway", value: "Norway" },
    { label: "🇫🇮 Finland", value: "Finland" },
    { label: "🇮🇪 Ireland", value: "Ireland" },
    { label: "🇦🇹 Austria", value: "Austria" },
    { label: "🇱🇺 Luxembourg", value: "Luxembourg" },
    { label: "🇪🇸 Spain", value: "Spain" },
    { label: "🇮🇹 Italy", value: "Italy" },
    { label: "🇵🇹 Portugal", value: "Portugal" },
    { label: "🇬🇷 Greece", value: "Greece" },
    { label: "🇵🇱 Poland", value: "Poland" },
    { label: "🇨🇿 Czech Republic", value: "Czech Republic" },
    { label: "🇸🇰 Slovakia", value: "Slovakia" },
    { label: "🇭🇺 Hungary", value: "Hungary" },
    { label: "🇷🇴 Romania", value: "Romania" },
    { label: "🇧🇬 Bulgaria", value: "Bulgaria" },
    { label: "🇭🇷 Croatia", value: "Croatia" },
    { label: "🇸🇮 Slovenia", value: "Slovenia" },
    { label: "🇪🇪 Estonia", value: "Estonia" },
    { label: "🇱🇻 Latvia", value: "Latvia" },
    { label: "🇱🇹 Lithuania", value: "Lithuania" },
    { label: "🇲🇹 Malta", value: "Malta" },
    { label: "🇨🇾 Cyprus", value: "Cyprus" },
  ]},
  { group: "MENA", presets: [
    { label: "🇮🇱 Israel", value: "Israel" },
    { label: "🇦🇪 UAE", value: "UAE" },
    { label: "🇸🇦 Saudi Arabia", value: "Saudi Arabia" },
    { label: "🇶🇦 Qatar", value: "Qatar" },
    { label: "🇰🇼 Kuwait", value: "Kuwait" },
    { label: "🇧🇭 Bahrain", value: "Bahrain" },
    { label: "🇴🇲 Oman", value: "Oman" },
    { label: "🇯🇴 Jordan", value: "Jordan" },
    { label: "🇱🇧 Lebanon", value: "Lebanon" },
    { label: "🇪🇬 Egypt", value: "Egypt" },
    { label: "🇲🇦 Morocco", value: "Morocco" },
    { label: "🇹🇳 Tunisia", value: "Tunisia" },
    { label: "🇩🇿 Algeria", value: "Algeria" },
    { label: "🇹🇷 Turkey", value: "Turkey" },
  ]},
  { group: "Asia Pacific", presets: [
    { label: "🇸🇬 Singapore", value: "Singapore" },
    { label: "🇯🇵 Japan", value: "Japan" },
    { label: "🇨🇳 China", value: "China" },
    { label: "🇮🇳 India", value: "India" },
    { label: "🇰🇷 South Korea", value: "South Korea" },
    { label: "🇦🇺 Australia", value: "Australia" },
    { label: "🇭🇰 Hong Kong", value: "Hong Kong" },
    { label: "🇸🇬 Asia", value: "Asia" },
  ]},
  { group: "Central Asia", presets: [
    { label: "🇰🇿 Kazakhstan", value: "Kazakhstan" },
    { label: "🇺🇿 Uzbekistan", value: "Uzbekistan" },
    { label: "🇰🇬 Kyrgyzstan", value: "Kyrgyzstan" },
    { label: "🇹🇯 Tajikistan", value: "Tajikistan" },
    { label: "🇹🇲 Turkmenistan", value: "Turkmenistan" },
  ]},
];

const GEO_PRESETS = GEO_GROUPS.flatMap(g => g.presets);

// ─── Firms Tab ────────────────────────────────────────────────────────────────

function FirmsTab() {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("All");
  const [geoFilter, setGeoFilter] = useState("");
  const [sector, setSector] = useState("All Sectors");
  const [stage, setStage] = useState("All Stages");
  const [page, setPage] = useState(1);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const dSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [dSearch, classification, geoFilter, sector, stage]);

  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/firms", { search: dSearch, classification, geoFilter, sector, stage, page }],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String((page - 1) * PAGE_SIZE));
      if (dSearch.trim()) p.set("search", dSearch.trim());
      if (classification && classification !== "All") p.set("classification", classification);
      if (geoFilter.trim()) p.set("location", geoFilter.trim());
      if (sector && sector !== "All Sectors") p.set("sector", sector);
      if (stage && stage !== "All Stages") p.set("stage", stage);
      const res = await fetch(`/api/firms?${p}`);
      if (!res.ok) throw new Error("Failed to fetch firms");
      return res.json();
    },
  });

  const { data: breakdown } = useQuery<{
    stages: [string, number][]; sectors: [string, number][]; locations: [string, number][];
    total: number; withStages: number; withSectors: number;
  }>({
    queryKey: ["/api/firms/breakdown"],
    staleTime: 60000,
    enabled: !!user?.isAdmin,
  });

  const { data: classificationCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/firms/counts"],
    queryFn: async () => {
      const res = await fetch("/api/firms/counts");
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: enrichmentStats } = useQuery<{
    enriched: number; partiallyEnriched: number; failed: number; notEnriched: number; missingData: number; total: number;
  }>({
    queryKey: ["/api/firms/enrichment-stats"],
    queryFn: async () => {
      const res = await fetch("/api/firms/enrichment-stats");
      if (!res.ok) throw new Error("Failed to fetch enrichment stats");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!user?.isAdmin,
  });

  const { data: currentJob } = useQuery<BatchEnrichmentJob>({
    queryKey: ["/api/admin/enrichment/batch", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (currentJob && (currentJob.status === "completed" || currentJob.status === "failed" || currentJob.status === "cancelled")) {
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      toast({
        title: currentJob.status === "completed" ? "Deep Research Complete" : "Research Stopped",
        description: `Processed ${currentJob.processedRecords} of ${currentJob.totalRecords} firms`,
      });
    }
  }, [currentJob?.status]);

  const startEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/enrichment/batch/start", {
        batchSize: 10, onlyMissingData: true, onlyUnclassified: false, enrichmentType: "full_enrichment",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.id);
      toast({ title: "Deep Research Started", description: `Enriching ${data.totalRecords} firms…` });
    },
    onError: (err: any) => toast({ title: "Failed to start research", description: err.message, variant: "destructive" }),
  });

  const cancelEnrichmentMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/enrichment/batch/${jobId}/cancel`);
      return res.json();
    },
    onSuccess: () => toast({ title: "Research cancelled" }),
  });

  const enrichMutation = useMutation({
    mutationFn: (firmId: string) => apiRequest("POST", `/api/firms/${firmId}/enrich`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      toast({ title: "Enrichment queued" });
    },
    onError: () => toast({ title: "Enrichment failed", variant: "destructive" }),
  });

  const addCRMMutation = useMutation({
    mutationFn: (firmId: string) => apiRequest("POST", `/api/folk/firms/${firmId}`),
    onSuccess: () => toast({ title: "Added to Folk CRM" }),
    onError: () => toast({ title: "CRM import failed", variant: "destructive" }),
  });

  const bulkCRMMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/contacts/bulk-from-firms", {
      search: dSearch.trim() || undefined,
      classification: classification !== "All" ? classification : undefined,
      location: geoFilter.trim() || undefined,
      sector: sector !== "All Sectors" ? sector : undefined,
      stage: stage !== "All Stages" ? stage : undefined,
    }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: `Added ${data.created} firm${data.created !== 1 ? "s" : ""} to CRM`, description: data.skipped > 0 ? `${data.skipped} already existed` : undefined });
    },
    onError: () => toast({ title: "Bulk CRM import failed", variant: "destructive" }),
  });

  const firms = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = classification !== "All" || search || !!geoFilter || sector !== "All Sectors" || stage !== "All Stages";

  function clearAllFilters() {
    setSearch(""); setClassification("All"); setGeoFilter(""); setSector("All Sectors"); setStage("All Stages"); setPage(1);
  }

  // ── Admin CRUD state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const FIRM_EDIT_FIELDS = [
    { key: "name",            label: "Name *",                 wide: true  },
    { key: "website",         label: "Website",                wide: false },
    { key: "hqLocation",      label: "HQ Location",            wide: false },
    { key: "type",            label: "Firm Type",              wide: false },
    { key: "firmClassification", label: "Classification",      wide: false },
    { key: "typicalCheckSize",   label: "Typical Check Size",  wide: false },
    { key: "aum",             label: "AUM",                    wide: false },
    { key: "foundationYear",  label: "Founded Year",           wide: false },
    { key: "portfolioCount",  label: "Portfolio Count",        wide: false },
    { key: "linkedinUrl",     label: "LinkedIn URL",           wide: true  },
    { key: "description",     label: "Investment Thesis / Description", wide: true, textarea: true },
    { key: "stages",          label: "Stages (comma-separated)",       wide: true  },
    { key: "sectors",         label: "Sectors (comma-separated)",      wide: true  },
  ];

  const updateFirmMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiRequest("PATCH", `/api/firms/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      setEditingId(null);
      toast({ title: "Firm updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteFirmMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/firms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      setConfirmDeleteId(null);
      toast({ title: "Firm deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const createFirmMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("POST", "/api/firms", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      setShowAddModal(false);
      setAddForm({});
      toast({ title: "Firm created" });
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  function startEditFirm(firm: any) {
    const init: Record<string, string> = {};
    for (const f of FIRM_EDIT_FIELDS) {
      const v = firm[f.key];
      init[f.key] = Array.isArray(v) ? v.join(", ") : (v ?? "");
    }
    setEditForm(init);
    setEditingId(firm.id);
  }

  function saveFirm() {
    if (!editingId) return;
    const data: Record<string, any> = { ...editForm };
    if (typeof data.stages === "string") data.stages = data.stages.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (typeof data.sectors === "string") data.sectors = data.sectors.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (data.portfolioCount) data.portfolioCount = parseInt(data.portfolioCount) || null;
    updateFirmMutation.mutate({ id: editingId, data });
  }

  function submitAddFirm() {
    const data: Record<string, any> = { ...addForm };
    if (!data.name?.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (typeof data.stages === "string") data.stages = data.stages.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (typeof data.sectors === "string") data.sectors = data.sectors.split(",").map((s: string) => s.trim()).filter(Boolean);
    createFirmMutation.mutate(data);
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="idb-toolbar">
        <div className="idb-search">
          <Search size={14} className="idb-search__icon" />
          <input
            className="idb-search__input"
            placeholder="Search firms by name, location, thesis…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-search-firms"
          />
          {search && (
            <button onClick={() => setSearch("")} className="idb-search__clear">
              <X size={12} />
            </button>
          )}
        </div>
        <span className="idb-count">{total.toLocaleString()} firms</span>
        <button
          className="idb-action-btn"
          onClick={() => bulkCRMMutation.mutate()}
          disabled={bulkCRMMutation.isPending || total === 0}
          data-testid="button-bulk-crm-firms"
          title={`Add all ${total.toLocaleString()} matching firms to your CRM`}
          style={{ background: "rgba(196,227,230,0.12)", color: "rgb(196,227,230)", border: "1px solid rgba(196,227,230,0.25)" }}
        >
          {bulkCRMMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
          Add all to CRM{total > 0 ? ` (${total.toLocaleString()})` : ""}
        </button>
        {user?.isAdmin && (enrichmentStats?.missingData ?? 0) > 0 && (
          <button
            className="idb-action-btn idb-action-btn--enrich"
            onClick={() => startEnrichmentMutation.mutate()}
            disabled={startEnrichmentMutation.isPending || !!activeJobId}
            data-testid="button-deep-research-firms"
          >
            {startEnrichmentMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Deep Research ({enrichmentStats?.missingData ?? 0})
          </button>
        )}
        {user?.isAdmin && <UrlHealthButton entityScope="investmentFirms" />}
      </div>

      {/* ── Admin control bar ── */}
      {user?.isAdmin && (
        <div className="idb-admin-bar">
          <div className="idb-admin-bar__left">
            <ShieldCheck size={13} style={{ color: "#c8aa82" }} />
            <span className="idb-admin-bar__label">Admin Mode</span>
            <span className="idb-admin-bar__hint">Edit · Delete · Add records directly from this view</span>
          </div>
          <div className="idb-admin-bar__right">
            <button
              className="idb-admin-btn idb-admin-btn--add"
              onClick={() => { setAddForm({}); setShowAddModal(true); }}
              data-testid="button-add-firm"
            >
              <Plus size={13} /> Add Firm
            </button>
            <a href="/admin/data-cleanup" className="idb-admin-btn idb-admin-btn--clean" data-testid="button-data-cleaning">
              <ShieldCheck size={13} /> Data Cleaning
            </a>
          </div>
        </div>
      )}

      {/* ── Admin: enrichment in progress ── */}
      {user?.isAdmin && currentJob && (currentJob.status === "pending" || currentJob.status === "processing") && (
        <div className="idb-job-banner">
          <div className="idb-job-banner__row">
            <div className="idb-job-banner__info">
              <Sparkles size={14} className="idb-job-banner__icon" />
              <div>
                <p className="idb-job-banner__title">Deep Research in Progress</p>
                <p className="idb-job-banner__sub">{currentJob.processedRecords}/{currentJob.totalRecords} firms enriched</p>
              </div>
            </div>
            <button
              className="idb-job-banner__cancel"
              onClick={() => cancelEnrichmentMutation.mutate(currentJob.id)}
              disabled={cancelEnrichmentMutation.isPending}
            >
              <X size={13} /> Cancel
            </button>
          </div>
          <div className="idb-progress-track">
            <div className="idb-progress-fill" style={{ width: `${((currentJob.processedRecords || 0) / (currentJob.totalRecords || 1)) * 100}%` }} />
          </div>
          <div className="idb-job-banner__counts">
            <span style={{ color: "#4ade80" }}>{currentJob.successfulRecords || 0} enriched</span>
            {(currentJob.failedRecords || 0) > 0 && <span style={{ color: "#f87171" }}>{currentJob.failedRecords} errors</span>}
          </div>
        </div>
      )}

      {/* ── Admin: enrichment status tracker ── */}
      {user?.isAdmin && enrichmentStats && (
        <div className="idb-status-tracker">
          <span className="idb-status-tracker__title"><Sparkles size={12} /> Enrichment Status</span>
          <div className="idb-status-chips">
            <div className="idb-status-chip idb-status-chip--green"><CheckCircle size={12} />{enrichmentStats.enriched} Enriched</div>
            <div className="idb-status-chip idb-status-chip--yellow"><AlertCircle size={12} />{enrichmentStats.partiallyEnriched} Partial</div>
            <div className="idb-status-chip idb-status-chip--red"><XCircle size={12} />{enrichmentStats.failed} Failed</div>
            <div className="idb-status-chip"><Clock size={12} />{enrichmentStats.notEnriched} Pending</div>
          </div>
        </div>
      )}

      {/* ── Database breakdown by stage / sector / location ── */}
      {breakdown && (breakdown.withStages > 0 || breakdown.withSectors > 0) && (
        <div style={{
          margin: "10px 0 4px",
          padding: "14px 18px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}>
          {/* Top stages */}
          <div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8, margin: "0 0 8px" }}>
              Top Stages ({breakdown.withStages} firms tagged)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {breakdown.stages.slice(0, 8).map(([s, count]) => (
                <button
                  key={s}
                  onClick={() => { setStage(s); setPage(1); }}
                  style={{
                    padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                    background: stage === s ? "rgba(142,132,247,0.2)" : "rgba(142,132,247,0.06)",
                    border: `1px solid ${stage === s ? "rgba(142,132,247,0.5)" : "rgba(142,132,247,0.15)"}`,
                    color: stage === s ? "rgb(142,132,247)" : "rgba(255,255,255,0.5)",
                  }}
                  data-testid={`button-breakdown-stage-${s}`}
                >
                  {s} <span style={{ opacity: 0.6 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Top sectors */}
          <div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>
              Top Sectors ({breakdown.withSectors} firms tagged)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {breakdown.sectors.slice(0, 10).map(([s, count]) => (
                <button
                  key={s}
                  onClick={() => { setSector(s); setPage(1); }}
                  style={{
                    padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                    background: sector === s ? "rgba(196,227,230,0.2)" : "rgba(196,227,230,0.06)",
                    border: `1px solid ${sector === s ? "rgba(196,227,230,0.5)" : "rgba(196,227,230,0.15)"}`,
                    color: sector === s ? "rgb(196,227,230)" : "rgba(255,255,255,0.5)",
                  }}
                  data-testid={`button-breakdown-sector-${s}`}
                >
                  {s} <span style={{ opacity: 0.6 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Top locations */}
          <div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>
              By Region
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {breakdown.locations.slice(0, 8).map(([loc, count]) => (
                <button
                  key={loc}
                  onClick={() => { setGeoFilter(loc); setPage(1); }}
                  style={{
                    padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                    background: geoFilter === loc ? "rgba(200,170,130,0.2)" : "rgba(200,170,130,0.06)",
                    border: `1px solid ${geoFilter === loc ? "rgba(200,170,130,0.5)" : "rgba(200,170,130,0.15)"}`,
                    color: geoFilter === loc ? "rgb(200,170,130)" : "rgba(255,255,255,0.5)",
                  }}
                  data-testid={`button-breakdown-location-${loc}`}
                >
                  {loc} <span style={{ opacity: 0.6 }}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Classification filter tabs ── */}
      <div className="idb-filter-scroll">
        <div className="idb-filter-tabs">
          {FIRM_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setClassification(tab); setPage(1); }}
              className={`idb-filter-tab ${classification === tab ? "idb-filter-tab--on" : ""}`}
              data-testid={`button-classification-${tab.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {tab}
              {classificationCounts?.[tab] !== undefined && (
                <span className="idb-filter-tab__count">{classificationCounts[tab]?.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stage filter pills ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label">Stage</span>
        <div className="idb-filter-pills">
          {STAGES.map(s => {
            const bkCount = breakdown?.stages.find(([k]) => k === s)?.[1];
            return (
              <button
                key={s}
                onClick={() => { setStage(s); setPage(1); }}
                className={`idb-pill ${stage === s ? "idb-pill--on" : ""}`}
                data-testid={`button-firm-stage-${s.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {s}
                {bkCount !== undefined && s !== "All Stages" && (
                  <span className="idb-pill__count">{bkCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sector filter pills ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label">Sector</span>
        <div className="idb-filter-pills">
          {SECTORS.map(sec => {
            const bkCount = breakdown?.sectors.find(([k]) => k === sec)?.[1];
            return (
              <button
                key={sec}
                onClick={() => { setSector(sec); setPage(1); }}
                className={`idb-pill idb-pill--sm ${sector === sec ? "idb-pill--on" : ""}`}
                data-testid={`button-firm-sector-${sec.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {sec}
                {bkCount !== undefined && sec !== "All Sectors" && (
                  <span className="idb-pill__count">{bkCount}</span>
                )}
              </button>
            );
          })}
          {/* Extra sectors from breakdown not in preset list */}
          {breakdown?.sectors
            .filter(([k]) => !SECTORS.includes(k as any) && k !== "All Sectors")
            .slice(0, 6)
            .map(([k, count]) => (
              <button
                key={k}
                onClick={() => { setSector(k); setPage(1); }}
                className={`idb-pill idb-pill--sm ${sector === k ? "idb-pill--on" : ""}`}
                data-testid={`button-firm-sector-${k.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {k} <span className="idb-pill__count">{count}</span>
              </button>
            ))}
        </div>
      </div>

      {/* ── Geography filter ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label"><MapPin size={12} /> Region</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GEO_GROUPS.map(({ group, presets }) => (
            <div key={group || "__all__"} style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              {group && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4, minWidth: 80, flexShrink: 0 }}>
                  {group}
                </span>
              )}
              {presets.map(g => {
                const bkCount = breakdown?.locations.find(([k]) => k === g.value)?.[1];
                return (
                  <button
                    key={`${group}-${g.value}`}
                    onClick={() => { setGeoFilter(g.value); setPage(1); }}
                    className={`idb-pill idb-pill--sm ${geoFilter === g.value ? "idb-pill--on" : ""}`}
                    data-testid={`button-geo-firm-${g.value || "all"}`}
                  >
                    {g.label}
                    {bkCount !== undefined && g.value && (
                      <span className="idb-pill__count">{bkCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Active filters ── */}
      {hasActiveFilters && (
        <div className="idb-active-filters">
          <span className="idb-active-filters__label">Active filters:</span>
          {classification !== "All" && (
            <span className="idb-active-filter-chip">
              {classification}
              <button onClick={() => setClassification("All")}><X size={11} /></button>
            </span>
          )}
          {stage !== "All Stages" && (
            <span className="idb-active-filter-chip">
              Stage: {stage}
              <button onClick={() => setStage("All Stages")}><X size={11} /></button>
            </span>
          )}
          {sector !== "All Sectors" && (
            <span className="idb-active-filter-chip">
              Sector: {sector}
              <button onClick={() => setSector("All Sectors")}><X size={11} /></button>
            </span>
          )}
          {geoFilter && (
            <span className="idb-active-filter-chip">
              <MapPin size={10} /> {GEO_PRESETS.find(g => g.value === geoFilter)?.label ?? geoFilter}
              <button onClick={() => setGeoFilter("")}><X size={11} /></button>
            </span>
          )}
          {search && (
            <span className="idb-active-filter-chip idb-active-filter-chip--search">
              Search: "{search}"
              <button onClick={() => setSearch("")}><X size={11} /></button>
            </span>
          )}
          <button className="idb-clear-all" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Summary bar ── */}
      <div className="idb-summary-bar">
        <span className="idb-summary-bar__count">{total.toLocaleString()} Total Firms</span>
        {isLoading && <Loader2 size={13} className="animate-spin" style={{ color: "#8e84f7" }} />}
        {pages > 1 && (
          <div className="idb-summary-bar__pages">
            <button className="idb-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className="idb-page-info">Page {page} of {pages}</span>
            <button className="idb-page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="idb-loading">Loading firms…</div>
      ) : firms.length === 0 ? (
        <div className="idb-empty">No firms found matching your filters.</div>
      ) : (
        <div className="idb-grid">
          {firms.map((firm: any) => (
            <div key={firm.id} className="idb-card">
              <div className="idb-card__header">
                <div className="idb-card__avatar idb-card__avatar--firm">
                  <Building2 size={16} />
                </div>
                <div className="idb-card__info">
                  <Link href={`/app/firms/${firm.id}`}>
                    <a className="idb-card__name">{firm.name}</a>
                  </Link>
                  {firm.firmType && <span className="idb-card__type">{firm.firmType}</span>}
                  {firm.firmClassification && firm.firmClassification !== firm.firmType && (
                    <span className="idb-tag idb-tag--small" style={{ display: "inline-block", marginTop: 2 }}>{firm.firmClassification}</span>
                  )}
                </div>
              </div>
              {firm.hqLocation && (
                <div className="idb-card__meta"><MapPin size={11} />{firm.hqLocation}</div>
              )}
              {(firm.investmentThesis || firm.description) && (
                <p className="idb-card__thesis">
                  {(firm.investmentThesis || firm.description || "").slice(0, 110)}
                  {(firm.investmentThesis || firm.description || "").length > 110 ? "…" : ""}
                </p>
              )}
              <div className="idb-card__tags">
                {firm.typicalCheckSize && <span className="idb-tag">{firm.typicalCheckSize}</span>}
                {firm.portfolioCount && <span className="idb-tag">{firm.portfolioCount} investments</span>}
                {firm.website && <Globe size={11} style={{ color: "rgba(255,255,255,.3)", flexShrink: 0 }} />}
                {firm.linkedinUrl && <Linkedin size={11} style={{ color: "rgba(255,255,255,.3)", flexShrink: 0 }} />}
              </div>
              <div className="idb-card__actions">
                <Link href={`/app/firms/${firm.id}`}>
                  <a className="idb-btn idb-btn--ghost">View profile</a>
                </Link>
                <button
                  className="idb-btn idb-btn--crm"
                  onClick={() => addCRMMutation.mutate(firm.id)}
                  disabled={addCRMMutation.isPending}
                  data-testid={`button-crm-firm-${firm.id}`}
                >
                  <UserPlus size={11} /> CRM
                </button>
                {user?.isAdmin && (
                  <button
                    className="idb-btn idb-btn--enrich"
                    onClick={() => enrichMutation.mutate(firm.id)}
                    disabled={enrichMutation.isPending}
                    data-testid={`button-enrich-firm-${firm.id}`}
                  >
                    <Sparkles size={11} /> Enrich
                  </button>
                )}
                {user?.isAdmin && (
                  <>
                    <button
                      className="idb-btn idb-btn--edit"
                      onClick={() => editingId === firm.id ? setEditingId(null) : startEditFirm(firm)}
                      data-testid={`button-edit-firm-${firm.id}`}
                    >
                      <Pencil size={11} /> {editingId === firm.id ? "Cancel" : "Edit"}
                    </button>
                    <button
                      className="idb-btn idb-btn--delete"
                      onClick={() => setConfirmDeleteId(firm.id)}
                      data-testid={`button-delete-firm-${firm.id}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>

              {/* ── Delete confirmation ── */}
              {user?.isAdmin && confirmDeleteId === firm.id && (
                <div className="idb-confirm-delete">
                  <span>Delete <strong>{firm.name}</strong>? This cannot be undone.</span>
                  <button className="idb-confirm-yes" onClick={() => deleteFirmMutation.mutate(firm.id)} disabled={deleteFirmMutation.isPending}>
                    {deleteFirmMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
                  </button>
                  <button className="idb-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                    <Ban size={11} /> Cancel
                  </button>
                </div>
              )}

              {/* ── Inline edit panel ── */}
              {user?.isAdmin && editingId === firm.id && (
                <div className="idb-edit-panel">
                  <div className="idb-edit-grid">
                    {FIRM_EDIT_FIELDS.map(f => (
                      <div key={f.key} className={`idb-edit-field ${f.wide ? "idb-edit-field--wide" : ""}`}>
                        <label className="idb-edit-label">{f.label}</label>
                        {(f as any).textarea ? (
                          <textarea
                            className="idb-edit-input idb-edit-input--ta"
                            value={editForm[f.key] ?? ""}
                            onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))}
                            rows={3}
                          />
                        ) : (
                          <input
                            className="idb-edit-input"
                            value={editForm[f.key] ?? ""}
                            onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="idb-edit-actions">
                    <button className="idb-edit-save" onClick={saveFirm} disabled={updateFirmMutation.isPending}>
                      {updateFirmMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
                    </button>
                    <button className="idb-edit-cancel" onClick={() => setEditingId(null)}>
                      <Ban size={12} /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="idb-pagination">
          <button className="idb-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span className="idb-page-info">Page {page} of {pages}</span>
          <button className="idb-page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── Add Firm Modal ── */}
      {user?.isAdmin && showAddModal && (
        <div className="idb-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="idb-modal" onClick={e => e.stopPropagation()}>
            <div className="idb-modal__header">
              <h3 className="idb-modal__title"><Plus size={16} /> Add New Firm</h3>
              <button className="idb-modal__close" onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <div className="idb-edit-grid">
              {FIRM_EDIT_FIELDS.map(f => (
                <div key={f.key} className={`idb-edit-field ${f.wide ? "idb-edit-field--wide" : ""}`}>
                  <label className="idb-edit-label">{f.label}</label>
                  {(f as any).textarea ? (
                    <textarea
                      className="idb-edit-input idb-edit-input--ta"
                      value={addForm[f.key] ?? ""}
                      onChange={e => setAddForm(v => ({ ...v, [f.key]: e.target.value }))}
                      rows={3}
                    />
                  ) : (
                    <input
                      className="idb-edit-input"
                      value={addForm[f.key] ?? ""}
                      onChange={e => setAddForm(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="idb-modal__footer">
              <button className="idb-modal__cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                className="idb-modal__save"
                onClick={submitAddFirm}
                disabled={createFirmMutation.isPending || !addForm.name?.trim()}
              >
                {createFirmMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create Firm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────────────────────

function ContactsTab() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("All Stages");
  const [sector, setSector] = useState("All Sectors");
  const [geoFilter, setGeoFilter] = useState("");
  const [page, setPage] = useState(1);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const dSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [dSearch, stage, sector, geoFilter]);

  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/investors", { search: dSearch, stage, sector, geoFilter, page }],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String((page - 1) * PAGE_SIZE));
      if (dSearch.trim()) p.set("search", dSearch.trim());
      if (stage !== "All Stages") p.set("stage", stage);
      if (sector !== "All Sectors") p.set("sector", sector);
      if (geoFilter.trim()) p.set("location", geoFilter.trim());
      const res = await fetch(`/api/investors?${p}`);
      if (!res.ok) throw new Error("Failed to fetch investors");
      return res.json();
    },
  });

  const { data: stageCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/investors/counts"],
    queryFn: async () => {
      const res = await fetch("/api/investors/counts");
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: enrichmentStats } = useQuery<{
    enriched: number; partiallyEnriched: number; failed: number; notEnriched: number; total: number;
  }>({
    queryKey: ["/api/investors/enrichment-stats"],
    queryFn: async () => {
      const res = await fetch("/api/investors/enrichment-stats");
      if (!res.ok) throw new Error("Failed to fetch enrichment stats");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!user?.isAdmin,
  });

  const { data: currentJob } = useQuery<BatchEnrichmentJob>({
    queryKey: ["/api/admin/enrichment/batch", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (currentJob && (currentJob.status === "completed" || currentJob.status === "failed")) {
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      toast({
        title: currentJob.status === "completed" ? "Deep Research Complete" : "Research Stopped",
        description: `Processed ${currentJob.processedRecords} of ${currentJob.totalRecords} investors`,
      });
    }
  }, [currentJob?.status]);

  const startEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/enrichment/investors/start", {
        batchSize: 10, onlyIncomplete: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.id);
      toast({ title: "Deep Research Started", description: `Processing ${data.totalRecords} investors…` });
    },
    onError: (err: any) => toast({ title: "Failed to start research", description: err.message, variant: "destructive" }),
  });

  const cancelEnrichmentMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/enrichment/batch/${jobId}/cancel`);
      return res.json();
    },
    onSuccess: () => toast({ title: "Research cancelled" }),
  });

  const addCRMMutation = useMutation({
    mutationFn: (investorId: string) => apiRequest("POST", `/api/folk/contacts/${investorId}`),
    onSuccess: () => toast({ title: "Added to Folk CRM" }),
    onError: () => toast({ title: "CRM import failed", variant: "destructive" }),
  });

  const bulkCRMMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/contacts/bulk-from-investors", {
      search: dSearch.trim() || undefined,
      stage: stage !== "All Stages" ? stage : undefined,
      sector: sector !== "All Sectors" ? sector : undefined,
      location: geoFilter.trim() || undefined,
    }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: `Added ${data.created} investor${data.created !== 1 ? "s" : ""} to CRM`, description: data.skipped > 0 ? `${data.skipped} already existed` : undefined });
    },
    onError: () => toast({ title: "Bulk CRM import failed", variant: "destructive" }),
  });

  const investors = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = stage !== "All Stages" || sector !== "All Sectors" || search || !!geoFilter;

  // ── Admin CRUD state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const INVESTOR_EDIT_FIELDS = [
    { key: "firstName",         label: "First Name *",             wide: false },
    { key: "lastName",          label: "Last Name",                wide: false },
    { key: "email",             label: "Email",                    wide: false },
    { key: "title",             label: "Title / Role",             wide: false },
    { key: "location",          label: "Location",                 wide: false },
    { key: "hqLocation",        label: "HQ Location",              wide: false },
    { key: "investorType",      label: "Investor Type",            wide: false },
    { key: "typicalCheckSize",  label: "Typical Check Size",       wide: false },
    { key: "linkedinUrl",       label: "LinkedIn URL",             wide: true  },
    { key: "website",           label: "Website",                  wide: false },
    { key: "investmentThesis",  label: "Investment Thesis",        wide: true, textarea: true },
    { key: "preferredStages",   label: "Preferred Stages (comma-separated)",  wide: true },
    { key: "preferredSectors",  label: "Preferred Sectors (comma-separated)", wide: true },
  ];

  const updateInvestorMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiRequest("PATCH", `/api/investors/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      setEditingId(null);
      toast({ title: "Investor updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteInvestorMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/investors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      setConfirmDeleteId(null);
      toast({ title: "Investor deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const createInvestorMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("POST", "/api/investors", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      setShowAddModal(false);
      setAddForm({});
      toast({ title: "Investor created" });
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  function startEditInvestor(inv: any) {
    const init: Record<string, string> = {};
    for (const f of INVESTOR_EDIT_FIELDS) {
      const v = inv[f.key];
      init[f.key] = Array.isArray(v) ? v.join(", ") : (v ?? "");
    }
    setEditForm(init);
    setEditingId(inv.id);
  }

  function saveInvestor() {
    if (!editingId) return;
    const data: Record<string, any> = { ...editForm };
    if (typeof data.preferredStages === "string") data.preferredStages = data.preferredStages.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (typeof data.preferredSectors === "string") data.preferredSectors = data.preferredSectors.split(",").map((s: string) => s.trim()).filter(Boolean);
    updateInvestorMutation.mutate({ id: editingId, data });
  }

  function submitAddInvestor() {
    const data: Record<string, any> = { ...addForm };
    if (!data.firstName?.trim()) return toast({ title: "First name is required", variant: "destructive" });
    if (typeof data.preferredStages === "string") data.preferredStages = data.preferredStages.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (typeof data.preferredSectors === "string") data.preferredSectors = data.preferredSectors.split(",").map((s: string) => s.trim()).filter(Boolean);
    createInvestorMutation.mutate(data);
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="idb-toolbar">
        <div className="idb-search">
          <Search size={14} className="idb-search__icon" />
          <input
            className="idb-search__input"
            placeholder="Search by name, firm, title…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-search-contacts"
          />
          {search && (
            <button onClick={() => setSearch("")} className="idb-search__clear">
              <X size={12} />
            </button>
          )}
        </div>
        <span className="idb-count">{total.toLocaleString()} contacts</span>
        <button
          className="idb-action-btn"
          onClick={() => bulkCRMMutation.mutate()}
          disabled={bulkCRMMutation.isPending || total === 0}
          data-testid="button-bulk-crm-investors"
          title={`Add all ${total.toLocaleString()} matching investors to your CRM`}
          style={{ background: "rgba(142,132,247,0.12)", color: "rgb(142,132,247)", border: "1px solid rgba(142,132,247,0.25)" }}
        >
          {bulkCRMMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
          Add all to CRM{total > 0 ? ` (${total.toLocaleString()})` : ""}
        </button>
        {user?.isAdmin && (enrichmentStats?.notEnriched ?? 0) > 0 && (
          <button
            className="idb-action-btn idb-action-btn--enrich"
            onClick={() => startEnrichmentMutation.mutate()}
            disabled={startEnrichmentMutation.isPending || !!activeJobId}
            data-testid="button-deep-research-contacts"
          >
            {startEnrichmentMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Deep Research ({enrichmentStats?.notEnriched ?? 0})
          </button>
        )}
        {user?.isAdmin && <UrlHealthButton entityScope="investors" />}
      </div>

      {/* ── Admin control bar ── */}
      {user?.isAdmin && (
        <div className="idb-admin-bar">
          <div className="idb-admin-bar__left">
            <ShieldCheck size={13} style={{ color: "#c8aa82" }} />
            <span className="idb-admin-bar__label">Admin Mode</span>
            <span className="idb-admin-bar__hint">Edit · Delete · Add records directly from this view</span>
          </div>
          <div className="idb-admin-bar__right">
            <button
              className="idb-admin-btn idb-admin-btn--add"
              onClick={() => { setAddForm({}); setShowAddModal(true); }}
              data-testid="button-add-investor"
            >
              <Plus size={13} /> Add Investor
            </button>
            <a href="/admin/data-cleanup" className="idb-admin-btn idb-admin-btn--clean" data-testid="button-data-cleaning-contacts">
              <ShieldCheck size={13} /> Data Cleaning
            </a>
          </div>
        </div>
      )}

      {/* ── Admin: enrichment in progress ── */}
      {user?.isAdmin && currentJob && (currentJob.status === "pending" || currentJob.status === "processing") && (
        <div className="idb-job-banner">
          <div className="idb-job-banner__row">
            <div className="idb-job-banner__info">
              <Loader2 size={14} className="animate-spin" style={{ color: "#8e84f7" }} />
              <div>
                <p className="idb-job-banner__title">Deep Research in Progress</p>
                <p className="idb-job-banner__sub">{currentJob.processedRecords}/{currentJob.totalRecords} investors processed</p>
              </div>
            </div>
            <button
              className="idb-job-banner__cancel"
              onClick={() => cancelEnrichmentMutation.mutate(currentJob.id)}
              disabled={cancelEnrichmentMutation.isPending}
            >
              <X size={13} /> Cancel
            </button>
          </div>
          <div className="idb-progress-track">
            <div className="idb-progress-fill" style={{ width: `${((currentJob.processedRecords || 0) / (currentJob.totalRecords || 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* ── Admin: enrichment status tracker ── */}
      {user?.isAdmin && enrichmentStats && (
        <div className="idb-status-tracker">
          <span className="idb-status-tracker__title"><Sparkles size={12} /> Enrichment Status</span>
          <div className="idb-status-chips">
            <div className="idb-status-chip idb-status-chip--green"><CheckCircle2 size={12} />{enrichmentStats.enriched} Enriched</div>
            <div className="idb-status-chip idb-status-chip--yellow"><AlertCircle size={12} />{enrichmentStats.partiallyEnriched} Partial</div>
            <div className="idb-status-chip idb-status-chip--red"><XCircle size={12} />{enrichmentStats.failed} Failed</div>
            <div className="idb-status-chip"><Users size={12} />{enrichmentStats.notEnriched} Pending</div>
          </div>
        </div>
      )}

      {/* ── Stage filter pills ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label">Stage</span>
        <div className="idb-filter-pills">
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => { setStage(s); setPage(1); }}
              className={`idb-pill ${stage === s ? "idb-pill--on" : ""}`}
              data-testid={`button-stage-${s.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {s}
              {stageCounts?.[s] !== undefined && s !== "All Stages" && (
                <span className="idb-pill__count">{stageCounts[s]?.toLocaleString()}</span>
              )}
              {s === "All Stages" && stageCounts?.["All Stages"] !== undefined && (
                <span className="idb-pill__count">{stageCounts["All Stages"]?.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sector filter pills ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label">Sector</span>
        <div className="idb-filter-pills">
          {SECTORS.map(sec => (
            <button
              key={sec}
              onClick={() => { setSector(sec); setPage(1); }}
              className={`idb-pill idb-pill--sm ${sector === sec ? "idb-pill--on" : ""}`}
              data-testid={`button-sector-${sec.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* ── Geography filter ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label"><MapPin size={12} /> Region</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GEO_GROUPS.map(({ group, presets }) => (
            <div key={group || "__all__"} style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              {group && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4, minWidth: 80, flexShrink: 0 }}>
                  {group}
                </span>
              )}
              {presets.map(g => (
                <button
                  key={`${group}-${g.value}`}
                  onClick={() => { setGeoFilter(g.value); setPage(1); }}
                  className={`idb-pill idb-pill--sm ${geoFilter === g.value ? "idb-pill--on" : ""}`}
                  data-testid={`button-geo-contact-${g.value || "all"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Active filters ── */}
      {hasActiveFilters && (
        <div className="idb-active-filters">
          <span className="idb-active-filters__label">Active filters:</span>
          {stage !== "All Stages" && (
            <span className="idb-active-filter-chip">
              {stage} <button onClick={() => setStage("All Stages")}><X size={11} /></button>
            </span>
          )}
          {sector !== "All Sectors" && (
            <span className="idb-active-filter-chip">
              {sector} <button onClick={() => setSector("All Sectors")}><X size={11} /></button>
            </span>
          )}
          {geoFilter && (
            <span className="idb-active-filter-chip">
              <MapPin size={10} /> {GEO_PRESETS.find(g => g.value === geoFilter)?.label ?? geoFilter}
              <button onClick={() => setGeoFilter("")}><X size={11} /></button>
            </span>
          )}
          {search && (
            <span className="idb-active-filter-chip idb-active-filter-chip--search">
              "{search}" <button onClick={() => setSearch("")}><X size={11} /></button>
            </span>
          )}
          <button className="idb-clear-all" onClick={() => { setSearch(""); setStage("All Stages"); setSector("All Sectors"); setGeoFilter(""); setPage(1); }}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Summary bar ── */}
      <div className="idb-summary-bar">
        <span className="idb-summary-bar__count">{total.toLocaleString()} Total Contacts</span>
        {isLoading && <Loader2 size={13} className="animate-spin" style={{ color: "#8e84f7" }} />}
        {pages > 1 && (
          <div className="idb-summary-bar__pages">
            <button className="idb-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className="idb-page-info">Page {page} of {pages}</span>
            <button className="idb-page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="idb-loading">Loading contacts…</div>
      ) : investors.length === 0 ? (
        <div className="idb-empty">No contacts found matching your filters.</div>
      ) : (
        <div className="idb-grid">
          {investors.map((inv: any) => {
            const name = [inv.firstName, inv.lastName].filter(Boolean).join(" ") || inv.name || "—";
            const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={inv.id} className="idb-card">
                <div className="idb-card__header">
                  <div className="idb-card__avatar">
                    {inv.profileImageUrl || inv.avatar
                      ? <img src={inv.profileImageUrl || inv.avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                      : initials
                    }
                  </div>
                  <div className="idb-card__info">
                    <Link href={`/app/investors/${inv.id}`}>
                      <a className="idb-card__name">{name}</a>
                    </Link>
                    {inv.title && <span className="idb-card__type">{inv.title}</span>}
                  </div>
                  {inv.fundingStage && (
                    <span className="idb-stage-badge">{inv.fundingStage}</span>
                  )}
                </div>
                {inv.firm && (
                  <div className="idb-card__meta"><Building2 size={11} />{inv.firm}</div>
                )}
                {inv.location && (
                  <div className="idb-card__meta"><MapPin size={11} />{inv.location}</div>
                )}
                {inv.bio && (
                  <p className="idb-card__thesis">{inv.bio.slice(0, 90)}{inv.bio.length > 90 ? "…" : ""}</p>
                )}
                <div className="idb-card__tags">
                  {(Array.isArray(inv.sectors) ? inv.sectors : []).slice(0, 3).map((sec: string) => (
                    <span key={sec} className="idb-tag">{sec}</span>
                  ))}
                  {inv.investorType && <span className="idb-tag idb-tag--dim">{inv.investorType}</span>}
                </div>
                <div className="idb-card__actions">
                  <Link href={`/app/investors/${inv.id}`}>
                    <a className="idb-btn idb-btn--ghost">View profile</a>
                  </Link>
                  {inv.linkedinUrl && (
                    <a href={inv.linkedinUrl} target="_blank" rel="noopener" className="idb-btn idb-btn--ghost">
                      <Linkedin size={12} />
                    </a>
                  )}
                  <button
                    className="idb-btn idb-btn--crm"
                    onClick={() => addCRMMutation.mutate(inv.id)}
                    disabled={addCRMMutation.isPending}
                    data-testid={`button-crm-investor-${inv.id}`}
                  >
                    <UserPlus size={11} /> CRM
                  </button>
                  {user?.isAdmin && (
                    <>
                      <button
                        className="idb-btn idb-btn--edit"
                        onClick={() => editingId === inv.id ? setEditingId(null) : startEditInvestor(inv)}
                        data-testid={`button-edit-investor-${inv.id}`}
                      >
                        <Pencil size={11} /> {editingId === inv.id ? "Cancel" : "Edit"}
                      </button>
                      <button
                        className="idb-btn idb-btn--delete"
                        onClick={() => setConfirmDeleteId(inv.id)}
                        data-testid={`button-delete-investor-${inv.id}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>

                {/* ── Delete confirmation ── */}
                {user?.isAdmin && confirmDeleteId === inv.id && (
                  <div className="idb-confirm-delete">
                    <span>Delete <strong>{name}</strong>? This cannot be undone.</span>
                    <button className="idb-confirm-yes" onClick={() => deleteInvestorMutation.mutate(inv.id)} disabled={deleteInvestorMutation.isPending}>
                      {deleteInvestorMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
                    </button>
                    <button className="idb-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                      <Ban size={11} /> Cancel
                    </button>
                  </div>
                )}

                {/* ── Inline edit panel ── */}
                {user?.isAdmin && editingId === inv.id && (
                  <div className="idb-edit-panel">
                    <div className="idb-edit-grid">
                      {INVESTOR_EDIT_FIELDS.map(f => (
                        <div key={f.key} className={`idb-edit-field ${f.wide ? "idb-edit-field--wide" : ""}`}>
                          <label className="idb-edit-label">{f.label}</label>
                          {(f as any).textarea ? (
                            <textarea
                              className="idb-edit-input idb-edit-input--ta"
                              value={editForm[f.key] ?? ""}
                              onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))}
                              rows={3}
                            />
                          ) : (
                            <input
                              className="idb-edit-input"
                              value={editForm[f.key] ?? ""}
                              onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="idb-edit-actions">
                      <button className="idb-edit-save" onClick={saveInvestor} disabled={updateInvestorMutation.isPending}>
                        {updateInvestorMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
                      </button>
                      <button className="idb-edit-cancel" onClick={() => setEditingId(null)}>
                        <Ban size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="idb-pagination">
          <button className="idb-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span className="idb-page-info">Page {page} of {pages}</span>
          <button className="idb-page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── Add Investor Modal ── */}
      {user?.isAdmin && showAddModal && (
        <div className="idb-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="idb-modal" onClick={e => e.stopPropagation()}>
            <div className="idb-modal__header">
              <h3 className="idb-modal__title"><Plus size={16} /> Add New Investor</h3>
              <button className="idb-modal__close" onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <div className="idb-edit-grid">
              {INVESTOR_EDIT_FIELDS.map(f => (
                <div key={f.key} className={`idb-edit-field ${f.wide ? "idb-edit-field--wide" : ""}`}>
                  <label className="idb-edit-label">{f.label}</label>
                  {(f as any).textarea ? (
                    <textarea
                      className="idb-edit-input idb-edit-input--ta"
                      value={addForm[f.key] ?? ""}
                      onChange={e => setAddForm(v => ({ ...v, [f.key]: e.target.value }))}
                      rows={3}
                    />
                  ) : (
                    <input
                      className="idb-edit-input"
                      value={addForm[f.key] ?? ""}
                      onChange={e => setAddForm(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="idb-modal__footer">
              <button className="idb-modal__cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button
                className="idb-modal__save"
                onClick={submitAddInvestor}
                disabled={createInvestorMutation.isPending || !addForm.firstName?.trim()}
              >
                {createInvestorMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create Investor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function InvestorDatabase() {
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const urlTab = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(urlTab ?? "firms");

  const switchTab = (t: Tab) => {
    setTab(t);
    navigate(`/app/investor-db?tab=${t}`, { replace: true });
  };

  return (
    <AppLayout showHero={false}>
      <div className="idb">
        <div className="idb__header">
          <h1 className="idb__title">Investor Database</h1>
          <p className="idb__sub">Browse investment firms and individual investor contacts. Filter by stage, sector, firm type. Sync to Folk CRM.</p>
        </div>

        <div className="idb__tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`idb__tab ${tab === t.id ? "idb__tab--on" : ""}`}
              onClick={() => switchTab(t.id)}
              data-testid={`tab-investor-db-${t.id}`}
            >
              <span className="idb__tab-icon">{t.icon}</span>
              <div className="idb__tab-text">
                <span className="idb__tab-label">{t.label}</span>
                <span className="idb__tab-desc">{t.desc}</span>
              </div>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {tab === "firms" && <FirmsTab />}
            {tab === "contacts" && <ContactsTab />}
          </motion.div>
        </AnimatePresence>

        <style>{idbStyles}</style>
      </div>
    </AppLayout>
  );
}

const idbStyles = `
.idb{padding:28px 32px;font-family:'DM Sans',sans-serif;min-height:100vh;color:#fff}
@media(max-width:768px){.idb{padding:16px}}
.idb__header{margin-bottom:20px}
.idb__title{font-family:'Outfit',sans-serif;font-size:26px;font-weight:700;margin:0 0 4px;letter-spacing:-.5px}
.idb__sub{font-size:13px;color:rgba(255,255,255,.38);margin:0}
.idb__tabs{display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap}
.idb__tab{display:flex;align-items:center;gap:12px;padding:14px 20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:14px;cursor:pointer;transition:all .18s;text-align:left;min-width:200px}
.idb__tab--on{background:rgba(142,132,247,.1);border-color:#8e84f7}
.idb__tab:hover:not(.idb__tab--on){border-color:rgba(255,255,255,.2)}
.idb__tab-icon{font-size:22px;flex-shrink:0}
.idb__tab-text{display:flex;flex-direction:column;gap:2px}
.idb__tab-label{font-size:14px;font-weight:600;color:#fff}
.idb__tab-desc{font-size:12px;color:rgba(255,255,255,.4)}

.idb-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.idb-search{display:flex;align-items:center;gap:8px;flex:1;min-width:240px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:0 12px}
.idb-search__icon{color:rgba(255,255,255,.3);flex-shrink:0}
.idb-search__input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;padding:10px 0}
.idb-search__input::placeholder{color:rgba(255,255,255,.2)}
.idb-search__clear{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.3);display:flex;align-items:center;padding:0;flex-shrink:0}
.idb-search__clear:hover{color:rgba(255,255,255,.6)}
.idb-count{font-size:12px;color:rgba(255,255,255,.35);white-space:nowrap}

.idb-action-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;border:none;white-space:nowrap}
.idb-action-btn--enrich{background:linear-gradient(135deg,rgba(142,132,247,.25),rgba(142,132,247,.15));border:1px solid rgba(142,132,247,.4);color:#c4bef7}
.idb-action-btn--enrich:hover:not(:disabled){background:linear-gradient(135deg,rgba(142,132,247,.35),rgba(142,132,247,.22))}
.idb-action-btn:disabled{opacity:.5;cursor:not-allowed}

.idb-job-banner{padding:14px 16px;background:rgba(30,30,38,.9);border:1px solid rgba(142,132,247,.25);border-radius:12px;margin-bottom:14px}
.idb-job-banner__row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.idb-job-banner__info{display:flex;align-items:center;gap:10px}
.idb-job-banner__icon{color:#8e84f7;flex-shrink:0}
.idb-job-banner__title{font-size:13px;font-weight:600;color:#fff;margin:0}
.idb-job-banner__sub{font-size:12px;color:rgba(255,255,255,.4);margin:0}
.idb-job-banner__cancel{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap}
.idb-job-banner__cancel:hover{color:#fff}
.idb-job-banner__counts{display:flex;gap:10px;margin-top:6px;font-size:11px}
.idb-progress-track{height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.idb-progress-fill{height:100%;background:linear-gradient(90deg,#8e84f7,#c8aa82);border-radius:2px;transition:width .4s ease}

.idb-status-tracker{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;margin-bottom:14px}
.idb-status-tracker__title{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:rgba(255,255,255,.5);white-space:nowrap}
.idb-status-chips{display:flex;gap:8px;flex-wrap:wrap}
.idb-status-chip{display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:7px;font-size:11px;font-weight:500;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5)}
.idb-status-chip--green{background:rgba(74,222,128,.08);border-color:rgba(74,222,128,.2);color:#4ade80}
.idb-status-chip--yellow{background:rgba(250,204,21,.08);border-color:rgba(250,204,21,.2);color:#facc15}
.idb-status-chip--red{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.2);color:#f87171}

.idb-filter-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:10px;padding-bottom:4px}
.idb-filter-tabs{display:flex;gap:4px;min-width:max-content;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:4px}
.idb-filter-tab{padding:6px 12px;border-radius:7px;background:none;border:none;color:rgba(255,255,255,.5);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap;transition:all .18s;display:flex;align-items:center;gap:5px}
.idb-filter-tab:hover{color:#fff;background:rgba(255,255,255,.06)}
.idb-filter-tab--on{background:rgba(142,132,247,.18);color:#c4bef7}
.idb-filter-tab__count{font-size:10px;color:rgba(255,255,255,.3);background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px}
.idb-filter-tab--on .idb-filter-tab__count{color:rgba(196,190,247,.6)}

.idb-filter-section{margin-bottom:12px}
.idb-filter-label{font-size:11px;font-weight:600;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:7px}
.idb-filter-pills{display:flex;flex-wrap:wrap;gap:6px}
.idb-pill{padding:5px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:100px;color:rgba(255,255,255,.5);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .16s;display:flex;align-items:center;gap:5px;white-space:nowrap}
.idb-pill:hover{background:rgba(142,132,247,.1);border-color:rgba(142,132,247,.3);color:#fff}
.idb-pill--on{background:rgba(142,132,247,.15);border-color:#8e84f7;color:#c4bef7}
.idb-pill--sm{font-size:11px;padding:4px 10px}
.idb-pill__count{font-size:10px;opacity:.6;background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px}

.idb-active-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.idb-active-filters__label{font-size:12px;color:rgba(255,255,255,.35)}
.idb-active-filter-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(142,132,247,.15);border:1px solid rgba(142,132,247,.3);border-radius:100px;font-size:12px;color:#c4bef7}
.idb-active-filter-chip button{background:none;border:none;cursor:pointer;color:rgba(196,190,247,.6);display:flex;align-items:center;padding:0}
.idb-active-filter-chip button:hover{color:#c4bef7}
.idb-active-filter-chip--search{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.6)}
.idb-active-filter-chip--search button{color:rgba(255,255,255,.4)}
.idb-clear-all{background:none;border:none;cursor:pointer;font-size:12px;color:rgba(255,255,255,.3);font-family:'DM Sans',sans-serif;padding:0}
.idb-clear-all:hover{color:rgba(255,255,255,.6)}

.idb-summary-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;margin-bottom:16px}
.idb-summary-bar__count{font-size:13px;font-weight:500;color:#fff;flex:1}
.idb-summary-bar__pages{display:flex;align-items:center;gap:8px}

.idb-loading{padding:40px;text-align:center;color:rgba(255,255,255,.3);font-size:14px}
.idb-empty{padding:60px 20px;text-align:center;color:rgba(255,255,255,.3);font-size:14px}

.idb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
@media(max-width:600px){.idb-grid{grid-template-columns:1fr}}

.idb-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;transition:border-color .18s}
.idb-card:hover{border-color:rgba(142,132,247,.25)}
.idb-card__header{display:flex;align-items:flex-start;gap:10px}
.idb-card__avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(142,132,247,.3),rgba(200,170,130,.2));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0;overflow:hidden}
.idb-card__avatar--firm{background:linear-gradient(135deg,rgba(93,202,165,.2),rgba(142,132,247,.2))}
.idb-card__info{flex:1;min-width:0}
.idb-card__name{font-size:14px;font-weight:600;color:#fff;text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.idb-card__name:hover{color:#c4bef7}
.idb-card__type{font-size:11px;color:rgba(255,255,255,.38);display:block;margin-top:1px}
.idb-card__meta{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.38)}
.idb-card__thesis{font-size:12px;color:rgba(255,255,255,.42);line-height:1.45;margin:0}
.idb-card__tags{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.idb-tag{padding:2px 8px;background:rgba(142,132,247,.08);border:1px solid rgba(142,132,247,.15);border-radius:20px;font-size:11px;color:#a8a0f0;white-space:nowrap}
.idb-tag--small{font-size:10px;padding:1px 6px}
.idb-tag--dim{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.4)}
.idb-stage-badge{padding:2px 8px;background:rgba(142,132,247,.15);border:1px solid rgba(142,132,247,.3);border-radius:100px;font-size:10px;color:#c4bef7;white-space:nowrap;flex-shrink:0}
.idb-card__actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.idb-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;text-decoration:none;border:none;white-space:nowrap}
.idb-btn--ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6)}
.idb-btn--ghost:hover{background:rgba(255,255,255,.1);color:#fff}
.idb-btn--crm{background:rgba(142,132,247,.14);border:1px solid rgba(142,132,247,.3);color:#c4bef7}
.idb-btn--crm:hover{background:rgba(142,132,247,.22)}
.idb-btn--enrich{background:rgba(200,170,130,.1);border:1px solid rgba(200,170,130,.25);color:#c8aa82}
.idb-btn--enrich:hover{background:rgba(200,170,130,.18)}
.idb-btn:disabled{opacity:.5;cursor:not-allowed}

.idb-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,.06)}
.idb-page-btn{width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .18s}
.idb-page-btn:hover:not(:disabled){background:rgba(255,255,255,.1)}
.idb-page-btn:disabled{opacity:.35;cursor:not-allowed}
.idb-page-info{font-size:12px;color:rgba(255,255,255,.4)}

/* ── Admin controls ── */
.idb-btn--edit{background:rgba(196,227,230,.08);border:1px solid rgba(196,227,230,.2);color:rgba(196,227,230,.8)}
.idb-btn--edit:hover{background:rgba(196,227,230,.15);color:#c4e3e6}
.idb-btn--delete{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:rgba(248,113,113,.7)}
.idb-btn--delete:hover{background:rgba(248,113,113,.15);color:#f87171}

.idb-admin-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:9px 14px;background:rgba(200,170,130,.06);border:1px solid rgba(200,170,130,.2);border-radius:10px;margin-bottom:12px}
.idb-admin-bar__left{display:flex;align-items:center;gap:8px}
.idb-admin-bar__label{font-size:12px;font-weight:700;color:#c8aa82;text-transform:uppercase;letter-spacing:.5px}
.idb-admin-bar__hint{font-size:11px;color:rgba(255,255,255,.3)}
.idb-admin-bar__right{display:flex;gap:8px;align-items:center}
.idb-admin-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;text-decoration:none;border:none;white-space:nowrap}
.idb-admin-btn--add{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.25);color:#4ade80}
.idb-admin-btn--add:hover{background:rgba(74,222,128,.18)}
.idb-admin-btn--clean{background:rgba(200,170,130,.1);border:1px solid rgba(200,170,130,.25);color:#c8aa82}
.idb-admin-btn--clean:hover{background:rgba(200,170,130,.18)}

.idb-confirm-delete{margin-top:8px;padding:10px 12px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:9px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:rgba(255,255,255,.7)}
.idb-confirm-yes{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;background:rgba(248,113,113,.2);border:1px solid rgba(248,113,113,.35);color:#f87171;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.idb-confirm-yes:hover{background:rgba(248,113,113,.3)}
.idb-confirm-no{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.idb-confirm-no:hover{color:#fff}

.idb-edit-panel{margin-top:10px;padding:14px;background:rgba(255,255,255,.03);border:1px solid rgba(196,227,230,.15);border-radius:11px}
.idb-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:600px){.idb-edit-grid{grid-template-columns:1fr}}
.idb-edit-field{display:flex;flex-direction:column;gap:4px}
.idb-edit-field--wide{grid-column:1/-1}
.idb-edit-label{font-size:11px;color:rgba(255,255,255,.4);font-weight:500}
.idb-edit-input{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:7px 10px;color:#fff;font-size:12px;font-family:'DM Sans',sans-serif;outline:none;width:100%;box-sizing:border-box;transition:border-color .18s}
.idb-edit-input:focus{border-color:rgba(196,227,230,.4)}
.idb-edit-input--ta{resize:vertical;min-height:66px}
.idb-edit-actions{display:flex;gap:8px;margin-top:12px}
.idb-edit-save{display:inline-flex;align-items:center;gap:5px;padding:7px 16px;border-radius:8px;background:rgba(142,132,247,.2);border:1px solid rgba(142,132,247,.4);color:#c4bef7;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.idb-edit-save:hover:not(:disabled){background:rgba(142,132,247,.3)}
.idb-edit-save:disabled{opacity:.5;cursor:not-allowed}
.idb-edit-cancel{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.idb-edit-cancel:hover{color:#fff}

.idb-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}
.idb-modal{background:#1a1a26;border:1px solid rgba(255,255,255,.12);border-radius:16px;max-width:640px;width:100%;max-height:85vh;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px}
.idb-modal__header{display:flex;align-items:center;justify-content:space-between}
.idb-modal__title{font-size:16px;font-weight:700;color:#fff;margin:0;display:flex;align-items:center;gap:8px}
.idb-modal__close{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.4);display:flex;align-items:center;padding:4px;border-radius:6px;transition:all .18s}
.idb-modal__close:hover{color:#fff;background:rgba(255,255,255,.08)}
.idb-modal__footer{display:flex;justify-content:flex-end;gap:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}
.idb-modal__cancel{padding:8px 16px;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.idb-modal__cancel:hover{color:#fff}
.idb-modal__save{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:9px;background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.3);color:#4ade80;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s}
.idb-modal__save:hover:not(:disabled){background:rgba(74,222,128,.25)}
.idb-modal__save:disabled{opacity:.4;cursor:not-allowed}
`;
