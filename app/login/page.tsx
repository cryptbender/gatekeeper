"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { getSupabase, hasSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => { if (!hasSupabase) router.replace("/dashboard"); }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null); setBusy(true);
    try {
      const sb = getSupabase();
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) router.replace("/dashboard");
        else setInfo("Account created. Check your email to confirm, then sign in.");
      }
    } catch (ex) { setErr(ex instanceof Error ? ex.message : "Authentication failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <Card className="p-6 shadow-pop">
          <h1 className="text-lg font-semibold tracking-tight">{mode === "in" ? "Sign in" : "Create account"}</h1>
          <p className="mb-5 mt-1 text-sm text-muted">{mode === "in" ? "Organizer and gate staff sign in here." : "Organizer account for managing events."}</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            {info && <p className="text-sm text-ok">{info}</p>}
            <Button type="submit" variant="primary" className="w-full" size="lg" loading={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
          </form>
          <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); setInfo(null); }} className="mt-4 w-full text-center text-sm text-muted hover:text-ink">
            {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
          </button>
        </Card>
      </div>
    </div>
  );
}
