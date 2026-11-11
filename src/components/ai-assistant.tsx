"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bot, Check, CircleAlert, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { authHeaders } from "./workspace-context";
import { Button } from "./ui";

type Message = { role: "user" | "bot"; text: string };
type AiResponse = { answer: string; confidence: number; citations: string[]; actions: string[]; mode: string };

const SUGGESTIONS = [
  "Why did the last build fail?",
  "What is our security posture?",
  "How do feature flags work?",
  "How do I onboard a repository?",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", text: "Hi — I'm the DeployFlow operations assistant. I answer from your persisted deployments, security gates, flags and configuration. Ask me anything about this workspace." }]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim(); if (!trimmed || loading) return;
    setMessages(items => [...items, { role: "user", text: trimmed }]); setQuestion(""); setLoading(true);
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ question: trimmed }) });
      const data = await res.json() as AiResponse & { error?: string };
      const body = res.ok ? `${data.answer}\n\nConfidence ${Math.round(data.confidence * 100)}% · ${data.citations.join(" · ")}\nExplainable local analysis — no data leaves this workspace.` : data.error || "I couldn't complete that analysis.";
      setMessages(items => [...items, { role: "bot", text: body }]);
    } catch { setMessages(items => [...items, { role: "bot", text: "The assistant is temporarily unavailable. Please try again." }]); }
    finally { setLoading(false); }
  }, [loading]);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen(v => !v); } }; document.addEventListener("keydown", fn); return () => document.removeEventListener("keydown", fn); }, []);

  return <>
    <button className="ai-launcher" onClick={() => setOpen(true)} aria-label="Open AI operations assistant" title="AI assistant (⌘J)"><Sparkles size={20} /></button>
    {open && <div className="ai-drawer" role="dialog" aria-label="AI operations assistant">
      <div className="ai-head"><span className="sec-tile-icon" style={{ background: "var(--violet-soft)", color: "var(--violet)" }}><Bot size={18} /></span><div style={{ flex: 1 }}><h3>Operations assistant</h3><p>Explainable · grounded in your workspace data</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={17} /></button></div>
      <div className="ai-messages">{messages.map((m, i) => <div key={i} className={`ai-msg ${m.role === "user" ? "user" : "bot"}`}>{m.text}</div>)}{loading && <div className="ai-msg bot"><LoaderCircle size={13} className="spin" /> Analyzing workspace records…</div>}</div>
      <div className="ai-suggestions">{SUGGESTIONS.map(s => <button key={s} onClick={() => void ask(s)}>{s}</button>)}</div>
      <form className="ai-input" onSubmit={(e: FormEvent) => { e.preventDefault(); void ask(question); }}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about deployments, gates, flags…" aria-label="Ask the assistant" /><Button variant="primary" type="submit" disabled={!question.trim() || loading}><Send size={14} /></Button></form>
    </div>}
  </>;
}

export function DeploymentAiInsight({ deploymentId }: { deploymentId: string }) {
  const [insight, setInsight] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const analyze = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/ai", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ deploymentId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setInsight(data as AiResponse);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  return <div className="ai-insight">
    <h4><Sparkles size={15} /> AI failure analysis <span className="status-badge status-blue" style={{ marginLeft: "auto" }}>Explainable</span></h4>
    {insight ? <>
      <p>{insight.answer}</p>
      <p style={{ fontSize: 10, color: "var(--ink-3)" }}>Confidence {Math.round(insight.confidence * 100)}% · {insight.citations.join(" · ")} · derived only from persisted logs and gate records.</p>
      {insight.actions.length > 0 && <div className="flex-center" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>{insight.actions.map(a => <span key={a} className="flag-pill"><Check size={10} /> {a}</span>)}</div>}
      <button className="text-link" style={{ marginTop: 10 }} onClick={() => setInsight(null)}>Hide analysis</button>
    </> : <>
      <p>Get a grounded root-cause summary from this deployment's logs and security gate results. No external model or data transfer is involved.</p>
      <Button size="small" onClick={analyze} loading={loading}><Sparkles size={12} /> Analyze this deployment</Button>
      {error && <p style={{ marginTop: 8, color: "var(--danger)", fontSize: 10.5 }}><CircleAlert size={11} /> {error}</p>}
    </>}
  </div>;
}
