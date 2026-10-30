"use client";
import { useMemo, useState } from "react";
import { FileSpreadsheet, Pencil, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { addDays, fmtDate, today } from "@/core/dates";
import { periodsFor } from "@/core/compare";
import { parseOffersTemplate, sameOffer, type OfferImportResult } from "@/core/offersTemplate";
import type { Offer } from "@/core/types";
import { uid } from "@/data/defaults";
import { isStaff } from "@/core/roles";
import { useApp } from "@/data/store";
import { Badge, Button, Empty, Field, Modal, Notice, SupplierMark, cn } from "../components/ui";

const TARIFAS = ["2.0TD", "3.0TD", "6.1TD", "RL1", "RL2", "RL3", "RL4", "RL5", "RL6"];
const COMERS = ["Naturgy", "Iberdrola", "NIBA", "Gana Energía", "Repsol", "Endesa", "Nufri", "CHC", "Altres"];
/** "No expiry" sentinel. */
export const NO_EXPIRY = "9999-12-31";

export function OfertasView() {
  const { snap, deleteOffer } = useApp();
  const [edit, setEdit] = useState<Offer | null>(null);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const isAdmin = isStaff(snap!.me.role);
  const offers = snap!.offers;
  const blank = (): Offer => ({ id: uid(), comercializadora: "Naturgy", nombre: "", tarifa: "2.0TD", energia: [null, null, null], potencia: [null, null], cuotaFijaMes: null, validaHasta: NO_EXPIRY, verificada: true, ventajas: [], tipo: "luz" });
  const shown = offers
    .filter((o) => !q || `${o.comercializadora} ${o.tarifa} ${o.nombre}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.comercializadora.localeCompare(b.comercializadora) || a.tarifa.localeCompare(b.tarifa) || a.nombre.localeCompare(b.nombre));
  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ofertes</h2>
          <p className="max-w-2xl text-[12.5px] text-muted">Les propostes PDF fan servir les ofertes d'aquesta llista. Puja la plantilla de comercialitzadores: les ofertes queden disponibles de seguida i, si una oferta ja existeix amb el mateix nom (mateixa comercialitzadora i tarifa), se substitueix.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setImporting(true)}><Upload size={15} /> Puja la plantilla Excel</Button>
            <Button onClick={() => setEdit(blank())}><Plus size={15} /> Oferta manual</Button>
          </div>
        )}
      </div>
      {offers.length > 6 && <input className="input mb-3 max-w-sm" placeholder="Filtra per comercialitzadora, tarifa o producte…" value={q} onChange={(e) => setQ(e.target.value)} />}
      {offers.length === 0 ? (
        <Empty icon={<ShieldCheck size={24} />} title="Encara no hi ha ofertes" body="Puja la plantilla de comercialitzadores per poder generar propostes amb l'estalvi calculat." action={isAdmin ? <Button variant="primary" size="sm" onClick={() => setImporting(true)}><Upload size={13} /> Puja la plantilla</Button> : undefined} />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {shown.map((o) => {
            const vigente = o.validaHasta >= today();
            return (
              <div key={o.id} className={cn("flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5", (!vigente || !o.verificada) && "opacity-60")}>
                <SupplierMark name={o.comercializadora} size={32} />
                <div className="min-w-0 flex-1 text-[12.5px]">
                  <p className="font-semibold">{o.comercializadora} · {o.nombre || "Sense nom"}</p>
                  <p className="text-muted">Tarifa {o.tarifa} · energia {o.energia.filter((v) => v != null).join(" / ")} €/kWh{o.potencia.some((v) => v != null) ? ` · potència ${o.potencia.filter((v) => v != null).join(" / ")} €/kW·dia` : ""}{o.fijoDia != null ? ` · fix ${o.fijoDia} €/dia` : ""}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {!o.verificada && <Badge tone="amber">No disponible</Badge>}
                    {o.validaHasta < NO_EXPIRY && <Badge tone={vigente ? "zinc" : "red"}>{vigente ? `Fins al ${fmtDate(o.validaHasta)}` : "Caducada"}</Badge>}
                    {o.meta?.tipoPrecio && <Badge tone={/index/i.test(o.meta.tipoPrecio) ? "violet" : "blue"}>{o.meta.tipoPrecio}</Badge>}
                    {o.meta?.ambito && o.meta.ambito !== "Total" && <Badge>{o.meta.ambito}</Badge>}
                    {o.meta?.dual && <Badge>Dual</Badge>}
                    {o.meta?.origen === "plantilla" && <Badge tone="zinc">Plantilla</Badge>}
                  </div>
                </div>
                {isAdmin && <div className="flex gap-0.5"><Button size="sm" variant="ghost" onClick={() => setEdit(o)} aria-label="Edita"><Pencil size={13} /></Button><Button size="sm" variant="ghost" onClick={() => deleteOffer(o.id)} aria-label="Elimina"><Trash2 size={13} /></Button></div>}
              </div>
            );
          })}
        </div>
      )}
      {edit && <OfferEditor o={edit} onClose={() => setEdit(null)} />}
      {importing && <OfferImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function OfferEditor({ o, onClose }: { o: Offer; onClose: () => void }) {
  const { saveOffer, snap } = useApp();
  const [v, setV] = useState<Offer>(o);
  const [caduca, setCaduca] = useState(o.validaHasta < NO_EXPIRY);
  const per = periodsFor(v.tarifa);
  const setTarifa = (t: string) => {
    const p = periodsFor(t);
    setV({ ...v, tarifa: t, tipo: p.gas ? "gas" : "luz", energia: Array.from({ length: p.energy }, (_, i) => v.energia[i] ?? null), potencia: Array.from({ length: p.power }, (_, i) => v.potencia[i] ?? null) });
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const complete = v.nombre.trim() && v.energia.slice(0, per.energy).every((x) => x != null) && v.potencia.slice(0, per.power).every((x) => x != null);
  const replaces = snap!.offers.find((x) => x.id !== v.id && sameOffer(x, v));
  return (
    <Modal open onClose={onClose} width="max-w-2xl" title={o.nombre ? `Edita ${o.nombre}` : "Nova oferta"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel·la</Button><Button variant="primary" disabled={!complete} onClick={async () => { try { await saveOffer({ ...v, validaHasta: caduca ? v.validaHasta : NO_EXPIRY, verificadaPor: snap!.me.name }); onClose(); } catch (e) { useApp.getState().toast({ title: "No s'ha pogut desar l'oferta", body: e instanceof Error ? e.message : String(e), tone: "err" }); } }}>Desa l'oferta</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Comercialitzadora">
          <input className="input" list="comers" value={v.comercializadora} onChange={(e) => setV({ ...v, comercializadora: e.target.value })} />
          <datalist id="comers">{COMERS.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Nom de l'oferta"><input className="input" value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} placeholder="Ex.: Tarifa Per Ús Llum" /></Field>
        <Field label="Tarifa d'accés"><select className="input" value={v.tarifa} onChange={(e) => setTarifa(e.target.value)}>{TARIFAS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted"><input type="checkbox" checked={caduca} onChange={(e) => setCaduca(e.target.checked)} /> Té data de caducitat</label>
          <input type="date" className="input" disabled={!caduca} value={caduca && v.validaHasta < NO_EXPIRY ? v.validaHasta : addDays(today(), 30)} onChange={(e) => setV({ ...v, validaHasta: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <span className="label">{per.gas ? "Terme variable (€/kWh)" : "Preu d'energia (€/kWh) per període"}</span>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">{v.energia.map((x, i) => <input key={`${v.tarifa}-e${i}`} className="input tnum" placeholder={`P${i + 1}`} defaultValue={x ?? ""} onChange={(e) => { const a = [...v.energia]; a[i] = num(e.target.value); setV({ ...v, energia: a }); }} />)}</div>
        </div>
        {per.power > 0 && (
          <div className="sm:col-span-2">
            <span className="label">Preu de potència (€/kW·dia) per període</span>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">{v.potencia.map((x, i) => <input key={`${v.tarifa}-p${i}`} className="input tnum" placeholder={`P${i + 1}`} defaultValue={x ?? ""} onChange={(e) => { const a = [...v.potencia]; a[i] = num(e.target.value); setV({ ...v, potencia: a }); }} />)}</div>
          </div>
        )}
        {per.gas
          ? <Field label="Terme fix (€/dia)"><input className="input tnum" defaultValue={v.fijoDia ?? ""} onChange={(e) => setV({ ...v, fijoDia: num(e.target.value) })} /></Field>
          : <Field label="Quota fixa (€/mes), si n'hi ha"><input className="input tnum" defaultValue={v.cuotaFijaMes ?? ""} onChange={(e) => setV({ ...v, cuotaFijaMes: num(e.target.value) })} /></Field>}
        <Field label="Avantatges (un per línia)"><textarea className="input min-h-[70px]" defaultValue={(v.ventajas ?? []).join("\n")} onChange={(e) => setV({ ...v, ventajas: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></Field>
        <Field label="Notes internes"><input className="input" defaultValue={v.notas ?? ""} onChange={(e) => setV({ ...v, notas: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2">
          <input type="checkbox" checked={v.verificada} onChange={(e) => setV({ ...v, verificada: e.target.checked })} /> Disponible per a propostes
        </label>
        {replaces && <div className="sm:col-span-2"><Notice tone="blue">Ja hi ha una oferta «{replaces.nombre}» de {replaces.comercializadora} per a {replaces.tarifa}: en desar, aquesta la substituirà.</Notice></div>}
        {!complete && <div className="sm:col-span-2"><Notice>Completa el nom i tots els preus dels períodes de la tarifa {v.tarifa}.</Notice></div>}
      </div>
    </Modal>
  );
}

function OfferImport({ onClose }: { onClose: () => void }) {
  const { snap, saveOffer, toast } = useApp();
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [caduca, setCaduca] = useState(false);
  const [valida, setValida] = useState(addDays(today(), 30));
  const [busy, setBusy] = useState(false);
  const { res, err } = useMemo((): { res: OfferImportResult | null; err: string | null } => {
    if (!rows) return { res: null, err: null };
    try { return { res: parseOffersTemplate(rows, { validaHasta: caduca ? valida : NO_EXPIRY, verificadaPor: snap!.me.name }), err: null }; }
    catch (e) { return { res: null, err: e instanceof Error ? e.message : String(e) }; }
  }, [rows, valida, caduca, snap]);
  const substitueix = res ? res.offers.filter((o) => snap!.offers.some((x) => x.id === o.id || sameOffer(x, o))).length : 0;
  const nuevas = (res?.offers.length ?? 0) - substitueix;
  const load = async (f?: File) => {
    if (!f) return;
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    const name = wb.SheetNames.find((n) => /producto/i.test(n)) ?? wb.SheetNames[0];
    setRows(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][]);
    setFile(f.name);
  };
  const run = async () => {
    if (!res) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const o of res.offers) {
        const prev = useApp.getState().snap!.offers.find((x) => x.id === o.id || sameOffer(x, o));
        await saveOffer({ ...o, ventajas: prev?.ventajas ?? [], notas: prev?.notas ?? o.notas });
        ok++;
      }
      toast({ title: "Ofertes importades i disponibles", body: `${nuevas} noves · ${substitueix} substituïdes${res.skipped.length ? ` · ${res.skipped.length} files omeses` : ""}`, tone: "ok" });
      onClose();
    } catch (e) {
      toast({ title: `S'han importat ${ok} de ${res.offers.length} ofertes`, body: `Error en desar: ${e instanceof Error ? e.message : String(e)}`, tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} width="max-w-2xl" title="Puja la plantilla d'ofertes"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel·la</Button><Button variant="primary" disabled={!res || !res.offers.length || busy} onClick={run}><Upload size={14} /> Importa {res?.offers.length ?? 0} ofertes</Button></>}>
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted">Fes servir la plantilla de comercialitzadores (full «Productos»). S'importen les files d'Electricitat, Gas i Dual i queden disponibles de seguida. Si ja hi ha una oferta amb el mateix nom, comercialitzadora i tarifa, se substitueix per la nova.</p>
        <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 hover:border-brand", file ? "border-brand/50 bg-brand/[0.04]" : "border-line")}>
          <FileSpreadsheet size={22} className={file ? "text-brand" : "text-muted"} />
          <div className="text-[12.5px]"><p className="font-medium">Plantilla d'ofertes (.xlsx)</p><p className="text-muted">{file ?? "Tria un fitxer"}</p></div>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
        </label>
        {err && <Notice tone="red">{err}</Notice>}
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={caduca} onChange={(e) => setCaduca(e.target.checked)} /> Les ofertes caduquen el</label>
          <input type="date" className="input h-8 w-auto py-0" disabled={!caduca} value={valida} onChange={(e) => setValida(e.target.value)} />
          {!caduca && <span className="text-muted">Sense caducitat: es mantenen fins que pugis una plantilla nova.</span>}
        </div>
        {res && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <Badge tone="green">{nuevas} noves</Badge><Badge tone="blue">{substitueix} substituïdes</Badge>{res.skipped.length > 0 && <Badge tone="amber">{res.skipped.length} files omeses</Badge>}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-elevated text-left text-muted"><tr><th className="px-2 py-1.5">Comercialitzadora</th><th className="px-2">Producte</th><th className="px-2">Tarifa</th><th className="px-2">Energia €/kWh</th><th className="px-2">Preu</th></tr></thead>
                <tbody>{res.offers.map((o) => (
                  <tr key={o.id} className="border-t border-line/60"><td className="px-2 py-1">{o.comercializadora}</td><td className="px-2">{o.nombre}</td><td className="px-2">{o.tarifa}</td><td className="px-2 tnum">{o.energia.join(" / ")}</td><td className="px-2">{o.meta?.tipoPrecio ?? "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {res.skipped.length > 0 && <details className="text-[12px]"><summary className="cursor-pointer text-muted">Mostra les files omeses</summary><ul className="mt-1 space-y-0.5">{res.skipped.map((x, i) => <li key={i}>Fila {x.row} · {x.label}: <span className="text-muted">{x.reason}</span></li>)}</ul></details>}
            {res.warnings.map((w, i) => <Notice key={i}>Fila {w.row}: {w.message}</Notice>)}
          </div>
        )}
      </div>
    </Modal>
  );
}
