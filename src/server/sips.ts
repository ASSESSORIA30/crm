import "server-only";
import { adminClient } from "./supabase";
import { normalizedCups, isElectricCups } from "@/core/sips";
import type { SipsEntry } from "@/core/sips";

const BASE = (process.env.SIPS_BASE_URL || "https://eas.renovaenergy.es").replace(/\/$/, "");
const USER = () => process.env.SIPS_USER || "";
const PASS = () => process.env.SIPS_PASSWORD || "";
type S = { cookies: Map<string,string>; at: number };
let session: S | null = null;
const cookieString = (s: S) => Array.from(s.cookies).map(([k,v])=>`${k}=${v}`).join("; ");
function absorb(s: S, r: Response) {
 for (const cookie of r.headers.getSetCookie()) {
  const part = cookie.split(";")[0]; const i = part.indexOf("="); if(i>0) s.cookies.set(part.slice(0,i),part.slice(i+1));
 }
}
async function login(): Promise<S> {
 const s: S = {cookies:new Map(), at:Date.now()};
 const init = await fetch(`${BASE}/Account/Login/`, {redirect:"manual",cache:"no-store"}); absorb(s,init);
 const r = await fetch(`${BASE}/Account/Login`, {method:"POST",redirect:"manual",headers:{"Content-Type":"application/json",Accept:"application/json","X-Requested-With":"XMLHttpRequest","X-CSRF-TOKEN":s.cookies.get("CSRF-TOKEN")||"",Cookie:cookieString(s)},body:JSON.stringify({NombreUsuario:USER(),Password:PASS()}),cache:"no-store"});
 absorb(s,r); const body=await r.text();
 if(!r.ok || /"Error"\s*:\s*\{/.test(body)) throw new Error(`Accés SIPS rebutjat (${r.status})`);
 return s;
}
async function query(cups: string): Promise<{ row: Record<string,unknown> | null; error?:string }> {
 for(let attempt=0;attempt<2;attempt++) {
  if(!session || Date.now()-session.at>12*60*1000) session=await login();
  const criteria:unknown = [[ ["TipoEnergia"],"=",1 ],"and",[["CUPS"],"like",`${cups}%`]];
  const r=await fetch(`${BASE}/Services/Core/PuntoSuministro/List`,{method:"POST",redirect:"manual",headers:{"Content-Type":"application/json",Accept:"application/json","X-Requested-With":"XMLHttpRequest","X-CSRF-TOKEN":session.cookies.get("CSRF-TOKEN")||"",Cookie:cookieString(session)},body:JSON.stringify({Take:20,Skip:0,EqualityFilter:{},Criteria:criteria,IncludeColumns:["TipoEnergia","CUPS","EActivaAnual","IdTarifaNombreTarifa","Direccion"]}),cache:"no-store"});
  if([401,403,302].includes(r.status)){session=null;continue;}
  if(!r.ok) throw new Error(`Portal SIPS: HTTP ${r.status}`);
  const j=await r.json() as {Entities?:Record<string,unknown>[];Error?:{Message?:string}};
  if(j.Error) throw new Error(j.Error.Message||"Error del portal SIPS");
  const exact=(j.Entities||[]).find(e=>e.TipoEnergia===1 && normalizedCups(String(e.CUPS??""))===cups);
  return {row:exact||null};
 }
 throw new Error("Sessió SIPS caducada");
}
export async function refreshSips(cupsRaw: string, force=false):Promise<SipsEntry | null> {
 const cups=normalizedCups(cupsRaw); if(!isElectricCups(cups))return null;
 const sb=adminClient();
 const {data:old,error:lookupError}=await sb.from("sips_cache").select("*").eq("cups",cups).maybeSingle();
 if(lookupError)throw lookupError;
 const fresh=old && Date.now()-new Date(old.consulted_at).getTime() < (old.status==="found"?7:1)*86400000;
 if(fresh&&!force)return old as SipsEntry;
 if(!USER()||!PASS())throw new Error("Falten SIPS_USER o SIPS_PASSWORD");
 let entry: SipsEntry;
 try {
  const {row}=await query(cups);
  const n=Number(row?.EActivaAnual);
  entry={cups,returned_cups:row?String(row.CUPS):null,annual_kwh:row&&row.EActivaAnual!=null&&Number.isFinite(n)&&n>=0?n:null,tariff:row?.IdTarifaNombreTarifa?String(row.IdTarifaNombreTarifa):null,address:row?.Direccion?String(row.Direccion):null,status:row?"found":"not_found",consulted_at:new Date().toISOString(),error:null};
 }catch(e){entry={cups,returned_cups:null,annual_kwh:null,tariff:null,address:null,status:"error",consulted_at:new Date().toISOString(),error:e instanceof Error?e.message:"Error de consulta"};}
 const {error}=await sb.from("sips_cache").upsert(entry,{onConflict:"cups"});if(error)throw error;
 return entry;
}
export async function enrichPending(limit=12) {
 const sb=adminClient();
 const {data:states,error:se}=await sb.from("crm_state").select("contract_id,status").in("status",["pendiente","contactado"]).limit(5000);
 if(se)throw se;
 const ids=new Set((states||[]).map(x=>x.contract_id));
 const candidates=new Map<string,string>();
 // A contract without a CRM state can still be pending according to its imported source.
 for(let offset=0;offset<10000;offset+=500){
  const {data,error}=await sb.from("contracts").select("id,cups,data,removed_from_source").range(offset,offset+499);
  if(error)throw error;
  for(const c of data||[]){if(c.removed_from_source)continue;const d=c.data as {status?:string;tipo?:string};if(ids.has(c.id)) { const matched=(states||[]).find(x=>x.contract_id===c.id); if(!matched||!["pendiente","contactado"].includes(matched.status))continue; } else if(d?.status!=="pendiente"&&d?.status!=="contactado")continue;if(d?.tipo!=="luz")continue;const key=normalizedCups(c.cups);if(isElectricCups(key))candidates.set(key,key);}
  if((data||[]).length<500)break;
 }
 const keys=[...candidates.keys()]; const cached=new Map<string,SipsEntry>();
 for(let offset=0;offset<keys.length;offset+=200){const {data,error}=await sb.from("sips_cache").select("*").in("cups",keys.slice(offset,offset+200));if(error)throw error;for(const r of data||[])cached.set(r.cups,r as SipsEntry);}
 keys.sort((a,b)=>{const x=cached.get(a),y=cached.get(b);return (x?new Date(x.consulted_at).getTime():0)-(y?new Date(y.consulted_at).getTime():0);});
 let updated=0,failed=0;for(const cups of keys){if(updated+failed>=limit)break;const old=cached.get(cups);if(old&&Date.now()-new Date(old.consulted_at).getTime()<(old.status==="found"?7:1)*86400000)continue;try{const r=await refreshSips(cups);if(r?.status==="error")failed++;else updated++;}catch{failed++;}}
 return {candidates:keys.length,updated,failed};
}
