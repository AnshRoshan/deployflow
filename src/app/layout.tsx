import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "DeployFlow — Ship every branch with confidence", template: "%s · DeployFlow" },
  description: "Git-integrated preview environments with DevSecOps gates, encrypted configuration, feature flags, and AI-assisted operations.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f8a5f" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
