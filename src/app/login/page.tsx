import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getAuth } from "@/lib/auth";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
export const metadata = { title: "Welcome back" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const { mode, error } = await searchParams;
  const auth = await getAuth();
  if (mode !== "register" && auth) redirect("/overview");
  return <Suspense fallback={<div className="empty-state">Preparing your workspace…</div>}><AuthForm demoEmail={DEMO_EMAIL} demoPassword={DEMO_PASSWORD} emailConfigured={Boolean(process.env.SMTP_URL)} alreadySignedIn={Boolean(auth)} initialError={error} /></Suspense>;
}
