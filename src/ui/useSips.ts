"use client";
import { useEffect,useState } from "react";
import type { SipsEntry } from "@/core/sips";
import { normalizedCups } from "@/core/sips";
let cache:Record<string,SipsEntry>={};
let promise:Promise<void>|null=null;
export function useSips(cups:string|null|undefined){
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true;
  if(!promise)promise=fetch("/api/sips/cache",{credentials:"same-origin"}).then(r=>r.ok?r.json():Promise.reject(new Error("SIPS no disponible"))).then(j=>{cache=Object.fromEntries((j.rows||[]).map((r:SipsEntry)=>[r.cups,r]));}).catch(()=>{});
  promise.then(()=>{if(active)setRevision(x=>x+1);});
  return()=>{active=false};
 },[]);
 void revision;
 return cache[normalizedCups(cups)]||null;
}
export function useRefreshSips(){const [busy,setBusy]=useState(false);const [entry,setEntry]=useState<SipsEntry|null>(null);const refresh=async(cups:string)=>{setBusy(true);try{const r=await fetch("/api/sips/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cups})});const json=await r.json();if(!r.ok)throw new Error(json.error||"SIPS");cache[normalizedCups(cups)]=json.entry;setEntry(json.entry);return json.entry as SipsEntry;}finally{setBusy(false)}};return {refresh,busy,entry};}
