import { notFound } from "next/navigation";
import { SectionPage } from "@/components/sections";
import type { Section } from "@/lib/types";
const sections = ["projects", "deployments", "environments", "domains", "integrations", "usage", "notifications", "audit", "settings", "security", "flags", "secrets", "onboarding"];
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; const labels: Record<string, string> = { usage: "Resource usage", audit: "Audit logs", security: "Security center", flags: "Feature flags", secrets: "Secrets & config", onboarding: "Repository onboarding" }; return { title: labels[section] || section.charAt(0).toUpperCase() + section.slice(1) }; }
export default async function WorkspaceSection({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (!sections.includes(section)) notFound(); return <SectionPage section={section as Section}/>; }
