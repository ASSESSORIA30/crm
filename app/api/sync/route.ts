import { integrations } from "@/server/env";
import { HttpError, handler, requireUser } from "@/server/supabase";
import { runGoogleSync } from "@/server/sync";

export const maxDuration = 60;

/** Manual "Sincronizar ahora" (admin or comercial; the job itself uses the service role). */
export const POST = handler(async () => {
  await requireUser();
  if (!integrations().googleSync) throw new HttpError(400, "La sincronització amb Google no està configurada");
  return runGoogleSync();
});
