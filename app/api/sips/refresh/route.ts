import { handler,requireUser,HttpError } from "@/server/supabase";
import { refreshSips } from "@/server/sips";
import { normalizedCups,isElectricCups } from "@/core/sips";
export const POST=handler(async(req)=>{
 const {sb}=await requireUser({staff:true});const {cups}=await req.json() as {cups?:string};
 const key=normalizedCups(cups);if(!isElectricCups(key))throw new HttpError(400,"CUPS elèctric no vàlid");
 const {data,error}=await sb.from("contracts").select("cups").limit(10000);if(error)throw error;
 if(!(data||[]).some(c=>normalizedCups(c.cups)===key))throw new HttpError(403,"CUPS no visible");
 return {entry:await refreshSips(key,true)};
});
