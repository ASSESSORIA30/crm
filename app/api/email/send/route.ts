import { env, integrations } from "@/server/env";
import { mailer } from "@/server/mailer";
import { HttpError, handler, requireUser } from "@/server/supabase";

/** Sends a real email through the corporate SMTP (e.g. IONOS). Returns "enviado" only if the SMTP server accepted it. */
export const POST = handler(async (req) => {
  const { sb, profile } = await requireUser();
  if (!integrations().smtp) throw new HttpError(400, "SMTP no configurat");
  const b = (await req.json()) as { to: string; subject: string; body: string; contractId: string; attachment?: { fileName: string; base64: string } };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.to)) throw new HttpError(400, "Correu de destinació no vàlid");
  // RLS check: the user must be able to see the contract
  const { data: c } = await sb.from("contracts").select("id").eq("id", b.contractId).maybeSingle();
  if (!c) throw new HttpError(403, "Sense accés a aquest contracte");
  if (b.attachment && b.attachment.base64.length > 8_000_000) throw new HttpError(400, "L'adjunt és massa gran");
  const info = await mailer().sendMail({
    from: env.smtpFrom || env.smtpUser,
    replyTo: profile.email,
    to: b.to,
    subject: b.subject.slice(0, 300),
    text: b.body,
    attachments: b.attachment ? [{ filename: b.attachment.fileName, content: Buffer.from(b.attachment.base64, "base64"), contentType: "application/pdf" }] : [],
  });
  return { id: info.messageId, accepted: (info.accepted?.length ?? 0) > 0 };
});
