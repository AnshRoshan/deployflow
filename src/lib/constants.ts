export const ACTIVE_STATUSES = ["queued", "preparing", "building", "pushing_image", "provisioning", "health_checking"];
export const isRunning = (status: string) => ACTIVE_STATUSES.includes(status);
export const navItems = [
  { label: "Overview", href: "/overview", icon: "LayoutDashboard", group: "workspace" },
  { label: "Projects", href: "/projects", icon: "Layers3", group: "workspace" },
  { label: "Deployments", href: "/deployments", icon: "Rocket", group: "workspace" },
  { label: "Environments", href: "/environments", icon: "Box", group: "workspace" },
  { label: "Domains", href: "/domains", icon: "Globe2", group: "workspace" },
  { label: "Security center", href: "/security", icon: "ShieldCheck", group: "manage" },
  { label: "Feature flags", href: "/flags", icon: "ToggleRight", group: "manage" },
  { label: "Secrets & config", href: "/secrets", icon: "KeyRound", group: "manage" },
  { label: "Repository onboarding", href: "/onboarding", icon: "GitFork", group: "manage" },
  { label: "Integrations", href: "/integrations", icon: "Plug", group: "manage" },
  { label: "Resource usage", href: "/usage", icon: "ChartNoAxesCombined", group: "manage" },
  { label: "Notifications", href: "/notifications", icon: "Bell", group: "manage" },
  { label: "Audit logs", href: "/audit", icon: "ShieldCheck", group: "manage" },
  { label: "Settings", href: "/settings", icon: "Settings2", group: "manage" },
];
