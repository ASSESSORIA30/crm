import { handler,requireUser } from "@/server/supabase";
import { adminClient } from "@/server/supabase";
import { normalizedCups } from "@/core/sips";
export const GET=handler(async()=>{
 const {sb,profile}=await requireUser();
 // Client is RLS filtered; never expose the service role key to the browser.
 const {data:contracts,error:e}=await sb.from("contracts").select("cups").limit(10000);
 if(e)throw e;
 const keys=[...new Set((contracts||[]).map(c=>normalizedCups(c.cups)).filter(Boolean))];
 if(keys.length===0)return {rows:[]};
 const out=[];
 for(let i=0;i<keys.length;i+=150){const {data,error}=await adminClient().from("sips_cache").select("cups,returned_cups,annual_kwh,tariff,address,status,consulted_at").in("cups",keys.slice(i,i+150));if(error)throw error;out.push(...(data||[]));}
 void profile;
 return {rows:out};
});
