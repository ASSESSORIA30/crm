"use client";
import { useSips, useRefreshSips } from "../useSips";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileText, Mail, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { compare, fmtEUR, fmtN, periodsFor, type PriceSet } from "@/core/compare";
import { today } from "@/core/dates";
import { sameTariff } from "@/core/insights";
import { buildProposalPdf } from "@/core/pdf";
import { consumption } from "@/core/priority";
import { titleCase } from "@/core/templates";
import type { Offer, ProposalDoc } from "@/core/types";
import { useApp } from "@/data/store";
import { Badge, Button, Empty, Modal, Notice, SupplierMark, cn } from "./ui";

const BRANDS = ["Naturgy", "Iberdrola", "NIBA", "Gana Energía", "Repsol"];

export function ProposalWizard() {
  const { proposalFor, set, byId, snap, addDoc, repo, toast, integrations } = useApp();
  const c = proposalFor ? byId[proposalFor] : null;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [brand, setBrand] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [kwh, setKwh] = useState<string[]>([]);
  const [kw, setKw] = useState<string[]>([]);
  const [actual, setActual] = useState<{ e: string[]; p: string[]; fijo: string }>({ e: [], p: [], fijo: "" });
  const [doc, setDoc] = useState<ProposalDoc | null>(null);

  const sips = useSips(c?.tipo === "luz" ? c.cups : null);
  const {refresh:refreshSips,busy:sipsBusy,entry:latestSips}=useRefreshSips();
  const availableSips = latestSips ?? sips;
  const per = periodsFor(c?.tarifa);
  useEffect(() => {
    if (!c) return;
    setStep(1); setBrand(null); setOfferId(null); setDoc(null);
    const total = consumption(c);
    setKwh(Array.from({ length: per.energy }, (_, i) => (per.energy === 1 && i === 0 && total ? String(Math.round(total)) : "")));
    setKw(Array.from({ length: per.power }, (_, i) => (c.potencias?.[i] ?? (i < 2 ? c.potencia : null))?.toString() ?? ""));
    setActual({ e: Array(per.energy).fill(""), p: Array(per.power).fill(""), fijo: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalFor]);

  useEffect(()=>{
    if(!c || per.energy!==1 || consumption(c)!=null || !availableSips || availableSips.status!=="found" || availableSips.annual_kwh==null)return;
    setKwh(prev=>prev[0] ? prev : [String(Math.round(availableSips.annual_kwh!))]);
  },[c?.id,availableSips,per.energy]);

  const offers = useMemo(() => (snap?.offers ?? []).filter((o) => o.verificada && o.validaHasta >= today()), [snap?.offers]);
  const [lang, setLang] = useState<"ca" | "es">("ca");
  const matching = offers.filter((o) => sameTariff(o.tarifa, c?.tarifa));
  const shown = matching.filter((o) => !brand || (brand === "Altres" ? !BRANDS.some((b) => o.comercializadora.toLowerCase().startsWith(b.toLowerCase().split(" ")[0])) : o.comercializadora.toLowerCase().startsWith(brand.toLowerCase().split(" ")[0])));
  const offer = offers.find((o) => o.id === offerId) ?? null;

  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const actualSet: PriceSet = per.gas ? { energia: actual.e.map(n), potencia: [], fijoDia: n(actual.fijo) } : { energia: actual.e.map(n), potencia: actual.p.map(n), cuotaFijaMes: n(actual.fijo) };
  const result = useMemo(() => (c && offer && snap ? compare({ tarifa: c.tarifa, kwhPorPeriodo: kwh.map(n), kwPorPeriodo: kw.map(n), actual: actualSet, propuesta: offer, settings: snap.settings, lang }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, offer, kwh, kw, actual, snap?.settings, lang]);

  if (!c || !snap) return <Modal open={false} onClose={() => {}} title="">{null}</Modal>;
  const close = () => set("proposalFor", null);
  const version = snap.docs.filter((d) => d.contractId === c.id).length + 1;

  const generate = async () => {
    if (!offer || !result?.ok) return;
    const { blob, fileName } = buildProposalPdf({ contract: c, offer, result, actualPrices: actualSet, settings: snap.settings, comercial: titleCase(c.comercial !== "SIN ASIGNAR" ? c.comercial : snap.me.name), version, logoDataUrl: snap.settings.logo ?? null, lang });
    const saved = await addDoc({ contractId: c.id, version, offerId: offer.id, fileName, ahorroAnual: Math.round(result.ahorro * 100) / 100 }, blob);
    setDoc(saved);
    setStep(3);
    toast({ title: "Proposta generada", body: `${fileName} desada a la fitxa`, tone: "ok" });
  };
  const download = async () => {
    if (!doc) return;
    const url = await repo!.getDocUrl(doc);
    if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = doc.fileName; a.click();
  };

  return (
    <Modal open={!!proposalFor} onClose={close} width="max-w-3xl" title={<span className="flex items-center gap-2"><FileText size={16} className="text-brand" />Proposta de renovació · {titleCase(c.cliente)}</span>}
      footer={
        step === 1 ? <Button variant="primary" disabled={!offer} onClick={() => setStep(2)}>Continua</Button> :
        step === 2 ? <><Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={14} /> Oferta</Button><Button variant="primary" disabled={!result?.ok} onClick={generate}><FileText size={14} /> Genera el PDF</Button></> :
        <><Button variant="ghost" onClick={() => { setStep(2); setDoc(null); }}><RefreshCw size={14} /> Modifica i regenera</Button><Button onClick={download}><Download size={14} /> Descarrega</Button>
          <Button variant="primary" disabled={!c.email && !c.crm.emailOverride} onClick={() => { close(); set("composer", { contractId: c.id, channel: "email", templateId: "t2", attachDocId: doc!.id }); }}><Mail size={14} /> Envia per correu</Button></>
      }>
      <ol className="mb-4 flex gap-2 text-[12px]">
        {["Comercialitzadora i oferta", "Dades i comparació", "PDF i enviament"].map((s, i) => (
          <li key={s} className={cn("flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5", step === i + 1 ? "border-brand bg-brand/5 font-medium text-brand" : step > i + 1 ? "border-line text-ink" : "border-line text-muted")}>
            {step > i + 1 ? <CheckCircle2 size={14} className="text-ren" /> : <span className="tnum">{i + 1}</span>} {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[null, ...BRANDS, "Altres"].map((b) => (
              <button key={b ?? "all"} onClick={() => setBrand(b)} className={cn("pressable flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]", brand === b ? "border-brand bg-brand/10 font-medium text-brand" : "border-line hover:border-ink/25")}>
                {b && b !== "Altres" && <SupplierMark name={b} size={16} />}{b ?? "Totes"}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted">Tarifa del client: <b className="text-ink">{c.tarifa ?? "sense tarifa"}</b> · Comercialitzadora actual: <b className="text-ink">{c.comercializadora ?? "—"}</b></p>
          {matching.length === 0 ? (
            <Empty icon={<ShieldCheck size={22} />} title={`No hi ha ofertes disponibles per a ${c.tarifa ?? "aquesta tarifa"}`}
              body="Els preus de les propostes surten de les ofertes registrades. Importa la plantilla o registra l'oferta a «Ofertes»."
              action={<Button variant="primary" size="sm" onClick={() => { close(); useApp.getState().open(null); set("view", "propuestas"); }}>Registra una oferta</Button>} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {shown.map((o) => <OfferCard key={o.id} o={o} selected={o.id === offerId} onClick={() => setOfferId(o.id)} />)}
              {shown.length === 0 && <p className="text-xs text-muted">No hi ha ofertes d'aquesta comercialitzadora per a aquesta tarifa.</p>}
            </div>
          )}
        </div>
      )}

      {step === 2 && offer && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted">Idioma del PDF:</span>
            {(["ca", "es"] as const).map((l) => <button key={l} onClick={() => setLang(l)} className={cn("pressable rounded-full border px-2.5 py-1", lang === l ? "border-brand bg-brand/10 font-medium text-brand" : "border-line hover:border-ink/25")}>{l === "ca" ? "Català" : "Castellano"}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {c.tipo === "luz" && <div className="rounded-lg border border-line bg-elevated/60 p-3 text-xs">
              <div className="flex items-center justify-between gap-2"><strong>Consum SIPS</strong><button type="button" className="text-brand underline disabled:opacity-40" disabled={!c.cups || sipsBusy} onClick={()=>{if(c.cups)void refreshSips(c.cups).catch(e=>toast({title:"Error SIPS",body:String(e),tone:"err"}))}}>{sipsBusy ? "Consultant..." : "Actualitza SIPS"}</button></div>
              <p className="mt-1">{availableSips?.status==="found" ? `${availableSips.annual_kwh?.toLocaleString("ca-ES") ?? "Sense dada"} kWh/any · ${availableSips.tariff||"Tarifa desconeguda"}` : availableSips?.status === "error" ? "Error en la consulta SIPS" : "Sense dades SIPS guardades"}</p>
              {per.energy>1 && <p className="mt-1 text-amber-600">SIPS proporciona el total anual, no el repartiment P1–P6. Introdueix els períodes de la factura per calcular l'estalvi.</p>}
            </div>}
            <PeriodInputs title="Consum anual per període (kWh)" values={kwh} onChange={setKwh} hint={consumption(c) ? `Total registrat: ${fmtN(consumption(c)!)} kWh. Reparteix-lo segons la factura.` : "No hi ha consum registrat: copia'l de la factura."} />
            {per.power > 0 && <PeriodInputs title="Potència contractada (kW)" values={kw} onChange={setKw} />}
            <PeriodInputs title="Preu energia actual (€/kWh)" values={actual.e} onChange={(e) => setActual({ ...actual, e })} hint="Copia'l de l'última factura del client." step="0.000001" />
            {per.power > 0 && <PeriodInputs title="Preu potència actual (€/kW·dia)" values={actual.p} onChange={(p) => setActual({ ...actual, p })} step="0.000001" />}
            {per.gas ? <PeriodInputs title="Terme fix actual (€/dia)" values={[actual.fijo]} onChange={([fijo]) => setActual({ ...actual, fijo })} step="0.000001" />
              : offer.cuotaFijaMes ? <PeriodInputs title="Quota fixa actual (€/mes)" values={[actual.fijo]} onChange={([fijo]) => setActual({ ...actual, fijo })} /> : null}
          </div>
          {rangeWarnings(offer, c).map((w) => <Notice key={w} tone="blue">{w}</Notice>)}
          {result && !result.ok && <Notice>Encara no es pot fer una comparació fiable. Falten: {result.faltan.join(", ")}.</Notice>}
          {result?.ok && (
            <div className="rounded-xl border border-line">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-t-xl bg-line text-[12.5px]">
                <Cell h="" /><Cell h={`Actual · ${c.comercializadora ?? ""}`} /><Cell h={`Proposta · ${offer.comercializadora}`} />
                {([["Energia", "energia"], ["Potència", "potencia"], ["Terme fix", "fijo"], ["Impost elèctric", "iee"], ["Lloguer d'equips", "alquiler"], ["Total sense impostos", "sinImpuestos"], ["IVA", "iva"], ["Total anual amb impostos", "total"]] as const).map(([l, k]) => (
                  <Row key={k} l={l} a={result.actual[k]} b={result.nuevo[k]} strong={k === "total"} />
                ))}
              </div>
              <div className={cn("flex items-center justify-between rounded-b-xl px-4 py-3", result.ahorro > 0 ? "bg-ren/10" : "bg-amber-500/10")}>
                <span className="text-[13px] font-medium">{result.ahorro > 0 ? "Estalvi anual estimat" : "L'oferta surt més cara"}</span>
                <span className="text-xl font-semibold tnum">{fmtEUR(Math.abs(result.ahorro))} <span className="text-sm text-muted">({fmtN(Math.abs(result.ahorroPct), 1)} %)</span></span>
              </div>
              <details className="border-t border-line px-4 py-2 text-[11.5px] text-muted"><summary className="cursor-pointer">Hipòtesis del càlcul</summary><ul className="mt-1 list-disc space-y-0.5 pl-4">{result.hipotesis.map((h) => <li key={h}>{h}</li>)}</ul></details>
            </div>
          )}
        </div>
      )}

      {step === 3 && doc && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-ren/30 bg-ren/[0.06] p-4">
            <CheckCircle2 className="text-ren" />
            <div><p className="text-sm font-medium">{doc.fileName}</p><p className="text-xs text-muted">Versió {doc.version} desada a Documents i a l'Historial.</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
            <MessageCircle size={14} className="text-muted" />
            {integrations.supabase ? "Comparteix l'enllaç segur des de Documents." : "L'enllaç segur per a WhatsApp necessita l'emmagatzematge del servidor (Supabase). Mentrestant, descarrega el PDF i adjunta'l a WhatsApp."}
          </div>
        </div>
      )}
    </Modal>
  );
}

function OfferCard({ o, selected, onClick }: { o: Offer; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("pressable flex items-start gap-3 rounded-xl border p-3 text-left", selected ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-line hover:border-ink/25")}>
      <SupplierMark name={o.comercializadora} size={30} />
      <div className="min-w-0 flex-1 text-[12.5px]">
        <p className="font-semibold">{o.comercializadora} · {o.nombre}</p>
        <p className="text-muted">Energia {o.energia.filter((v) => v != null).map((v) => fmtN(v!, 4)).join(" / ")} €/kWh</p>
        <div className="mt-1 flex gap-1">{o.meta?.tipoPrecio && <Badge tone="blue">{o.meta.tipoPrecio}</Badge>}{o.validaHasta < "9999" && <Badge>Fins {o.validaHasta}</Badge>}</div>
      </div>
    </button>
  );
}

function PeriodInputs({ title, values, onChange, hint, step = "any" }: { title: string; values: string[]; onChange: (v: string[]) => void; hint?: string; step?: string }) {
  return (
    <div>
      <span className="label">{title}</span>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(values.length, 3)}, minmax(0,1fr))` }}>
        {values.map((v, i) => (
          <label key={i} className="relative">
            {values.length > 1 && <span className="absolute left-2 top-2 text-[10.5px] text-muted">P{i + 1}</span>}
            <input className={cn("input tnum", values.length > 1 && "pl-8")} inputMode="decimal" step={step} value={v} onChange={(e) => { const n = [...values]; n[i] = e.target.value; onChange(n); }} />
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
const Cell = ({ h }: { h: string }) => <div className="truncate bg-elevated px-3 py-2 text-[11.5px] font-medium text-muted">{h}</div>;
function Row({ l, a, b, strong }: { l: string; a: number; b: number; strong?: boolean }) {
  return (<>
    <div className={cn("bg-surface px-3 py-1.5", strong && "font-semibold")}>{l}</div>
    <div className={cn("bg-surface px-3 py-1.5 text-right tnum", strong && "font-semibold")}>{fmtEUR(a)}</div>
    <div className={cn("bg-surface px-3 py-1.5 text-right tnum", strong && "font-semibold")}>{fmtEUR(b)}</div>
  </>);
}

function rangeWarnings(o: Offer, c: import("@/core/types").Contract): string[] {
  const m = o.meta;
  if (!m) return [];
  const out: string[] = [];
  const kwh = consumption(c);
  if (kwh != null && m.consumoMin != null && m.consumoMax != null && m.consumoMax > 0 && (kwh < m.consumoMin || kwh > m.consumoMax)) out.push(`El consum del client (${fmtN(kwh)} kWh) és fora del rang de l'oferta (${fmtN(m.consumoMin)}–${fmtN(m.consumoMax)} kWh).`);
  const kw = c.potencia;
  if (kw != null && m.potenciaMin != null && m.potenciaMax != null && m.potenciaMax > 0 && (kw < m.potenciaMin || kw > m.potenciaMax)) out.push(`La potència del client (${kw} kW) és fora del rang de l'oferta (${m.potenciaMin}–${m.potenciaMax} kW).`);
  if (m.ambito && !/total|pen[ií]nsula/i.test(m.ambito)) out.push(`Oferta només per a ${m.ambito}.`);
  const empresa = /\b(S\.?L\.?U?|S\.?A\.?|SCP|SCCL|CB|SAT)\b/i.test(c.cliente) || /^[A-HJ-NP-SUVW]/i.test(c.cif ?? "");
  if (empresa && m.pyme === false) out.push("L'oferta no està disponible per a pimes i aquest client sembla una empresa.");
  if (!empresa && m.residencial === false) out.push("L'oferta no està disponible per a clients residencials.");
  return out;
}
