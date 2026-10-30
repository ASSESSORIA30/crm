"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { browserSupabase, supabaseConfigured } from "@/data/browserSupabase";
import { Logo } from "@/ui/components/Shell";
import { Button, Field, Notice } from "@/ui/components/ui";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await browserSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg({ tone: "red", text: "Correu o contrasenya incorrectes." });
    else router.replace("/");
  };
  const magic = async () => {
    if (!email) return setMsg({ tone: "red", text: "Escriu primer el teu correu." });
    setBusy(true);
    const { error } = await browserSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin, shouldCreateUser: false } });
    setBusy(false);
    setMsg(error ? { tone: "red", text: error.message } : { tone: "green", text: "T'hem enviat un enllaç d'accés." });
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-6">
      <form onSubmit={signIn} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
        <Logo />
        <h1 className="pt-2 text-lg font-semibold">Accedeix a les teves renovacions</h1>
        {!supabaseConfigured && <Notice>Supabase no està configurat en aquest desplegament.</Notice>}
        <Field label="Correu electrònic"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Contrasenya"><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button variant="primary" size="lg" className="w-full" disabled={busy || !supabaseConfigured}>{busy && <Loader2 size={15} className="animate-spin" />} Entra</Button>
        <button type="button" onClick={magic} className="w-full text-center text-xs text-muted hover:text-ink">Envia'm un enllaç d'accés per correu</button>
      </form>
    </div>
  );
}
