import type { ReactNode } from "react";
import { getAuthOrDemo } from "@/lib/auth";
import { loadPageData } from "@/lib/data";
import { WorkspaceProvider } from "@/components/workspace-context";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await getAuthOrDemo();
  const data = await loadPageData(auth.user.id, auth.sessionId);
  return <WorkspaceProvider key={data.organization.id} initialData={data} demoMode={auth.isDemo}><AppShell>{children}</AppShell></WorkspaceProvider>;
}
