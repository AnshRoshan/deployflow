import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
export const metadata = { title: "Verify email" };
export default function VerifyPage() { return <Suspense fallback={<div className="empty-state">Loading verification…</div>}><AuthForm initialMode="verify" demoEmail={DEMO_EMAIL} demoPassword={DEMO_PASSWORD} emailConfigured={Boolean(process.env.SMTP_URL)} alreadySignedIn={false} /></Suspense>; }
