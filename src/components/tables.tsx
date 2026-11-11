"use client";
import { useState } from "react";
import { Box, ChevronLeft, ChevronRight, Eye, EyeOff, GitBranch, KeyRound, Pause, Pencil, Play, Plus, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { useWorkspace } from "./workspace-context";
import { ActionMenu, BranchBadge, Button, CopyButton, EmptyState, ProjectIcon, StatusBadge, Toggle } from "./ui";
import { DeploymentRow } from "./dashboard";
import { dateTime } from "@/lib/utils";
import type { DeploymentView, EnvironmentView, VariableView, BranchView } from "@/lib/types";

export function Pagination({ page, total, pageSize = 10, onChange }: { page: number; total: number; pageSize?: number; onChange: (page: number) => void }) {
  if (total <= pageSize) return <div className="pagination"><span>{total} {total === 1 ? "result" : "results"}</span><span>Up to date</span></div>;
  return (
    <div className="pagination">
      <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <div>
        <Button size="small" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={13} />Previous</Button>
        <span>{page} / {Math.ceil(total / pageSize)}</span>
        <Button size="small" disabled={page >= Math.ceil(total / pageSize)} onClick={() => onChange(page + 1)} aria-label="Next page">Next<ChevronRight size={13} /></Button>
      </div>
    </div>
  );
}

export function DeploymentTable({ rows, compact = false }: { rows: DeploymentView[]; compact?: boolean }) {
  const [page, setPage] = useState(1); const size = compact ? 5 : 10; const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  return (
    <>
      {rows.length ? (
        <div className="table-scroll">
          <table className="full-table">
            <thead><tr><th>Deployment</th><th>Branch / commit</th><th>Status</th><th>Triggered by</th><th>Source</th><th>Time</th><th aria-label="Details" /></tr></thead>
            <tbody>{rows.slice((safePage - 1) * size, safePage * size).map(d => <DeploymentRow key={d.id} deployment={d} full />)}</tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={GitBranch} title="No deployments found" description="Try another filter, or ship a branch to start a new deployment." />
      )}
      <Pagination page={safePage} total={rows.length} pageSize={size} onChange={setPage} />
    </>
  );
}

export function EnvironmentTable({ rows, compact = false }: { rows: EnvironmentView[]; compact?: boolean }) {
  const { openModal, canDeploy, canAdmin, mutate, toast } = useWorkspace();
  const [page, setPage] = useState(1); const size = compact ? 5 : 10; const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / size)));
  return (
    <>
      {rows.length ? (
        <div className="table-scroll">
          <table className="full-table">
            <thead><tr><th>Environment</th><th>Preview hostname</th><th>Status</th>{!compact && <th>Resources</th>}<th>Cleanup</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.slice((safePage - 1) * size, safePage * size).map(env => (
                <tr key={env.id} className="clickable" onClick={() => openModal({ type: "environment", id: env.id })}>
                  <td>
                    <div className="project-cell">
                      <ProjectIcon framework={env.framework} color={env.color} small />
                      <div>
                        <div className="project-name">{env.projectName}</div>
                        <div className="commit-message"><GitBranch size={10} style={{ display: "inline", marginRight: 4 }} />{env.branch}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex-center">
                      <span className="mono truncate" style={{ fontSize: 11, maxWidth: compact ? 170 : 250 }}>{env.hostname}</span>
                      <CopyButton text={`https://${env.hostname}`} label="Copy preview URL" />
                    </div>
                  </td>
                  <td><StatusBadge status={env.status} /></td>
                  {!compact && <td className="time-cell">{env.cpu} vCPU<div className="cell-secondary">{env.memory} MB memory</div></td>}
                  <td className="time-cell">
                    {env.protected
                      ? <span className="flex-center"><ShieldCheck size={12} />Protected</span>
                      : env.expiresAt
                        ? <span title={dateTime(env.expiresAt)}>{new Date(env.expiresAt).getTime() < Date.now() ? "Expired · ready to clean" : `In ${Math.max(1, Math.ceil((new Date(env.expiresAt).getTime() - Date.now()) / 3600000))}h`}</span>
                        : "Never"}
                  </td>
                  <td>
                    <ActionMenu actions={[
                      { label: "Environment details", icon: Box, onClick: () => openModal({ type: "environment", id: env.id }) },
                      ...(canDeploy ? [{
                        label: env.status === "stopped" ? "Restart environment" : "Stop environment",
                        icon: env.status === "stopped" ? Play : Pause,
                        onClick: () => { void mutate(`/api/environments/${env.id}`, { action: env.status === "stopped" ? "restart" : "stop" }, "PATCH", "Environment updated.").catch(() => {}); },
                      }] : []),
                      ...(canAdmin && env.protected ? [{
                        label: "Unprotect environment",
                        icon: ShieldOff,
                        onClick: () => { void mutate(`/api/environments/${env.id}`, { action: "unprotect" }, "PATCH", "Environment unprotected. It can now be deleted.").catch(() => {}); },
                      }] : []),
                      ...(canDeploy ? [{
                        label: "Delete environment",
                        icon: Trash2,
                        danger: true,
                        onClick: () => {
                          if (env.protected) {
                            toast("This environment is protected. Unprotect it first before deleting.", "error");
                            return;
                          }
                          openModal({
                            type: "confirm",
                            title: "Release this environment?",
                            description: `Release the preview for ${env.projectName} / ${env.branch}? Its deployment history will be retained.`,
                            confirmLabel: "Delete environment",
                            danger: true,
                            onConfirm: () => mutate(`/api/environments/${env.id}`, { confirm: true }, "DELETE", "Environment released."),
                          });
                        },
                      }] : []),
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Box} title="A little space for your next preview" description="No environments match this view. Deploy a branch to create an isolated preview." action={<Button variant="primary" onClick={() => openModal({ type: "new-deployment" })}><Plus size={13} />New deployment</Button>} />
      )}
      <Pagination page={safePage} total={rows.length} pageSize={size} onChange={setPage} />
    </>
  );
}

export function VariablesTable({ rows, projectId }: { rows: VariableView[]; projectId?: string }) {
  const { data, openModal, canDeploy, mutate } = useWorkspace();
  const [revealed, setRevealed] = useState<string[]>([]);
  return (
    <>
      {rows.length ? (
        <div className="table-scroll">
          <table className="full-table">
            <thead><tr><th>Key</th><th>Value</th><th>Scope</th><th>Phase</th><th>Version</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rows.map(variable => (
                <tr key={variable.id}>
                  <td><span className="flex-center mono" style={{ fontSize: 12 }}>{variable.secret ? <LockIcon /> : <KeyRound size={13} />} {variable.key}</span></td>
                  <td>
                    <div className="flex-center">
                      <span className="mono truncate" style={{ maxWidth: 230, fontSize: 11 }}>{variable.secret ? "••••••••••••" : revealed.includes(variable.id) ? variable.value : "••••••••"}</span>
                      {!variable.secret && (
                        <button className="icon-button" aria-label={revealed.includes(variable.id) ? "Hide value" : "Show value"} onClick={() => setRevealed(items => items.includes(variable.id) ? items.filter(id => id !== variable.id) : [...items, variable.id])}>
                          {revealed.includes(variable.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="cell-secondary">{variable.branchId ? data.branches.find(b => b.id === variable.branchId)?.name || "Branch" : "All branches"}</span>
                    {!projectId && <div className="commit-message">{data.projects.find(p => p.id === variable.projectId)?.name}</div>}
                  </td>
                  <td className="time-cell">{variable.phase === "both" ? "Build & runtime" : variable.phase === "build" ? "Build" : "Runtime"}</td>
                  <td className="time-cell">v{variable.version}</td>
                  <td>
                    {canDeploy && (
                      <div className="flex-center">
                        <button className="icon-button" aria-label={`Edit ${variable.key}`} onClick={() => openModal({ type: "variable", variable, projectId: variable.projectId })}><Pencil size={14} /></button>
                        <button className="icon-button" aria-label={`Delete ${variable.key}`} onClick={() => openModal({ type: "confirm", title: `Delete ${variable.key}?`, description: "This removes the variable from future deployments. Existing environments keep their configuration until they are redeployed.", confirmLabel: "Delete variable", danger: true, onConfirm: () => mutate("/api/variables", { id: variable.id }, "DELETE", "Variable deleted.") })}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={KeyRound} title="Keep configuration close to your code" description="Add project defaults and branch-specific overrides. Secret values are encrypted and never exposed." action={canDeploy && <Button variant="primary" onClick={() => openModal({ type: "variable", projectId })}><Plus size={13} />Add variable</Button>} />
      )}
    </>
  );
}

function LockIcon() { return <ShieldCheck size={13} className="text-green" />; }

export function BranchTable({ rows }: { rows: BranchView[] }) {
  const { mutate, openModal, canDeploy, data, toast } = useWorkspace();
  return (
    <div className="table-scroll">
      <table className="full-table">
        <thead><tr><th>Branch</th><th>Latest commit</th><th>Project</th><th>Auto deploy</th><th>Protection</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {rows.map(branch => {
            const proj = data.projects.find(p => p.id === branch.projectId);
            const isDefault = proj?.defaultBranch === branch.name;
            return (
              <tr key={branch.id}>
                <td><BranchBadge branch={branch.name} /></td>
                <td><span className="mono" style={{ fontSize: 11 }}>{branch.commitSha.slice(0, 7)}</span><div className="commit-message">{branch.message}</div></td>
                <td className="time-cell">{proj?.name}</td>
                <td><Toggle label={`Enable deployments for ${branch.name}`} checked={branch.enabled} disabled={!canDeploy} onChange={enabled => { void mutate("/api/branches", { id: branch.id, enabled }, "PATCH", "Branch deployment policy updated.").catch(() => {}); }} /></td>
                <td>{branch.protected ? <span className="status-badge status-green"><ShieldCheck size={12} />Protected</span> : <span className="cell-secondary">Standard</span>}</td>
                <td>
                  {canDeploy && (
                    <div className="flex-center">
                      <Button size="small" disabled={!branch.enabled} onClick={() => openModal({ type: "new-deployment", projectId: branch.projectId })}><Play size={11} />Deploy</Button>
                      <ActionMenu actions={[
                        { label: branch.protected ? "Unprotect environment" : "Protect environment", icon: ShieldCheck, onClick: () => { void mutate("/api/branches", { id: branch.id, protected: !branch.protected }, "PATCH", "Branch protection updated.").catch(() => {}); } },
                        { label: "Clean up preview", icon: Trash2, onClick: () => openModal({ type: "confirm", title: "Clean up this branch's preview?", description: "The preview environment will be released immediately. The Git branch stays in your project.", confirmLabel: "Clean up preview", danger: true, onConfirm: () => mutate("/api/branches", { id: branch.id, mode: "cleanup" }, "DELETE", "Preview cleaned up.") }) },
                        {
                          label: "Delete branch record",
                          icon: Trash2,
                          danger: true,
                          onClick: () => {
                            if (isDefault || branch.protected) {
                              toast(isDefault ? "The default branch cannot be deleted." : "Unprotect this branch before deleting it.", "error");
                              return;
                            }
                            openModal({
                              type: "confirm",
                              title: `Delete branch ${branch.name}?`,
                              description: "Removes this branch and its preview environment from DeployFlow. Your remote Git repository is not modified.",
                              confirmLabel: "Delete branch",
                              danger: true,
                              onConfirm: () => mutate("/api/branches", { id: branch.id, mode: "delete" }, "DELETE", `Branch ${branch.name} deleted.`),
                            });
                          },
                        },
                      ]} />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <EmptyState icon={GitBranch} title="No branches yet" description="Synchronize your repository to discover its branches." />}
    </div>
  );
}
