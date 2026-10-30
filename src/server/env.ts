import "server-only";
import type { Integrations } from "@/core/types";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  googleSa: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  crmFileId: process.env.SOURCE_CRM_FILE_ID ?? "",
  diarioFileId: process.env.SOURCE_DIARIO_FILE_ID ?? "",
  writebackSheetId: process.env.WRITEBACK_SHEET_ID ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  waToken: process.env.WHATSAPP_TOKEN ?? "",
  waPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
};

export function integrations(): Integrations {
  return {
    supabase: !!(env.supabaseUrl && env.supabaseAnon && env.supabaseService),
    googleSync: !!(env.googleSa && (env.crmFileId || process.env.SOURCE_CRM_FOLDER_ID)),
    smtp: !!(env.smtpHost && env.smtpUser && env.smtpPass),
    ai: !!env.anthropicKey,
    whatsappCloud: !!(env.waToken && env.waPhoneId),
  };
}
