import "server-only";

const BASE=(process.env.SIPS_BASE_URL || "https://eas.renovaenergy.es").replace(/\/$/,"");
type Session={cookies:Map<string,string>,at:number};
let session:Session|null=null;
const cookieHeader=(s:Session)=>[...s.cookies].map(([k,v])=>`${k}=${v}`).join("; ");
function absorb(s:Session,r:Response){for(const c of r.headers.getSetCookie()){const [p]=c.split(";");const i=p.indexOf("=");if(i>0)s.cookies.set(p.slice(0,i).trim(),p.slice(i+1).trim());}}
async function login():Promise<Session>{
 const user=process.env.SIPS_USER,pass=process.env.SIPS_PASSWORD;
 if(!user||!pass)throw new Error("Falten SIPS_USER o SIPS_PASSWORD al desplegament");
 const s:Session={cookies:new Map(),at:Date.now()};
 absorb(s,await fetch(`${BASE}/Account/Login/`,{redirect:"manual",cache:"no-store"}));
 const r=await fetch(`${BASE}/Account/Login`,{method:"POST",redirect:"manual",cache:"no-store",headers:{"Content-Type":"application/json",Accept:"application/json","X-Requested-With":"XMLHttpRequest","X-CSRF-TOKEN":s.cookies.get("CSRF-TOKEN")||"",Cookie:cookieHeader(s)},body:JSON.stringify({NombreUsuario:user,Password:pass})});
 absorb(s,r);const body=await r.text();if(!r.ok||r.status>=300||/"Error"\s*:\s*\{/.test(body))throw new Error("Accés al portal SIPS rebutjat");return s;
}
function caseVariants(field:string,value:string,prefix:string,suffix:string):unknown{
 const title=value.toLocaleLowerCase("es-ES").replace(/(^|[\s/.,-])([^\s/.,-])/g,(_whole:string,sep:string,c:string)=>sep+c.toLocaleUpperCase("es-ES"));
 const variants=[...new Set([value,value.toLocaleUpperCase("es-ES"),value.toLocaleLowerCase("es-ES"),title])];
 const clauses=variants.map(v=>[[field],"like",`${prefix}${v}${suffix}`]);
 return clauses.slice(1).reduce<unknown>((acc,c)=>[acc,"or",c],clauses[0]);
}
export type SearchParams={cups?:string;cp?:string;direccion?:string;take?:number};
export type SearchResult={cups:string;annual_kwh:number|null;tariff:string|null;address:string|null;postal_code:string|null;city:string|null;power_p1:number|null;power_p2:number|null};
export async function searchElectricSupplies(input:SearchParams):Promise<{total:number;rows:SearchResult[]}>{
 const cups=(input.cups||"").toUpperCase().replace(/[\s.\-]/g,"");const cp=(input.cp||"").trim();
 let criteria:unknown=[["TipoEnergia"],"=",1];const eq:Record<string,string>={};
 if(cups){if(!/^ES\d{16}[A-Z]{2}([A-Z0-9]{2})?$/.test(cups))throw new Error("CUPS elèctric incorrecte: calen 20 o 22 caràcters");criteria=[criteria,"and",caseVariants("CUPS",cups,"",cups.length===20?"%":"")];}
 else {if(!/^\d{5}$/.test(cp))throw new Error("Indica un codi postal de 5 xifres");eq.CodigoPostal=cp;const dir=(input.direccion||"").trim().replace(/[%_\[\]]/g," ").replace(/\s+/g," ").slice(0,120);if(dir)criteria=[criteria,"and",caseVariants("Direccion",dir,"%","%")];}
 const body={Take:Math.min(100,Math.max(1,Number(input.take)||30)),Skip:0,EqualityFilter:eq,Criteria:criteria,Sort:["EActivaAnual DESC"],IncludeColumns:["TipoEnergia","CUPS","EActivaAnual","IdTarifaNombreTarifa","Direccion","CodigoPostal","IdLocalidadNombreLocalidad","PotenciaContratadaP1","PotenciaContratadaP2"]};
 for(let attempt=0;attempt<2;attempt++){
  if(!session||Date.now()-session.at>12*60*1000)session=await login();
  const r=await fetch(`${BASE}/Services/Core/PuntoSuministro/List`,{method:"POST",redirect:"manual",cache:"no-store",headers:{"Content-Type":"application/json",Accept:"application/json","X-Requested-With":"XMLHttpRequest","X-CSRF-TOKEN":session.cookies.get("CSRF-TOKEN")||"",Cookie:cookieHeader(session)},body:JSON.stringify(body)});
  if([401,403,302].includes(r.status)){session=null;continue;}if(!r.ok)throw new Error(`Error del portal SIPS (HTTP ${r.status})`);
  const data=await r.json() as {Entities?:Record<string,unknown>[];TotalCount?:number;Error?:{Message?:string}};
  if(data.Error)throw new Error(data.Error.Message||"Error SIPS");
  const records=(data.Entities||[]).filter(x=>x.TipoEnergia===1 && (!cups || String(x.CUPS||"").toUpperCase().startsWith(cups)));
  const value=(x:unknown)=>x==null||x===""?null:String(x);
  const number=(x:unknown)=>x==null||x===""||!Number.isFinite(Number(x))?null:Number(x);
  return {total:cups?records.length:(data.TotalCount??records.length),rows:records.map(x=>({cups:String(x.CUPS||""),annual_kwh:number(x.EActivaAnual),tariff:value(x.IdTarifaNombreTarifa),address:value(x.Direccion),postal_code:value(x.CodigoPostal),city:value(x.IdLocalidadNombreLocalidad),power_p1:number(x.PotenciaContratadaP1),power_p2:number(x.PotenciaContratadaP2)}))};
 }
 throw new Error("No s'ha pogut renovar la sessió del portal SIPS");
}
