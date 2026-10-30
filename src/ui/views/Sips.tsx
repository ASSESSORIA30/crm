"use client";
import { useMemo, useState } from "react";
import { Zap, Search, RefreshCw, AlertCircle } from "lucide-react";
import { useApp } from "@/data/store";
import { isElectricCups, normalizedCups, type SipsEntry } from "@/core/sips";
import { useRefreshSips, useSips } from "../useSips";

export function SipsView() {
  const { contracts, open, snap } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [failure, setFailure] = useState("");
  const { refresh, busy, entry: updated } = useRefreshSips();
  const cached = useSips(selected);
  const entry: SipsEntry | null = updated?.cups === normalizedCups(selected) ? updated : cached;
  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length < 2) return [];
    return contracts.filter(c => (c.cups ?? "").toUpperCase().includes(q) || (c.cliente ?? "").toUpperCase().includes(q)).slice(0, 15);
  }, [contracts, query]);
  const chosen = contracts.find(c => normalizedCups(c.cups) === normalizedCups(selected));
  const lookup = async () => {
    setFailure("");
    if (!isElectricCups(selected)) { setFailure("Introdueix un CUPS elèctric vàlid (20 o 22 caràcters)."); return; }
    if (!chosen) { setFailure("Per seguretat, només es poden consultar CUPS que consten als contractes visibles del CRM."); return; }
    try { await refresh(selected); } catch(e) { setFailure(e instanceof Error ? e.message : "No s'ha pogut consultar el SIPS"); }
  };
  return <div className="mx-auto max-w-5xl space-y-5 p-5 sm:p-8">
    <div><h2 className="flex items-center gap-2 text-2xl font-bold"><Zap size={24} /> Buscador CUPS · SIPS</h2><p className="mt-1 text-sm text-muted">Consulta els consums reals dels subministraments elèctrics del CRM. Accepta CUPS sense el sufix final i majúscules o minúscules.</p></div>
    <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
      <label htmlFor="sips-search" className="text-sm font-semibold">CUPS o nom del client</label>
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-muted"/><input id="sips-search" className="input h-10 w-full pl-9" value={query} placeholder="ES0021... o nom del client" onChange={e => {setQuery(e.target.value);setSelected(e.target.value);setFailure("");}} /></div><button type="button" className="rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-surface disabled:opacity-50" disabled={busy || !snap} onClick={lookup}>{busy ? "Consultant…" : "Consultar SIPS"}</button></div>
      {matches.length > 0 && <div className="max-h-48 overflow-y-auto rounded-lg border border-line">{matches.map(c => <button type="button" key={c.id} onClick={() => {setQuery(c.cups ?? "");setSelected(c.cups ?? "");setFailure("");}} className="block w-full border-b border-line px-3 py-2 text-left text-xs hover:bg-ink/5"><span className="font-semibold">{c.cliente}</span><span className="ml-2 text-muted">{c.cups}</span></button>)}</div>}
      {failure && <p className="flex items-center gap-2 text-sm text-red-600"><AlertCircle size={16}/>{failure}</p>}
      {chosen && <p className="text-xs text-muted">Contracte: {chosen.cliente} · {chosen.cups} <button className="ml-2 underline" onClick={() => open(chosen.id)}>Obrir fitxa</button></p>}
    </div>
    {entry && chosen && <div className="rounded-xl border border-line bg-surface p-5 space-y-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Resultat SIPS</h3><span className="text-xs text-muted">{entry.status === "found" ? "Dades recuperades" : entry.status === "not_found" ? "Sense resultats" : "Error"}</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-elevated p-4"><p className="text-xs text-muted">Consum anual</p><p className="mt-1 text-2xl font-bold">{entry.annual_kwh == null ? "—" : `${entry.annual_kwh.toLocaleString("ca-ES")} kWh`}</p></div><div className="rounded-lg bg-elevated p-4"><p className="text-xs text-muted">Tarifa</p><p className="mt-1 text-lg font-semibold">{entry.tariff ?? "—"}</p></div><div className="rounded-lg bg-elevated p-4"><p className="text-xs text-muted">Última consulta</p><p className="mt-1 text-sm font-semibold">{new Date(entry.consulted_at).toLocaleString("ca-ES")}</p></div></div>
      <p className="text-sm text-muted">{entry.address ?? "Adreça no disponible"}</p>{entry.error && <p className="text-sm text-red-600">{entry.error}</p>}
      <button type="button" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-elevated" onClick={lookup} disabled={busy}><RefreshCw size={15}/> Actualitzar dades SIPS</button>
    </div>}
    <p className="text-xs text-muted">Aquesta vista consulta els CUPS dels contractes als quals tens accés. La cerca general per carrer o codi postal del portal SIPS encara no està integrada en aquesta pantalla.</p>
  </div>;
}
