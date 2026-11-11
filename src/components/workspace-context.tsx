"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, CircleAlert, LogIn, X } from "lucide-react";
import { Button, Modal } from "./ui";
import type { WorkspaceData, VariableView } from "@/lib/types";
import { isRunning } from "@/lib/constants";
export type ModalState = { type: "new-project" } | { type: "new-deployment"; projectId?: string } | { type: "new-organization" } | { type: "environment"; id: string } | { type: "variable"; projectId?: string; variable?: VariableView } | { type: "domain" } | { type: "invite" } | { type: "confirm"; title: string; description: string; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<unknown> } | null;
type Toast = { id: number; message: string; type: "success" | "error" };
type WorkspaceContextType = { data: WorkspaceData; isDemo: boolean; refresh: () => Promise<void>; mutate: (url: string, body?: unknown, method?: string, success?: string) => Promise<Record<string, any>>; modal: ModalState; openModal: (modal: ModalState) => void; toast: (message: string, type?: "success" | "error") => void; canDeploy: boolean; canAdmin: boolean; switchOrganization: (id: string) => Promise<void> };
const WorkspaceContext = createContext<WorkspaceContextType | null>(null);
const TOKEN_KEY = "df_session_token";
const ORG_KEY = "df_organization_id";
export function storedToken() { try { return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function rememberToken(token: string | null) { try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage may be blocked */ } }
export function storedOrg() { try { return typeof window === "undefined" ? null : localStorage.getItem(ORG_KEY); } catch { return null; } }
export function rememberOrg(orgId: string | null) { try { if (orgId) localStorage.setItem(ORG_KEY, orgId); else localStorage.removeItem(ORG_KEY); } catch { /* storage may be blocked */ } }
export function authHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  const token = storedToken();
  const org = storedOrg();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (org && !headers["x-organization-id"]) headers["x-organization-id"] = org;
  return headers;
}
export function WorkspaceProvider({ initialData, demoMode = false, children }: { initialData: WorkspaceData; demoMode?: boolean; children: ReactNode }) {
  const [data, setData] = useState(initialData); const [isDemo, setIsDemo] = useState(demoMode); const [modal, openModal] = useState<ModalState>(null); const [toasts, setToasts] = useState<Toast[]>([]); const [sessionExpired, setSessionExpired] = useState(false);
  const toast = useCallback((message: string, type: "success" | "error" = "success") => { const id = Date.now() + Math.random(); setToasts(items => [...items.slice(-3), { id, message, type }]); setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 5500); }, []);
  const refresh = useCallback(async () => { const response = await fetch("/api/workspace", { cache: "no-store", headers: authHeaders() }); if (!response.ok) { if (response.status === 401) setSessionExpired(true); return; } const result = await response.json(); setIsDemo(Boolean(result.demoMode)); if (result.demoMode && storedToken()) rememberToken(null); const { demoMode: _ignored, ...workspace } = result; setData(workspace); }, []);
  const mutate = useCallback(async (url: string, body?: unknown, method = "POST", success?: string) => {
    const response = await fetch(url, { method, headers: authHeaders({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) { const message = result.error || "This action couldn't be completed."; toast(message, "error"); throw new Error(message); }
    await refresh(); if (success) toast(success); return result;
  }, [refresh, toast]);
  useEffect(() => { setData(initialData); setIsDemo(demoMode); }, [initialData, demoMode]);
  useEffect(() => { if (storedToken() || storedOrg()) void refresh(); }, [refresh]);
  const running = data.deployments.some(d => isRunning(d.status));
  useEffect(() => { if (!running) return; const interval = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 4000); return () => clearInterval(interval); }, [running, refresh]);
  const switchOrganization = async (id: string) => { try { rememberOrg(id); await mutate("/api/organizations", { organizationId: id }, "PUT", "Switched workspace."); } catch { rememberOrg(null); } };
  return <WorkspaceContext.Provider value={{ data, isDemo, refresh, mutate, modal, openModal, toast, canDeploy: ["Owner", "Admin", "Developer"].includes(data.organization.role), canAdmin: ["Owner", "Admin"].includes(data.organization.role), switchOrganization }}>{children}{sessionExpired && <Modal title="Your session needs a refresh" subtitle="For your security, sessions expire after seven days. Your projects and deployments are safe." onClose={() => setSessionExpired(false)}><div className="modal-body"><p style={{ fontSize: 13, lineHeight: 1.8, color: "#7c8f6b" }}>Sign in again to continue, or jump straight back into the shared sandbox workspace.</p></div><div className="modal-footer"><Button onClick={() => setSessionExpired(false)}>Stay here</Button><Button variant="primary" onClick={async () => { try { const response = await fetch("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!response.ok) throw new Error("The demo workspace could not be opened."); window.location.assign("/overview"); } catch { window.location.assign("/login?error=session"); } }}><LogIn size={14}/>Continue to demo</Button><a className="btn btn-secondary" href="/login">Sign in</a></div></Modal>}<div className="toast-stack" aria-live="polite">{toasts.map(item => <div key={item.id} className={`toast toast-${item.type}`}>{item.type === "success" ? <Check size={18}/> : <CircleAlert size={18}/>}<span>{item.message}</span><button onClick={() => setToasts(items => items.filter(t => t.id !== item.id))} aria-label="Dismiss notification"><X size={15}/></button></div>)}</div></WorkspaceContext.Provider>;
}
export function useWorkspace() { const context = useContext(WorkspaceContext); if (!context) throw new Error("WorkspaceProvider is required."); return context; }
