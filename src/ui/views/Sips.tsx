"use client";
import {useState} from "react";
import {Zap,Search,AlertCircle,MapPin} from "lucide-react";
import {useApp} from "@/data/store";
import type {SearchResult} from "@/server/sipsSearch";

type Mode="cups"|"address";
export function SipsView(){
 const {contracts,open}=useApp();
 const [mode,setMode]=useState<Mode>("cups");
 const [cups,setCups]=useState("");const [cp,setCp]=useState("");const [street,setStreet]=useState("");
 const [rows,setRows]=useState<SearchResult[]>([]);const [total,setTotal]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState("");
 const search=async()=>{
  setBusy(true);setFailure("");setRows([]);setTotal(null);
  try{
   const r=await fetch("/api/sips/search",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(mode==="cups"?{cups}:{cp,direccion:street})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"No s'ha pogut consultar SIPS");setRows(j.rows||[]);setTotal(j.total??0);
  }catch(e){setFailure(e instanceof Error?e.message:"Error de consulta");}finally{setBusy(false);}
 };
 const compact=(v:string)=>v.toUpperCase().replace(/[\s.\-]/g,"").slice(0,20);
 const contractFor=(cup:string)=>contracts.find(c=>compact(c.cups||"")===compact(cup));
 return <div className="mx-auto max-w-6xl space-y-5 p-5 sm:p-8">
  <div><h2 className="flex items-center gap-2 text-2xl font-bold"><Zap size={24}/>Buscador CUPS · SIPS</h2><p className="mt-1 text-sm text-muted">Consulta subministraments elèctrics directament al portal SIPS, encara que no siguin al CRM. Admet CUPS sense sufix i carrers en majúscules o minúscules.</p></div>
  <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
   <div className="flex gap-2"><button type="button" onClick={()=>{setMode("cups");setFailure("");setRows([]);setTotal(null);}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode==="cups"?"bg-ink text-surface":"bg-elevated"}`}>Per CUPS</button><button type="button" onClick={()=>{setMode("address");setFailure("");setRows([]);setTotal(null);}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode==="address"?"bg-ink text-surface":"bg-elevated"}`}>Per adreça</button></div>
   {mode==="cups"?<div className="space-y-2"><label htmlFor="sips-cups" className="text-sm font-semibold">CUPS de llum</label><input id="sips-cups" className="input w-full" value={cups} onChange={e=>setCups(e.target.value)} placeholder="ES0021000000000001RK (sense 0F)"/></div>:<div className="grid gap-3 sm:grid-cols-[180px_1fr]"><div className="space-y-2"><label htmlFor="sips-cp" className="text-sm font-semibold">Codi postal *</label><input id="sips-cp" className="input w-full" inputMode="numeric" maxLength={5} value={cp} onChange={e=>setCp(e.target.value.replace(/\D/g,"").slice(0,5))} placeholder="25001"/></div><div className="space-y-2"><label htmlFor="sips-street" className="text-sm font-semibold">Carrer i número (opcional)</label><input id="sips-street" className="input w-full" value={street} onChange={e=>setStreet(e.target.value)} placeholder="Carrer Major 15"/></div></div>}
   <button type="button" onClick={search} disabled={busy||(mode==="cups"?!cups.trim():cp.length!==5)} className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-surface disabled:opacity-50"><Search size={16}/>{busy?"Consultant SIPS…":"Buscar al portal SIPS"}</button>
   {failure&&<p role="alert" className="flex items-center gap-2 text-sm text-red-600"><AlertCircle size={16}/>{failure}</p>}
  </div>
  {total!==null&&<p className="text-sm text-muted">{rows.length===0?"Cap subministrament trobat.":`Resultats: ${rows.length}${total>rows.length?` de ${total} (es mostren els primers ${rows.length})`:""}`}</p>}
  {rows.length>0&&<div className="space-y-3">{rows.map((r,i)=>{const linked=contractFor(r.cups);return <div key={`${r.cups}-${i}`} className="rounded-xl border border-line bg-surface p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{r.cups}</p><p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14}/>{[r.address,r.postal_code,r.city].filter(Boolean).join(" · ")||"Adreça no disponible"}</p></div><div className="text-right"><p className="text-2xl font-bold">{r.annual_kwh==null?"—":r.annual_kwh.toLocaleString("ca-ES")} <span className="text-sm font-normal">kWh/any</span></p><p className="text-sm text-muted">{r.tariff||"Tarifa no disponible"}</p></div></div><div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted"><span>Potència P1: {r.power_p1??"—"} kW</span><span>Potència P2: {r.power_p2??"—"} kW</span>{linked?<button type="button" className="font-semibold underline" onClick={()=>open(linked.id)}>Obrir contracte: {linked.cliente}</button>:<span>No consta entre els contractes carregats</span>}</div></div>})}</div>}
  <p className="text-xs text-muted">Consulta només d'electricitat. Les cerques per adreça requereixen un codi postal de cinc xifres; els resultats depenen de les dades que retorni el portal SIPS. La consulta general no modifica els contractes del CRM.</p>
 </div>;
}
