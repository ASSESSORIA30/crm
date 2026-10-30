import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Supabase client acting AS THE LOGGED-IN USER (RLS applies). */
export async function userClient() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a Server Component */ } },
    },
  });
}

/** Service-role client: bypasses RLS. Only for the sync job. Never expose to the browser. */
export function adminClient() {
  return createClient(env.supabaseUrl, env.supabaseService, { auth: { persistSession: false } });
}

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function requireUser(opts: { admin?: boolean; staff?: boolean } = {}) {
  const sb = await userClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new HttpError(401, "No has iniciat sessió");
  const { data: profile } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
  if (!profile) throw new HttpError(403, "Usuari sense perfil");
  if (opts.admin && profile.role !== "admin") throw new HttpError(403, "Només per a administradors");
  if (opts.staff && !["admin", "cap_administrativa", "administrativa"].includes(profile.role)) throw new HttpError(403, "Només per a l'equip d'administració");
  return { sb, user: data.user, profile: profile as { id: string; name: string; email: string; role: import("@/core/types").Role; code: string | null } };
}

/** Wrap a route handler: JSON errors, no stack traces leaked. */
export function handler<T>(fn: (req: Request) => Promise<T>) {
  return async (req: Request) => {
    try {
      return Response.json(await fn(req));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Error" }, { status });
    }
  };
}
