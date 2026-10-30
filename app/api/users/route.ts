import { HttpError, adminClient, handler, requireUser } from "@/server/supabase";

const ROLES = ["admin", "cap_administrativa", "administrativa", "comercial", "colaborador"] as const;
const clean = (s: unknown, max = 120) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/** List users (admin). */
export const GET = handler(async () => {
  await requireUser({ admin: true });
  const sb = adminClient();
  const { data: profiles, error } = await sb.from("profiles").select("*").order("created_at");
  if (error) throw error;
  const { data: auth } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const last = new Map((auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  return profiles.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, code: p.code, lastSignIn: last.get(p.id) ?? null }));
});

/** Create a user (admin). With password → active immediately; without → Supabase sends an invitation email. */
export const POST = handler(async (req) => {
  await requireUser({ admin: true });
  const b = await req.json();
  const email = clean(b.email).toLowerCase(), name = clean(b.name), password = clean(b.password, 200);
  const role = ROLES.includes(b.role) ? b.role : "comercial";
  const code = clean(b.code, 40).toUpperCase() || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Correu no vàlid");
  if (!name) throw new HttpError(400, "Falta el nom");
  if (password && password.length < 8) throw new HttpError(400, "La contrasenya ha de tenir almenys 8 caràcters");
  if (role === "comercial" && !code) throw new HttpError(400, "Un comercial necessita el seu codi (p. ex. IBETH) per veure els seus contractes");
  const sb = adminClient();
  const origin = new URL(req.url).origin;
  const created = password
    ? await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
    : await sb.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo: origin });
  if (created.error) throw new HttpError(400, created.error.message.includes("already") ? "Ja existeix un usuari amb aquest correu" : created.error.message);
  const id = created.data.user!.id;
  const { error } = await sb.from("profiles").upsert({ id, name, email, role, code });
  if (error) throw error;
  return { id, name, email, role, code, invited: !password };
});

/** Update role / code / name (admin). */
export const PATCH = handler(async (req) => {
  const { profile } = await requireUser({ admin: true });
  const b = await req.json();
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = clean(b.name);
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw new HttpError(400, "Rol no vàlid");
    if (b.id === profile.id && b.role !== "admin") throw new HttpError(400, "No et pots treure a tu mateix el rol d'administrador");
    patch.role = b.role;
  }
  if (b.code !== undefined) patch.code = clean(b.code, 40).toUpperCase() || null;
  const sb = adminClient();
  const { error } = await sb.from("profiles").update(patch).eq("id", clean(b.id, 64));
  if (error) throw error;
  if (b.password) {
    if (String(b.password).length < 8) throw new HttpError(400, "La contrasenya ha de tenir almenys 8 caràcters");
    const r = await sb.auth.admin.updateUserById(clean(b.id, 64), { password: String(b.password) });
    if (r.error) throw new HttpError(400, r.error.message);
  }
  return { ok: true };
});

/** Delete a user (admin). Their history (activities, tasks) is kept. */
export const DELETE = handler(async (req) => {
  const { profile } = await requireUser({ admin: true });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (id === profile.id) throw new HttpError(400, "No pots eliminar el teu propi usuari");
  const r = await adminClient().auth.admin.deleteUser(id);
  if (r.error) throw new HttpError(400, r.error.message);
  return { ok: true };
});
