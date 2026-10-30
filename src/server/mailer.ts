import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transport: Transporter | null = null;
export function mailer() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtpHost, // IONOS: smtp.ionos.es
      port: env.smtpPort, // 587 STARTTLS or 465 SSL
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return transport;
}
