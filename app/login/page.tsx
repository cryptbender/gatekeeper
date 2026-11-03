"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { getSupabase, hasSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!hasSupabase) { router.replace("/dashboard"); return; }
    setDenied(new URLSearchParams(window.location.search).get("denied") === "1");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setDenied(false); setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace("/dashboard");
    } catch (ex) {
      const m = ex instanceof Error ? ex.message : "Sign-in failed";
      setErr(/invalid login/i.test(m) ? "Incorrect email or password." : m);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <Card className="p-6 shadow-pop">
          <h1 className="text-lg font-semibold tracking-tight">Admin sign in</h1>
          <p className="mb-5 mt-1 text-sm text-muted">Sign in to manage guests, scan and view live data.</p>

          {denied && (
            <div role="alert" className="mb-4 flex gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px] text-warn">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />This account does not have access. Please contact the organizer.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="primary" className="w-full" size="lg" loading={busy}>Sign in</Button>
          </form>

          {showContact ? (
            <div className="mt-4 flex gap-2.5 rounded-xl border bg-subtle px-3 py-3 text-[13px]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>New accounts can’t be created here. <span className="font-medium">Please contact the organizer</span> to get access.</p>
            </div>
          ) : (
            <button onClick={() => setShowContact(true)} className="mt-4 w-full text-center text-sm text-muted hover:text-ink">No account? Create one</button>
          )}
        </Card>
      </div>
    </div>
  );
}
