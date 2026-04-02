/**
 * client/src/pages/app/InvestorDatabase.tsx
 *
 * Unified Investor Database hub.
 * Tabs: Firms (investment firms) | Contacts (individual investors)
 *
 * ROUTE: /app/investor-db
 * Deep-link: ?tab=firms|contacts
 */

import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Building2, Users, MapPin, Globe, Linkedin, Sparkles, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Tab = "firms" | "contacts";

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: "firms",    label: "Investment Firms", icon: "🏦", desc: "Fund-level records, AUM & thesis" },
  { id: "contacts", label: "Contacts",         icon: "👤", desc: "Individual investors & Folk CRM sync" },
];

const PAGE_SIZE = 24;

function FirmsTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const dSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/firms", { search: dSearch, page }],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String((page - 1) * PAGE_SIZE));
      if (dSearch.trim()) p.set("search", dSearch.trim());
      const res = await fetch(`/api/firms?${p}`);
      if (!res.ok) throw new Error("Failed to fetch firms");
      return res.json();
    },
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

  const firms = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
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
        </div>
        <span className="idb-count">{total.toLocaleString()} firms</span>
      </div>

      {isLoading ? (
        <div className="idb-loading">Loading firms…</div>
      ) : firms.length === 0 ? (
        <div className="idb-empty">No firms found.</div>
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
                </div>
              </div>
              {firm.location && (
                <div className="idb-card__meta">
                  <MapPin size={11} />{firm.location}
                </div>
              )}
              {firm.investmentThesis && (
                <p className="idb-card__thesis">{firm.investmentThesis.slice(0, 100)}{firm.investmentThesis.length > 100 ? "…" : ""}</p>
              )}
              <div className="idb-card__tags">
                {firm.typicalCheckSize && <span className="idb-tag">{firm.typicalCheckSize}</span>}
                {firm.portfolioCount && <span className="idb-tag">{firm.portfolioCount} investments</span>}
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
                  <UserPlus size={12} /> CRM
                </button>
                <button
                  className="idb-btn idb-btn--enrich"
                  onClick={() => enrichMutation.mutate(firm.id)}
                  disabled={enrichMutation.isPending}
                  data-testid={`button-enrich-firm-${firm.id}`}
                >
                  <Sparkles size={12} /> Enrich
                </button>
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

function ContactsTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const dSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/investors", { search: dSearch, page }],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String((page - 1) * PAGE_SIZE));
      if (dSearch.trim()) p.set("search", dSearch.trim());
      const res = await fetch(`/api/investors?${p}`);
      if (!res.ok) throw new Error("Failed to fetch investors");
      return res.json();
    },
  });

  const addCRMMutation = useMutation({
    mutationFn: (investorId: string) => apiRequest("POST", `/api/folk/contacts/${investorId}`),
    onSuccess: () => toast({ title: "Added to Folk CRM" }),
    onError: () => toast({ title: "CRM import failed", variant: "destructive" }),
  });

  const investors = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="idb-toolbar">
        <div className="idb-search">
          <Search size={14} className="idb-search__icon" />
          <input
            className="idb-search__input"
            placeholder="Search by name, firm, stage…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            data-testid="input-search-contacts"
          />
        </div>
        <span className="idb-count">{total.toLocaleString()} contacts</span>
      </div>

      {isLoading ? (
        <div className="idb-loading">Loading contacts…</div>
      ) : investors.length === 0 ? (
        <div className="idb-empty">No contacts found.</div>
      ) : (
        <div className="idb-grid">
          {investors.map((inv: any) => {
            const name = [inv.firstName, inv.lastName].filter(Boolean).join(" ") || inv.name || "—";
            const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={inv.id} className="idb-card">
                <div className="idb-card__header">
                  <div className="idb-card__avatar">
                    {inv.profileImageUrl
                      ? <img src={inv.profileImageUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                      : initials
                    }
                  </div>
                  <div className="idb-card__info">
                    <Link href={`/app/investors/${inv.id}`}>
                      <a className="idb-card__name">{name}</a>
                    </Link>
                    {inv.title && <span className="idb-card__type">{inv.title}</span>}
                  </div>
                </div>
                {inv.firm && (
                  <div className="idb-card__meta">
                    <Building2 size={11} />{inv.firm}
                  </div>
                )}
                {inv.location && (
                  <div className="idb-card__meta">
                    <MapPin size={11} />{inv.location}
                  </div>
                )}
                <div className="idb-card__tags">
                  {inv.stage && <span className="idb-tag">{inv.stage}</span>}
                  {inv.sector && <span className="idb-tag">{inv.sector}</span>}
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
                    <UserPlus size={12} /> CRM
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
          <p className="idb__sub">Browse investment firms and individual investor contacts. Sync to Folk CRM.</p>
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

.idb-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.idb-search{display:flex;align-items:center;gap:8px;flex:1;min-width:240px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:0 12px}
.idb-search__icon{color:rgba(255,255,255,.3);flex-shrink:0}
.idb-search__input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;padding:10px 0}
.idb-search__input::placeholder{color:rgba(255,255,255,.2)}
.idb-count{font-size:12px;color:rgba(255,255,255,.35);white-space:nowrap}

.idb-loading{padding:40px;text-align:center;color:rgba(255,255,255,.3);font-size:14px}
.idb-empty{padding:60px 20px;text-align:center;color:rgba(255,255,255,.3);font-size:14px}

.idb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
@media(max-width:600px){.idb-grid{grid-template-columns:1fr}}

.idb-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;transition:border-color .18s}
.idb-card:hover{border-color:rgba(142,132,247,.25)}
.idb-card__header{display:flex;align-items:center;gap:10px}
.idb-card__avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(142,132,247,.3),rgba(200,170,130,.2));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0;overflow:hidden}
.idb-card__avatar--firm{background:linear-gradient(135deg,rgba(93,202,165,.2),rgba(142,132,247,.2))}
.idb-card__info{flex:1;min-width:0}
.idb-card__name{font-size:14px;font-weight:600;color:#fff;text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.idb-card__name:hover{color:#c4bef7}
.idb-card__type{font-size:11px;color:rgba(255,255,255,.38);display:block;margin-top:1px}
.idb-card__meta{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.38)}
.idb-card__thesis{font-size:12px;color:rgba(255,255,255,.45);line-height:1.4;margin:0}
.idb-card__tags{display:flex;gap:5px;flex-wrap:wrap}
.idb-tag{padding:2px 8px;background:rgba(142,132,247,.08);border:1px solid rgba(142,132,247,.15);border-radius:20px;font-size:11px;color:#a8a0f0}
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
