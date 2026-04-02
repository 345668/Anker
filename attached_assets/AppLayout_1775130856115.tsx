/**
 * client/src/components/AppLayout.tsx  — NAV PATCH
 *
 * Consolidated sidebar navigation.
 * Removes duplicate / standalone entries, adds logical grouping.
 *
 * CHANGES FROM ORIGINAL:
 *   REMOVED:  My Startup, Matching, Matching Logs, Investment Firms,
 *             DD Checklist, Data Room Checklist, EOY Review,
 *             Deal Rooms (standalone), Forecasting (standalone)
 *   ADDED:    Fundraise (replaces all matching/startup/deal nav)
 *             Due Diligence (replaces 3 checklist pages)
 *   RENAMED:  Investors → Investor Database
 *             Financial Tools → Tools (now includes Forecasting tab)
 */

import { useLocation, Link } from "wouter";
import { useAuth } from "../hooks/use-auth";

// ─── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match?: RegExp;             // URL pattern to consider "active"
  badge?: string;             // Optional pill badge (e.g. "New")
  dividerBefore?: boolean;    // Show a separator line before this item
}

// FOUNDER nav — linear fundraising workflow at the top
const FOUNDER_NAV: NavItem[] = [
  {
    href: "/app/dashboard",
    label: "Dashboard",
    icon: "◈",
  },
  {
    href: "/app/fundraise",
    label: "Fundraise",
    icon: "🚀",
    // Also matches old routes that redirect here
    match: /^\/app\/(fundraise|fundraising|matching|matching-logs|my-startup|deal-rooms)/,
  },
  {
    href: "/app/investors",
    label: "Investor Database",
    icon: "💼",
    match: /^\/app\/(investors|investment-firms)/,
  },
  {
    href: "/app/due-diligence",
    label: "Due Diligence",
    icon: "✅",
    match: /^\/app\/(due-diligence|dd-checklist|data-room-checklist|eoy-review)/,
  },
  {
    href: "/app/tools",
    label: "Tools",
    icon: "🧮",
    match: /^\/app\/(tools|forecasting)/,
    dividerBefore: true,
  },
  {
    href: "/app/news",
    label: "News",
    icon: "📰",
  },
];

// INVESTOR nav — deal flow and CRM focused
const INVESTOR_NAV: NavItem[] = [
  {
    href: "/app/dashboard",
    label: "Dashboard",
    icon: "◈",
  },
  {
    href: "/app/investors",
    label: "Investor Database",
    icon: "💼",
    match: /^\/app\/(investors|investment-firms)/,
  },
  {
    href: "/app/fundraise",
    label: "Deal Flow",
    icon: "🎯",
    match: /^\/app\/(fundraise|matching|matching-logs|deal-rooms)/,
  },
  {
    href: "/app/due-diligence",
    label: "Due Diligence",
    icon: "✅",
    match: /^\/app\/(due-diligence|dd-checklist|data-room-checklist|eoy-review)/,
  },
  {
    href: "/app/tools",
    label: "Tools",
    icon: "🧮",
    match: /^\/app\/(tools|forecasting)/,
    dividerBefore: true,
  },
  {
    href: "/app/news",
    label: "News",
    icon: "📰",
  },
];

// ─── Nav item component ───────────────────────────────────────────────────────

function NavLink({ item, location }: { item: NavItem; location: string }) {
  const isActive = item.match
    ? item.match.test(location)
    : location === item.href || location.startsWith(item.href + "?");

  return (
    <>
      {item.dividerBefore && <div className="nav-divider" />}
      <Link href={item.href}>
        <a className={`nav-item ${isActive ? "nav-item--active" : ""}`}>
          <span className="nav-item__icon">{item.icon}</span>
          <span className="nav-item__label">{item.label}</span>
          {item.badge && <span className="nav-item__badge">{item.badge}</span>}
          {isActive && <div className="nav-item__indicator" />}
        </a>
      </Link>
    </>
  );
}

// ─── Full layout ──────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isFounder, isAdmin } = useAuth();

  const navItems = isFounder ? FOUNDER_NAV : INVESTOR_NAV;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar__logo">
          <span className="sidebar__anchor">⚓</span>
          <span className="sidebar__brand">Anker</span>
        </div>

        <div className="sidebar__nav">
          {navItems.map(item => (
            <NavLink key={item.href} item={item} location={location} />
          ))}

          {/* Admin link if user is admin */}
          {isAdmin && (
            <>
              <div className="nav-divider" />
              <Link href="/admin">
                <a className={`nav-item ${location.startsWith("/admin") ? "nav-item--active" : ""}`}>
                  <span className="nav-item__icon">⚙️</span>
                  <span className="nav-item__label">Admin</span>
                </a>
              </Link>
            </>
          )}
        </div>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="sidebar__avatar-img" />
                : <span>{(user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}</span>
              }
            </div>
            <div className="sidebar__user-info">
              <p className="sidebar__user-name">
                {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email?.split("@")[0]}
              </p>
              <p className="sidebar__user-role">{isFounder ? "Founder" : "Investor"}</p>
            </div>
          </div>
          <div className="sidebar__footer-links">
            <Link href="/app/settings">
              <a className="sidebar__footer-link">Settings</a>
            </Link>
            <button className="sidebar__footer-link sidebar__footer-link--btn" onClick={() => logout.mutate()}>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>

      <style>{layoutStyles}</style>
    </div>
  );
}

// ─── Redirect routes to add to App.tsx ───────────────────────────────────────

/**
 * Add these inside your <Switch> in App.tsx, BEFORE the /app/* catch-all:
 *
 * import { Redirect } from "wouter";
 *
 * Backward-compatible redirects for all consolidated/removed routes:
 *
 * <Route path="/app/fundraising">     <Redirect to="/app/fundraise" />            </Route>
 * <Route path="/app/matching">        <Redirect to="/app/fundraise?tab=find" />    </Route>
 * <Route path="/app/matching-logs">   <Redirect to="/app/fundraise?tab=matches" /> </Route>
 * <Route path="/app/my-startup">      <Redirect to="/app/fundraise?tab=profile" /> </Route>
 * <Route path="/app/deal-rooms">      <Redirect to="/app/fundraise?tab=deals" />   </Route>
 * <Route path="/app/investment-firms"><Redirect to="/app/investors?tab=firms" />   </Route>
 * <Route path="/app/dd-checklist">    <Redirect to="/app/due-diligence" />         </Route>
 * <Route path="/app/data-room-checklist"><Redirect to="/app/due-diligence?tab=data-room" /></Route>
 * <Route path="/app/eoy-review">      <Redirect to="/app/due-diligence?tab=eoy" /> </Route>
 * <Route path="/app/forecasting">     <Redirect to="/app/tools?tab=forecasting" /> </Route>
 *
 * Then add the new routes:
 *
 * <Route path="/app/fundraise"      component={FundraisingHub} />
 * <Route path="/app/investors"      component={InvestorDatabase} />
 * <Route path="/app/due-diligence"  component={DueDiligence} />
 * <Route path="/app/tools"          component={ToolsHub} />
 */

// ─── Styles ───────────────────────────────────────────────────────────────────

const layoutStyles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Outfit:wght@600;700&display=swap');
*{box-sizing:border-box}

.app-layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh;background:rgb(11,11,15);font-family:'DM Sans',sans-serif}
@media(max-width:768px){.app-layout{grid-template-columns:1fr}}

/* Sidebar */
.sidebar{
  background:rgba(16,16,22,.98);
  border-right:1px solid rgba(255,255,255,.06);
  display:flex;flex-direction:column;
  position:sticky;top:0;height:100vh;
  overflow-y:auto;padding:20px 12px;
}
@media(max-width:768px){.sidebar{display:none}}

.sidebar__logo{display:flex;align-items:center;gap:9px;padding:4px 10px 20px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:16px}
.sidebar__anchor{font-size:18px}
.sidebar__brand{font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:-.3px}

.sidebar__nav{display:flex;flex-direction:column;gap:2px;flex:1}

.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 10px;border-radius:10px;
  text-decoration:none;color:rgba(255,255,255,.48);
  font-size:13px;font-weight:500;
  transition:all .18s;position:relative;cursor:pointer;
  border:1px solid transparent;
}
.nav-item:hover{background:rgba(255,255,255,.05);color:rgba(255,255,255,.75)}
.nav-item--active{
  background:rgba(142,132,247,.12);
  color:#c4bef7;
  border-color:rgba(142,132,247,.2);
}
.nav-item__icon{font-size:15px;width:20px;text-align:center;flex-shrink:0}
.nav-item__label{flex:1}
.nav-item__badge{font-size:9px;padding:2px 6px;background:rgba(200,170,130,.2);border:1px solid rgba(200,170,130,.3);border-radius:10px;color:#c8aa82}
.nav-item__indicator{position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:16px;background:#8e84f7;border-radius:0 2px 2px 0}

.nav-divider{height:1px;background:rgba(255,255,255,.05);margin:8px 4px}

.sidebar__footer{margin-top:auto;padding-top:16px;border-top:1px solid rgba(255,255,255,.05)}
.sidebar__user{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:10px;margin-bottom:8px}
.sidebar__avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#8e84f7,#c8aa82);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;flex-shrink:0;overflow:hidden}
.sidebar__avatar-img{width:100%;height:100%;object-fit:cover}
.sidebar__user-name{font-size:13px;font-weight:500;color:#fff;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px}
.sidebar__user-role{font-size:11px;color:rgba(255,255,255,.35);margin:0}
.sidebar__footer-links{display:flex;gap:8px;padding:0 6px}
.sidebar__footer-link{font-size:12px;color:rgba(255,255,255,.3);text-decoration:none;transition:color .18s}
.sidebar__footer-link:hover{color:rgba(255,255,255,.6)}
.sidebar__footer-link--btn{background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;padding:0}

/* Main content */
.main-content{overflow-y:auto;min-height:100vh}
`;
