"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Layers3, Rocket, Box, Globe2, Plug, ChartNoAxesCombined, Bell, ShieldCheck, Settings2, ChevronsUpDown, Check, Plus, ArrowUpRight, ArrowRight, Sparkles, BookOpen, CircleHelp, Search, House, Menu, X, ChevronRight, FlaskConical, LogOut, Mail, Command, GitBranch, ToggleRight, KeyRound, GitFork, type LucideIcon } from "lucide-react";
import { rememberOrg, rememberToken, useWorkspace } from "./workspace-context";
import { Avatar, Button, Modal, ProjectIcon, EmptyState } from "./ui";
import { GlobalModals } from "./modals";
import { navItems } from "@/lib/constants";
import { ThemeToggle } from "./theme-provider";
import { AiAssistant } from "./ai-assistant";

const icons: Record<string, LucideIcon> = { LayoutDashboard, Layers3, Rocket, Box, Globe2, Plug, ChartNoAxesCombined, Bell, ShieldCheck, Settings2, ToggleRight, KeyRound, GitFork };
export function Brand() { return <Link href="/overview" className="brand" aria-label="DeployFlow overview"><span className="brand-symbol"><svg viewBox="0 0 32 34" fill="none"><path d="m16 3 13 7-13 7L3 10 16 3Z" fill="currentColor"/><path d="m3 16 13 7 13-7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/><path d="m3 23 13 7 13-7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span>DeployFlow<span className="brand-dot">.</span></span></Link>; }
export function AppShell({ children }: { children: ReactNode }) {
  const { data, isDemo, openModal, switchOrganization, mutate } = useWorkspace();
  const pathname = usePathname(); const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false); const [orgOpen, setOrgOpen] = useState(false); const [searchOpen, setSearchOpen] = useState(false); const [helpOpen, setHelpOpen] = useState(false); const orgRef = useRef<HTMLDivElement>(null);
  const section = pathname.split("/")[1]; const current = navItems.find(item => item.href === `/${section}`)?.label || (section === "docs" ? "Documentation" : "Overview");
  const unread = data.notifications.filter(n => !n.read).length; const activeEnvs = data.environments.filter(e => e.status === "ready" || e.status === "provisioning").length;
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(value => !value); } }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { if (!orgOpen) return; const close = (e: MouseEvent) => { if (!orgRef.current?.contains(e.target as Node)) setOrgOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [orgOpen]);
  const logout = async () => { try { await mutate("/api/auth/logout", {}, "POST"); } catch { /* clear local session regardless */ } finally { rememberToken(null); rememberOrg(null); window.location.assign("/login"); } };
  return (
    <>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Brand />
        <div className="org-switcher" ref={orgRef}>
          <button className="org-button" onClick={() => setOrgOpen(!orgOpen)} aria-expanded={orgOpen} aria-label="Switch organization">
            <span className="org-avatar">{data.organization.name[0]}</span>
            <span className="org-copy">
              <span className="org-name">{data.organization.name}</span>
              <span className="org-sub">Team workspace <span className="plan-tag">{data.organization.plan}</span></span>
            </span>
            <ChevronsUpDown size={13} className="org-chevron" />
          </button>
          {orgOpen && (
            <div className="org-dropdown">
              {data.organizations.map(org => (
                <button key={org.id} onClick={() => { setOrgOpen(false); if (org.id !== data.organization.id) void switchOrganization(org.id); }}>
                  <span>{org.name}</span>
                  {org.id === data.organization.id && <Check size={13} />}
                </button>
              ))}
              <button className="create-org" onClick={() => { setOrgOpen(false); openModal({ type: "new-organization" }); }}>
                <Plus size={13} /> Create organization
              </button>
            </div>
          )}
        </div>
        <nav aria-label="Main navigation">
          {["workspace", "manage"].map(group => (
            <div className="nav-group" key={group}>
              <p className="nav-label">{group === "workspace" ? "WORKSPACE" : "MANAGE"}</p>
              {navItems.filter(item => item.group === group).map(item => {
                const Icon = icons[item.icon];
                return (
                  <Link key={item.href} href={item.href} className={`nav-item ${section === item.href.slice(1) ? "active" : ""}`} aria-current={section === item.href.slice(1) ? "page" : undefined}>
                    <Icon />
                    <span>{item.label}</span>
                    {item.label === "Projects" && <span className="nav-count">{data.projects.length}</span>}
                    {item.label === "Notifications" && unread > 0 && <span className="nav-count unread">{unread}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-card-title"><Sparkles size={14} /> A little more room to ship.</div>
            <p>Great ideas move faster with the right workspace.</p>
            <div className="sidebar-progress"><span style={{ width: `${Math.min(100, activeEnvs / data.organization.previewQuota * 100)}%` }} /></div>
            <div className="plan-usage"><span>{activeEnvs} of {data.organization.previewQuota} previews used</span><span>{data.organization.plan}</span></div>
            <Link href="/settings?tab=billing">Manage plan <ArrowUpRight size={12} /></Link>
          </div>
          <div className="sidebar-links">
            <Link href="/docs"><BookOpen size={13} /> Documentation</Link>
            <button onClick={() => setHelpOpen(true)}><CircleHelp size={13} /> Help</button>
          </div>
          <button className="profile-button" onClick={() => router.push("/settings?tab=security")}>
            <Avatar name={data.user.name} color={data.user.color} />
            <span>
              <span className="profile-name">{data.user.name}</span>
              <span className="profile-email">{data.user.email}</span>
            </span>
            <ChevronsUpDown size={13} />
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <House size={13} />
            <span className="crumb-slash crumb-workspace-slash">/</span>
            <span className="crumb-workspace">Workspace</span>
            <span className="crumb-slash">/</span>
            <span className="crumb-current">{current}</span>
            {data.organization.mode === "sandbox" && (
              <span className="sandbox-tag" title="This workspace uses simulated deployment execution.">
                <FlaskConical size={9} /> Sandbox
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <button className="command-trigger" onClick={() => setSearchOpen(true)} aria-label="Search workspace">
              <Search size={13} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            <button className="icon-button topbar-help" onClick={() => setHelpOpen(true)} aria-label="Help and documentation">
              <CircleHelp size={17} />
            </button>
            <ThemeToggle />
            <Link href="/notifications" className="icon-button notification-button" aria-label={`Notifications, ${unread} unread`}>
              <Bell size={17} />
              {unread > 0 && <span className="notification-dot" />}
            </Link>
            <span className="topbar-separator" />
            <Link href="/settings?tab=security" className="topbar-avatar" aria-label="Account settings">
              <Avatar name={data.user.name} color={data.user.color} />
            </Link>
          </div>
        </header>
        <main className="page-content">
          {isDemo && <div className="demo-strip"><span><FlaskConical size={14} /> You are exploring the shared sandbox workspace.</span><span className="demo-strip-actions"><Link href="/login">Sign in for your own workspace</Link></span></div>}
          {children}
          <footer className="page-footer">
            <span><span className="footer-dot" /> A better way to ship.</span>
            <span>Made for your flow. Built for your team.<span style={{ marginLeft: 8 }}>DeployFlow © {new Date().getFullYear()}</span></span>
          </footer>
        </main>
      </div>
      <GlobalModals />
      <AiAssistant />
      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      {helpOpen && <Modal title="A little help, a lot of flow." subtitle="Everything you need to keep your team shipping." onClose={() => setHelpOpen(false)}>
        <div className="modal-body">
          <Link href="/docs" className="help-option" onClick={() => setHelpOpen(false)}><BookOpen size={22} /><div><h3>Explore the documentation</h3><p>Projects, previews, configuration, and the REST API.</p></div><ArrowUpRight size={16} /></Link>
          <Link href="/docs#sandbox" className="help-option" onClick={() => setHelpOpen(false)}><FlaskConical size={22} /><div><h3>About this sandbox</h3><p>Real workspace data. Simulated deployment execution.</p></div><ArrowUpRight size={16} /></Link>
          <button className="help-option" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => { setHelpOpen(false); setSearchOpen(true); }}><Command size={22} /><div><h3>Find your next thing</h3><p>Press ⌘K or Ctrl K to search your workspace.</p></div><ChevronRight size={16} /></button>
          <button className="help-option" style={{ width: "100%", background: "none", textAlign: "left" }} onClick={logout}><LogOut size={21} /><div><h3>Sign out</h3><p>End this session securely.</p></div></button>
        </div>
      </Modal>}
    </>
  );
}
function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data } = useWorkspace();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const q = query.toLowerCase();
  const projects = data.projects.filter(p => `${p.name} ${p.repository}`.toLowerCase().includes(q)).slice(0, 5);
  const deployments = q ? data.deployments.filter(d => `${d.projectName} ${d.branch} ${d.commitSha} ${d.message}`.toLowerCase().includes(q)).slice(0, 4) : [];
  const runners = q ? data.runners.filter(r => `${r.name} ${r.kind} ${r.region}`.toLowerCase().includes(q)).slice(0, 3) : [];
  const pages = navItems.filter(n => n.label.toLowerCase().includes(q)).slice(0, q ? 4 : 3);
  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <Modal title="Search your workspace" onClose={onClose} className="command-modal">
      <div className="command-search">
        <Search size={19} />
        <input autoFocus placeholder="Search projects, branches, deployments..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { if (projects[0]) go(`/projects/${projects[0].id}`); else if (deployments[0]) go(`/deployments/${deployments[0].id}`); else if (pages[0]) go(pages[0].href); } }} aria-label="Search all projects and deployments" />
      </div>
      <div className="command-results">
        {projects.length > 0 && (
          <>
            <p className="command-group-label">Projects</p>
            {projects.map(p => (
              <button key={p.id} className="command-result" onClick={() => go(`/projects/${p.id}`)}>
                <ProjectIcon framework={p.framework} color={p.color} small />
                <span>{p.name}</span>
                <small>{p.repository}</small>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </>
        )}
        {deployments.length > 0 && (
          <>
            <p className="command-group-label">Deployments</p>
            {deployments.map(d => (
              <button key={d.id} className="command-result" onClick={() => go(`/deployments/${d.id}`)}>
                <GitBranch size={16} />
                <span>{d.projectName} <span className="text-muted">/ {d.branch}</span></span>
                <small className="mono">{d.commitSha.slice(0, 7)}</small>
              </button>
            ))}
          </>
        )}
        {runners.length > 0 && (
          <>
            <p className="command-group-label">Runners</p>
            {runners.map(r => (
              <button key={r.id} className="command-result" onClick={() => go("/integrations")}>
                <Plug size={16} />
                <span>{r.name}</span>
                <small>{r.kind}</small>
              </button>
            ))}
          </>
        )}
        {pages.length > 0 && (
          <>
            <p className="command-group-label">Jump to</p>
            {pages.map(page => {
              const Icon = icons[page.icon];
              return (
                <button key={page.href} className="command-result" onClick={() => go(page.href)}>
                  <Icon size={16} />
                  <span>{page.label}</span>
                  <ArrowRight size={13} />
                </button>
              );
            })}
          </>
        )}
        {!projects.length && !deployments.length && !pages.length && (
          <EmptyState title="No matches just yet" description="Try a project name, branch, or commit SHA." />
        )}
      </div>
      <div className="command-footer">
        <span>↵ Open first result</span>
        <span>esc Close</span>
      </div>
    </Modal>
  );
}
