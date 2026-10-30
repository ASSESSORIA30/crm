import { integrations } from "@/server/env";
import { handler, requireUser } from "@/server/supabase";

export const GET = handler(async () => {
  await requireUser();
  return integrations();
});
