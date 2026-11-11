"use client";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Atom, Zap, Code2, Hexagon, CircleCheck, CircleX, CirclePause, Clock3, LoaderCircle, MoreHorizontal, X, Search, Copy, Check, ArrowRight, type LucideIcon } from "lucide-react";
import { copyText, initials } from "@/lib/utils";

export function Button({ children, variant = "secondary", size = "normal", loading, className = "", disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "dark"; size?: "normal" | "small"; loading?: boolean }) {
  return <button className={`btn btn-${variant} ${size === "small" ? "btn-small" : ""} ${className}`} disabled={disabled || loading} {...props}>{loading && <LoaderCircle size={15} className="spin" />}{children}</button>;
}
export function ProjectIcon({ framework = "Next.js", color = "mint", small = false }: { framework?: string; color?: string; small?: boolean }) {
  const Icon = framework === "React" ? Atom : framework === "FastAPI" ? Zap : framework === "Node.js" ? Hexagon : Code2;
  return <span className={`project-icon color-${color} ${small ? "project-icon-small" : ""}`} aria-hidden="true">{framework === "Next.js" ? <span className="next-mark">N<span /></span> : <Icon size={small ? 18 : 22} strokeWidth={1.7} />}</span>;
}
export function Avatar({ name, color = "mint", small = false }: { name: string; color?: string; small?: boolean }) { return <span className={`avatar color-${color} ${small ? "avatar-small" : ""}`}>{initials(name)}</span>; }
const statusMap: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  ready: { label: "Ready", icon: CircleCheck, color: "green" }, healthy: { label: "Healthy", icon: CircleCheck, color: "green" }, active: { label: "Active", icon: CircleCheck, color: "green" }, success: { label: "Success", icon: CircleCheck, color: "green" },
  building: { label: "Building", icon: LoaderCircle, color: "blue" }, queued: { label: "Queued", icon: Clock3, color: "gray" }, preparing: { label: "Preparing", icon: LoaderCircle, color: "blue" }, pushing_image: { label: "Publishing", icon: LoaderCircle, color: "blue" }, provisioning: { label: "Provisioning", icon: LoaderCircle, color: "blue" }, health_checking: { label: "Checking", icon: LoaderCircle, color: "blue" },
  failed: { label: "Failed", icon: CircleX, color: "red" }, build_failed: { label: "Failed", icon: CircleX, color: "red" }, deploy_failed: { label: "Failed", icon: CircleX, color: "red" }, health_check_failed: { label: "Unhealthy", icon: CircleX, color: "red" }, error: { label: "Failed", icon: CircleX, color: "red" },
  stopped: { label: "Stopped", icon: CirclePause, color: "gray" }, cancelled: { label: "Cancelled", icon: CirclePause, color: "gray" }, pending: { label: "Pending", icon: Clock3, color: "amber" }, invited: { label: "Invited", icon: Clock3, color: "amber" }, not_deployed: { label: "Not deployed", icon: Clock3, color: "gray" }, deleted: { label: "Deleted", icon: CirclePause, color: "gray" },
};
export function StatusBadge({ status }: { status: string }) { const config = statusMap[status] || { label: status.replaceAll("_", " "), icon: Clock3, color: "gray" }; const Icon = config.icon; return <span className={`status-badge status-${config.color}`}><Icon size={12} className={["building", "preparing", "pushing_image", "provisioning", "health_checking"].includes(status) ? "spin" : ""} />{config.label}</span>; }
export function BranchBadge({ branch }: { branch: string }) { return <span className="branch-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 7.5v9M18 8.5a8 8 0 0 1-8 8H8.5"/></svg><span>{branch}</span></span>; }
export function Modal({ title, subtitle, children, onClose, wide = false, className = "" }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const timeout = setTimeout(() => ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus(), 50);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") { const focusable = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'); if (!focusable?.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    };
    document.addEventListener("keydown", keydown); return () => { clearTimeout(timeout); document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? "modal-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19}/></button></div>{children}</div></div>;
}
export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const control = containerRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
    if (!control) return;
    if (!control.id) control.id = id;
    if (hint) control.setAttribute("aria-describedby", `${id}-hint`);
  }, [id, hint, children]);
  return <div className={`field ${className}`} ref={containerRef}><label className="field-label" htmlFor={id}>{label}</label>{children}{hint && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}</div>;
}
export function SearchInput({ value, onChange, placeholder = "Search...", className = "" }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) { return <div className={`search-input ${className}`}><Search size={16}/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/>{value && <button onClick={() => onChange("")} aria-label="Clear search"><X size={14}/></button>}</div>; }
export function EmptyState({ icon: Icon = Search, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><span className="empty-icon"><Icon size={26} strokeWidth={1.5}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) { const [copied, setCopied] = useState(false); return <button className={`icon-button ${className}`} title={copied ? "Copied!" : label} aria-label={copied ? "Copied" : label} onClick={async e => { e.stopPropagation(); try { await copyText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button>; }
export function ActionMenu({ actions, label = "More options" }: { actions: { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", close); document.addEventListener("keydown", key); return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); }; }, [open]);
  return <div className="action-menu" ref={ref} onClick={e => e.stopPropagation()}><button className="icon-button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18}/></button>{open && <div className="dropdown-menu dropdown-right">{actions.map(action => <button key={action.label} className={action.danger ? "text-danger" : ""} onClick={() => { setOpen(false); action.onClick(); }}>{action.icon && <action.icon size={15}/>} {action.label}</button>)}</div>}</div>;
}
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) { return <div className="tabs" role="tablist">{tabs.map(tab => <button key={tab.id} role="tab" aria-selected={active === tab.id} className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}</div>; }
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowRight size={14}/></button>; }
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}><span/></button>; }
