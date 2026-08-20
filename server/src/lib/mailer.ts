import 'dotenv/config'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface SendMailInput {
  to: string[]
  cc: string[]
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(input: SendMailInput): Promise<void>
}

const env = () => ({
  host: process.env.SMTP_HOST?.trim() ?? '',
  port: Number(process.env.SMTP_PORT ?? 25),
  secure: process.env.SMTP_SECURE === 'true',
  from: process.env.SMTP_FROM?.trim() ?? '',
  user: process.env.SMTP_USER?.trim() ?? '',
  pass: process.env.SMTP_PASS ?? '',
})

/** SMTP_USER / SMTP_PASS 留空即以匿名轉發連線（多數內部 relay 的情形）。 */
export function isMailerConfigured(): boolean {
  const e = env()
  return Boolean(e.host && e.from)
}

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (transporter) return transporter
  const e = env()
  if (!e.host || !e.from) {
    throw new Error(
      '[mailer] SMTP is not configured. Set SMTP_HOST and SMTP_FROM in .env.\n' +
      '  SMTP_USER / SMTP_PASS are optional — leave them blank for anonymous relay.'
    )
  }
  transporter = nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure: e.secure,
    auth: e.user ? { user: e.user, pass: e.pass } : undefined,
  })
  return transporter
}

export function getMailer(): Mailer {
  return {
    async send(input: SendMailInput): Promise<void> {
      await getTransporter().sendMail({
        from: env().from,
        to: input.to.join(', '),
        cc: input.cc.length ? input.cc.join(', ') : undefined,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })
    },
  }
}
