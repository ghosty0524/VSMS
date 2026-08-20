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

interface MailerConfig {
  host: string
  port: number
  secure: boolean
  from: string
  user: string
  pass: string
}

type ResolveResult =
  | { ok: true; config: MailerConfig }
  | { ok: false; reason: string }

const DEFAULT_SMTP_PORT = 25

/**
 * 解析並驗證 .env 中的 SMTP 設定，是唯一的設定來源。
 * isMailerConfigured() 與實際寄信路徑都呼叫這裡，避免兩邊各自判斷條件而互相脫節。
 */
function resolveConfig(): ResolveResult {
  const host = process.env.SMTP_HOST?.trim() ?? ''
  const from = process.env.SMTP_FROM?.trim() ?? ''
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER?.trim() ?? ''
  const pass = process.env.SMTP_PASS ?? ''

  if (!host) return { ok: false, reason: 'SMTP_HOST is missing' }
  if (!from) return { ok: false, reason: 'SMTP_FROM is missing' }

  // 未設定或空字串一律視為文件記載的預設值 25；非數字或超出範圍則視為設定錯誤，
  // 不可靜默 fallback（否則會產生難以理解的底層連線錯誤）。
  const rawPort = process.env.SMTP_PORT?.trim() ?? ''
  let port: number
  if (rawPort === '') {
    port = DEFAULT_SMTP_PORT
  } else {
    const parsed = Number(rawPort)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return {
        ok: false,
        reason: `SMTP_PORT is invalid: "${rawPort}" (must be an integer between 1 and 65535)`,
      }
    }
    port = parsed
  }

  return { ok: true, config: { host, port, secure, from, user, pass } }
}

/** SMTP_USER / SMTP_PASS 留空即以匿名轉發連線（多數內部 relay 的情形）。 */
export function isMailerConfigured(): boolean {
  return resolveConfig().ok
}

let cached: { config: MailerConfig; transporter: Transporter } | null = null

/** 設定與 transporter 綁在一起快取，只有解析成功時才寫入快取，避免壞設定卡住後續呼叫。 */
function getCached(): { config: MailerConfig; transporter: Transporter } {
  if (cached) return cached

  const result = resolveConfig()
  if (!result.ok) {
    throw new Error(
      `[mailer] SMTP is not configured: ${result.reason}.\n` +
      '  SMTP_USER / SMTP_PASS are optional — leave them blank for anonymous relay.'
    )
  }

  const { config } = result
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  })

  cached = { config, transporter }
  return cached
}

export function getMailer(): Mailer {
  return {
    async send(input: SendMailInput): Promise<void> {
      const { config, transporter } = getCached()
      await transporter.sendMail({
        from: config.from,
        to: input.to.join(', '),
        cc: input.cc.length ? input.cc.join(', ') : undefined,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })
    },
  }
}
