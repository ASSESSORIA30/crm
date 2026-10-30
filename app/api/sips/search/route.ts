import {handler,requireUser,HttpError} from "@/server/supabase";
import {searchElectricSupplies} from "@/server/sipsSearch";
export const runtime="nodejs";
export const POST=handler(async(req)=>{
 await requireUser({staff:true});
 const input=await req.json().catch(()=>({})) as {cups?:string;cp?:string;direccion?:string};
 if(!input.cups && !input.cp)throw new HttpError(400,"Introdueix un CUPS o un codi postal");
 return await searchElectricSupplies(input);
});
