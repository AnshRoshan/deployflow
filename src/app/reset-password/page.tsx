import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
export const metadata = { title: "Reset password" };
export default function ResetPage() { return <Suspense fallback={<div className="empty-state">Loading password reset…</div>}><AuthForm initialMode="reset" demoEmail={DEMO_EMAIL} demoPassword={DEMO_PASSWORD} emailConfigured={Boolean(process.env.SMTP_URL)} alreadySignedIn={false} /></Suspense>; }
