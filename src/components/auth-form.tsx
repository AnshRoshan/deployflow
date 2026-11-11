"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, GitBranch, Layers3, LoaderCircle, LockKeyhole, Rocket, ShieldCheck } from "lucide-react";
import { Brand } from "./app-shell";
import { rememberOrg, rememberToken } from "./workspace-context";
import { ThemeToggle } from "./theme-provider";
import { Button, Field } from "./ui";

type Mode = "login" | "register" | "forgot" | "reset" | "verify";
export function AuthForm({ initialMode, demoEmail, demoPassword, emailConfigured, alreadySignedIn, initialError }: { initialMode?: Mode; demoEmail: string; demoPassword: string; emailConfigured: boolean; alreadySignedIn: boolean; initialError?: string }) {
  const params = useSearchParams(); const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode || (params.get("mode") as Mode) || "login");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState(""); const [challenge, setChallenge] = useState(""); const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false); const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState(initialError || ""); const [message, setMessage] = useState("");
  const token = params.get("token") || "";
  const register = mode === "register"; const reset = mode === "reset"; const verify = mode === "verify"; const forgot = mode === "forgot";

  const startDemo = async () => {
    setDemoLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The demo workspace could not be opened.");
      rememberOrg(null);
      rememberToken(result.sessionToken || null);
      router.replace("/overview"); router.refresh();
    } catch (e) { setError((e as Error).message); setDemoLoading(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    if ((register || reset) && password !== confirm) { setError("Passwords don't match. Please check both fields."); return; }
    setLoading(true);
    try {
      const body = verify ? { token } : challenge ? { challenge, code } : reset ? { token, password } : register ? { name, email, password } : forgot ? { email } : { email, password };
      const response = await fetch(`/api/auth/${challenge ? "mfa" : mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "We couldn't complete that request.");
      if (result.mfaRequired) { setChallenge(result.challenge); setPassword(""); setMessage(""); return; }
      if (forgot) { setMessage(result.message || "If an account exists, a reset link has been sent."); return; }
      if (verify) { setMessage("Your email is verified. You're ready to keep shipping."); return; }
      rememberOrg(null);
      rememberToken(result.sessionToken || null);
      router.replace("/overview"); router.refresh();
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  const switchMode = (next: Mode) => { setMode(next); setError(""); setMessage(""); setPassword(""); setConfirm(""); setChallenge(""); setShowPassword(false); };
  const fillDemo = () => { setMode("login"); setEmail(demoEmail); setPassword(demoPassword); setError(""); setMessage(""); };

  return <div className="auth-page"><aside className="auth-story"><Brand /><div className="auth-story-content"><span className="section-eyebrow" style={{ color: "#a9c78d", display: "block", marginBottom: 23 }}>FROM COMMIT TO PREVIEW. AUTOMATICALLY.</span><h1>Less waiting.<br />More <span>great work.</span></h1><p>Give every branch a space of its own. DeployFlow connects your code, your team, and your next great idea.</p><div className="auth-flow"><span className="auth-flow-node"><GitBranch size={24} /></span><span className="auth-flow-line" /><span className="auth-flow-node"><Layers3 size={24} /></span><span className="auth-flow-line" /><span className="auth-flow-node"><Rocket size={24} /></span></div><p style={{ fontSize: 10, marginTop: 17, color: "#93ad7f" }}>Push a branch. Get a preview. Keep building.</p></div><div className="auth-story-footer"><span>A better way to ship.</span><span>DeployFlow © {new Date().getFullYear()}</span></div></aside>
    <main className="auth-form-side"><div className="auth-theme-toggle"><ThemeToggle /></div><div className="auth-form">
      <div className="auth-mobile-brand"><Brand /></div>
      {alreadySignedIn && !challenge && <div className="inline-note" style={{ marginTop: 0 }}><CircleCheck size={17} /><div><strong>You're already signed in.</strong><br /><Link href="/overview" className="text-link" style={{ marginTop: 6 }}>Continue to your workspace<ArrowRight size={12} /></Link></div></div>}
      <h2 style={{ marginTop: alreadySignedIn ? 22 : 0 }}>{challenge ? "A quick security check." : verify ? "Make it official." : reset ? "A fresh start." : register ? "Find your flow." : forgot ? "Let's get you back in." : "Welcome back."}</h2>
      <p>{challenge ? "Enter the six-digit code from your authenticator app." : verify ? "Confirm ownership of the email address on your account." : reset ? "Choose a strong new password for your account." : register ? "Create your account and give your team room to ship." : forgot ? "Enter your email and we'll send a password reset link." : "Sign in to your workspace and pick up where you left off."}</p>
      {message ? <><div className="inline-note"><CircleCheck size={17} />{message}</div><Button className="w-full" variant="primary" onClick={() => switchMode("login")}>Back to sign in<ArrowRight size={13} /></Button></> : <form onSubmit={submit} noValidate>
        {register && <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} placeholder="Jamie Davidson" autoComplete="name" minLength={2} maxLength={80} required /></Field>}
        {!challenge && !reset && !verify && <Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required /></Field>}
        {!forgot && !verify && !challenge && <Field label={reset ? "New password" : "Password"} hint={register || reset ? "At least 10 characters. Make it unique." : undefined}><div className="password-wrap"><input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={register || reset ? "Create a strong password" : "Enter your password"} autoComplete={register || reset ? "new-password" : "current-password"} minLength={register || reset ? 10 : 1} maxLength={128} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></Field>}
        {(register || reset) && <Field label="Confirm password"><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="One more time" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>}
        {challenge && <Field label="Authenticator code"><input className="mono" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoFocus required /></Field>}
        {mode === "login" && !challenge && <button type="button" className="auth-forgot" onClick={() => switchMode("forgot")}>Forgot password?</button>}
        {verify && !token && <div className="inline-note error"><CircleAlert size={15} />This verification link is missing its token. Request a new email from your account settings.</div>}
        {reset && !token && <div className="inline-note error"><CircleAlert size={15} />This reset link is missing its token. Request a new link below.</div>}
        {error && <div className="inline-note error" role="alert"><CircleAlert size={15} />{error}</div>}
        <Button className="w-full" variant="primary" type="submit" loading={loading} disabled={(verify || reset) && !token}>{challenge ? "Verify & sign in" : verify ? "Verify email" : reset ? "Reset password" : register ? "Create account" : forgot ? "Send reset link" : "Sign in"}<ArrowRight size={14} /></Button>
      </form>}
      {!reset && !verify && !forgot && !message && <>
        <div className="auth-separator">OR EXPLORE THE SANDBOX</div>
        <Button className="w-full" variant="secondary" onClick={startDemo} loading={demoLoading} disabled={loading}>{demoLoading ? <LoaderCircle size={14} className="spin" /> : <Rocket size={14} />}Open the demo workspace</Button>
        <div className="demo-credentials"><div><span className="demo-credentials-label">Demo account</span><code>{demoEmail}</code><code>{demoPassword}</code></div><button type="button" onClick={fillDemo}>Use these details</button></div>
        <a href="/overview" className="auth-skip">Continue without signing in<ArrowRight size={12} /></a>
        <p className="auth-demo-note"><ShieldCheck size={11} style={{ display: "inline", marginRight: 4 }} />Shared sandbox · simulated deployments · no real secrets</p>
      </>}
      {forgot && !message && <p className="auth-switch"><button onClick={() => switchMode("login")}>Back to sign in</button></p>}
      {!reset && !verify && !forgot && !message && <p className="auth-switch">{register ? "Already part of the flow?" : "New around here?"} <button onClick={() => switchMode(register ? "login" : "register")}>{register ? "Sign in" : "Create an account"}</button></p>}
      {reset && !message && <p className="auth-switch"><Link href="/login">Back to sign in</Link></p>}
      {!emailConfigured && (forgot || register) && <p className="auth-demo-note" style={{ color: "#b08a6a" }}>Email delivery isn't configured in this installation, so verification and reset links can't be sent.</p>}
      <p className="auth-demo-note"><LockKeyhole size={10} style={{ display: "inline", marginRight: 4 }} />Secure sessions. Encrypted secrets. Your own space.</p>
    </div></main></div>;
}
