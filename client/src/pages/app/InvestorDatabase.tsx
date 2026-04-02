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
  "All Sectors", "SaaS", "FinTech", "HealthTech", "AI/ML", "Consumer", "Enterprise",
  "CleanTech", "Crypto / Web3", "DeepTech", "E-commerce", "EdTech", "Cybersecurity",
];

const FIRM_TABS = ["All", ...FIRM_CLASSIFICATIONS, "Unclassified"] as const;

const GEO_PRESETS = [
  { label: "All Regions", value: "" },
  { label: "🇺🇸 USA", value: "United States" },
  { label: "🇬🇧 UK", value: "United Kingdom" },
  { label: "🇪🇺 Europe", value: "Europe" },
  { label: "🇨🇦 Canada", value: "Canada" },
  { label: "🇮🇱 Israel", value: "Israel" },
  { label: "🇸🇬 Asia", value: "Asia" },
  { label: "🌎 LatAm", value: "Latin America" },
];

// ─── Firms Tab ────────────────────────────────────────────────────────────────

function FirmsTab() {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("All");
  const [geoFilter, setGeoFilter] = useState("");
  const [page, setPage] = useState(1);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const dSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [dSearch, classification, geoFilter]);

  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/firms", { search: dSearch, classification, geoFilter, page }],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String((page - 1) * PAGE_SIZE));
      if (dSearch.trim()) p.set("search", dSearch.trim());
      if (classification && classification !== "All") p.set("classification", classification);
      if (geoFilter.trim()) p.set("location", geoFilter.trim());
      const res = await fetch(`/api/firms?${p}`);
      if (!res.ok) throw new Error("Failed to fetch firms");
      return res.json();
    },
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
  const hasActiveFilters = classification !== "All" || search || !!geoFilter;

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

      {/* ── Geography filter ── */}
      <div className="idb-filter-section">
        <span className="idb-filter-label"><MapPin size={12} /> Region</span>
        <div className="idb-filter-pills">
          {GEO_PRESETS.map(g => (
            <button
              key={g.value}
              onClick={() => { setGeoFilter(g.value); setPage(1); }}
              className={`idb-pill ${geoFilter === g.value ? "idb-pill--on" : ""}`}
              data-testid={`button-geo-firm-${g.value || "all"}`}
            >
              {g.label}
            </button>
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
          <button className="idb-clear-all" onClick={() => { setSearch(""); setClassification("All"); setGeoFilter(""); setPage(1); }}>
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
              </div>
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
        <div className="idb-filter-pills">
          {GEO_PRESETS.map(g => (
            <button
              key={g.value}
              onClick={() => { setGeoFilter(g.value); setPage(1); }}
              className={`idb-pill ${geoFilter === g.value ? "idb-pill--on" : ""}`}
              data-testid={`button-geo-contact-${g.value || "all"}`}
            >
              {g.label}
            </button>
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
                </div>
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
`;
