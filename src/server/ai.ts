import "server-only";
import { env } from "./env";

export const SYSTEM = `Ets l'assistent comercial d'Assessoria 3.0, una assessoria energètica de Lleida (des del 2013).
Ajudes els comercials a renovar contractes de llum i gas.
Regles estrictes:
- Fes servir EXCLUSIVAMENT les dades del context JSON. Si falta una dada, digues-ho i suggereix com obtenir-la.
- No inventis MAI preus, percentatges d'estalvi, ofertes, descomptes ni condicions contractuals.
- Només esmenta estalvis si el context inclou un càlcul amb dades contrastades (camp "comparativa").
- Només pots citar ofertes que apareguin a "ofertasVerificadas".
- Respon al comercial en català, breu i accionable. Als missatges per al client, tracta'l de vostè i fes servir l'idioma que se t'indiqui.`;

export async function complete(user: string, maxTokens = 700): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.anthropicModel, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Proveïdor d'IA: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { content: { type: string; text?: string }[] };
  return j.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
