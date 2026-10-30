import { complete } from "@/server/ai";
import { integrations } from "@/server/env";
import { HttpError, handler, requireUser } from "@/server/supabase";

/**
 * AI endpoint. Context is rebuilt SERVER-SIDE from the database (the client-provided context is ignored for facts),
 * so the model only sees real, permission-checked data.
 */
export const POST = handler(async (req) => {
  const { sb } = await requireUser();
  if (!integrations().ai) throw new HttpError(400, "IA no configurada");
  const b = (await req.json()) as { kind: "analysis" | "message" | "chat"; contractId: string; tone?: string; channel?: string; goal?: string; question?: string; lang?: "ca" | "es" };
  const [{ data: c }, { data: st }, { data: acts }, { data: offers }, { data: docs }] = await Promise.all([
    sb.from("contracts").select("data").eq("id", b.contractId).maybeSingle(),
    sb.from("crm_state").select("data").eq("contract_id", b.contractId).maybeSingle(),
    sb.from("activities").select("type, at, title, body, delivery").eq("contract_id", b.contractId).order("at", { ascending: false }).limit(20),
    sb.from("offers").select("data").eq("verificada", true).gte("valida_hasta", new Date().toISOString().slice(0, 10)),
    sb.from("documents").select("version, created_at, file_name, ahorro_anual").eq("contract_id", b.contractId),
  ]);
  if (!c) throw new HttpError(403, "Sense accés a aquest contracte");
  const d = c.data as Record<string, unknown>;
  const { iban: _drop, ...safe } = d as Record<string, unknown> & { iban?: unknown };
  const context = {
    hoy: new Date().toISOString().slice(0, 10),
    contrato: safe,
    estadoCRM: st?.data ?? { status: d.status },
    historial: acts ?? [],
    propuestasGeneradas: docs ?? [],
    ofertasVerificadas: (offers ?? []).map((o) => o.data).filter((o: { tarifa?: string }) => !d.tarifa || String(o.tarifa).replace(/\W/g, "") === String(d.tarifa).replace(/\W/g, "")),
    comparativa: (docs ?? []).filter((x) => x.ahorro_anual !== null).map((x) => ({ version: x.version, ahorroAnualEUR: x.ahorro_anual })),
  };
  const ctx = "Context JSON:\n```json\n" + JSON.stringify(context).slice(0, 30000) + "\n```\n";
  let prompt: string;
  if (b.kind === "message") {
    prompt = `${ctx}\nRedacta en ${b.lang === "es" ? "castellà" : "català"} un ${b.channel === "email" ? `correu (primera línia «${b.lang === "es" ? "Asunto" : "Assumpte"}: …»)` : "missatge de WhatsApp (màx. 600 caràcters)"} amb to ${b.tone ?? "Professional"} i objectiu «${b.goal ?? "renovació"}». Signa com el comercial assignat d'Assessoria 3.0. Retorna només el text final.`;
  } else if (b.kind === "analysis") {
    prompt = `${ctx}\nResumeix en 2-3 frases: situació de renovació, risc de pèrdua i propera acció recomanada.`;
  } else {
    prompt = `${ctx}\nPregunta del comercial: ${String(b.question ?? "").slice(0, 800)}`;
  }
  return { text: await complete(prompt, b.kind === "message" ? 600 : 800) };
});
