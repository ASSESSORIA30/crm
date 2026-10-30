import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Configuration diagnostics. Public on purpose (needed before login works) and therefore returns
 * ONLY booleans and short status messages — never secrets or client data.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  const set = (k: string, ok: boolean, detail: string) => (checks[k] = { ok, detail });

  // --- Supabase
  const hasSb = !!(env.supabaseUrl && env.supabaseAnon);
  set("supabase_env", hasSb && !!env.supabaseService, !hasSb ? "Falten NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY" : !env.supabaseService ? "Falta SUPABASE_SERVICE_ROLE_KEY" : "Variables presents");
  if (hasSb && env.supabaseService) {
    try {
      // same client and key handling as the sync job (works with legacy JWT keys and new sb_secret_ keys)
      const { adminClient } = await import("@/server/supabase");
      const sb = adminClient();
      const t = await sb.from("contracts").select("id", { count: "exact", head: true });
      if (t.error) {
        const missing = /does not exist|schema cache|not find/i.test(t.error.message);
        set("supabase_schema", false, missing ? "Les taules no existeixen: executa supabase/migrations/001_init.sql" : `Error de Supabase: ${t.error.message.slice(0, 120)}`);
      } else {
        set("supabase_schema", true, `Taules creades · ${t.count ?? 0} contractes`);
        const a2 = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        const admins = a2.count ?? 0;
        set("supabase_admin", admins > 0, admins > 0 ? `${admins} administrador(s)` : "No hi ha usuaris: crea el primer a Supabase → Authentication (serà administrador)");
      }
    } catch (e) {
      set("supabase_schema", false, `No s'ha pogut connectar amb Supabase (${e instanceof Error ? e.message : e})`);
    }
  }

  // --- Google
  if (!env.googleSa) set("google", false, "Falta GOOGLE_SERVICE_ACCOUNT_JSON");
  else if (!env.crmFileId && !process.env.SOURCE_CRM_FOLDER_ID) set("google", false, "Falta SOURCE_CRM_FILE_ID o SOURCE_CRM_FOLDER_ID");
  else {
    try {
      const creds = JSON.parse(env.googleSa);
      const { readDriveMeta } = await import("@/server/google");
      const files: string[] = [];
      for (const [label, id] of [["CRM", env.crmFileId], ["registre diari", env.diarioFileId]] as const) {
        if (!id) continue;
        try { files.push(`${label}: ${(await readDriveMeta(id)).name}`); }
        catch (e) { throw new Error(`Sense accés al fitxer ${label}. Comparteix-lo amb ${creds.client_email} (${e instanceof Error ? e.message.slice(0, 80) : e})`); }
      }
      if (process.env.SOURCE_CRM_FOLDER_ID) {
        const { latestInFolder } = await import("@/server/google");
        const f = await latestInFolder(process.env.SOURCE_CRM_FOLDER_ID, process.env.SOURCE_CRM_PREFIX ?? "Contratos_");
        files.push(f ? `Última exportació del CRM a la carpeta: ${f.name}` : "No hi ha fitxers «Contratos_…» a la carpeta");
      }
      set("google", true, files.join(" · ") || "Credencials vàlides");
    } catch (e) {
      set("google", false, e instanceof SyntaxError ? "GOOGLE_SERVICE_ACCOUNT_JSON no és un JSON vàlid" : e instanceof Error ? e.message : String(e));
    }
  }

  // --- SMTP
  set("smtp", !!(env.smtpHost && env.smtpUser && env.smtpPass), env.smtpHost && env.smtpUser && env.smtpPass ? `Servidor ${env.smtpHost}:${env.smtpPort}` : "Falten SMTP_HOST / SMTP_USER / SMTP_PASS");

  // --- AI (validates the key with a free models request)
  if (!env.anthropicKey) set("ai", false, "Falta ANTHROPIC_API_KEY");
  else {
    try {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": env.anthropicKey, "anthropic-version": "2023-06-01" }, cache: "no-store" });
      set("ai", r.ok, r.ok ? `Clau vàlida · model ${env.anthropicModel}` : r.status === 401 ? "La clau ANTHROPIC_API_KEY no és vàlida" : `El proveïdor ha respost ${r.status}`);
    } catch (e) {
      set("ai", false, `No s'ha pogut contactar amb el proveïdor d'IA (${e instanceof Error ? e.message : e})`);
    }
  }
  set("cron", !!env.cronSecret, env.cronSecret ? "CRON_SECRET definit" : "Falta CRON_SECRET (la sincronització diària automàtica no s'executarà)");
  return Response.json({ checks, at: new Date().toISOString() });
}
