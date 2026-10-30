import { env, integrations } from "@/server/env";
import { HttpError, handler } from "@/server/supabase";
import { enrichPending } from "@/server/sips";
import { runGoogleSync } from "@/server/sync";

export const maxDuration = 60;

/** Called by Vercel Cron (see vercel.json). Protected with CRON_SECRET. */
export const GET = handler(async (req) => {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) throw new HttpError(401, "No autoritzat");
  const google = integrations().googleSync ? await runGoogleSync().then(result=>({ok:true,result})).catch(e=>({ok:false,error:String(e)})) : {skipped:true};
  const sips = await enrichPending(12).then(result=>({ok:true,result})).catch(e=>({ok:false,error:String(e)}));
  return { google, sips };
});
