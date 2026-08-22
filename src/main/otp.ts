import { createHash, randomInt } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { hostname } from 'os'
import nodemailer from 'nodemailer'
import type { AppSettings } from '../shared/types'

const OTP_VALID_MS = 30 * 60 * 1000 // 30 minutes

interface OtpRecord {
  otpHash: string    // SHA-256 hex of the 6-digit code
  expiry: number     // unix ms
  machine: string
  requestedAt: number
}

function otpFilePath(): string {
  return join(app.getPath('userData'), 'otp-request.json')
}

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex')
}

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function makeTransporter(s: Pick<AppSettings, 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'smtpFrom'>): ReturnType<typeof nodemailer.createTransport> {
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpPort === 465,
    auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: false }
  })
}

export async function hasPendingOtp(): Promise<boolean> {
  try {
    const raw = await fs.readFile(otpFilePath(), 'utf8')
    const record: OtpRecord = JSON.parse(raw)
    return Date.now() < record.expiry
  } catch {
    return false
  }
}

/** Generate OTP, persist hash, and email OTP to the user's own email.
 *  The email also reminds them to look up their recovery key from the setup email. */
export async function requestOtp(
  smtp: Pick<AppSettings, 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'smtpFrom'>,
  userEmail: string
): Promise<{ expiry: number }> {
  const otp = generateOtp()
  const machine = hostname()
  const now = Date.now()
  const expiry = now + OTP_VALID_MS

  const record: OtpRecord = { otpHash: hashOtp(otp), expiry, machine, requestedAt: now }
  await fs.writeFile(otpFilePath(), JSON.stringify(record), 'utf8')

  const transporter = makeTransporter(smtp)
  await transporter.sendMail({
    from: smtp.smtpFrom || smtp.smtpUser,
    to: userEmail,
    subject: `[Vaultier] Password Reset OTP — ${machine}`,
    text: [
      `A password reset was requested on machine: ${machine}`,
      `Time: ${new Date(now).toLocaleString()}`,
      ``,
      `Your one-time code: ${otp}`,
      `Valid until: ${new Date(expiry).toLocaleString()} (30 minutes)`,
      ``,
      `Enter this code in the app to reset your master password.`,
      `Your vault entries will remain intact.`,
      ``,
      `If you did not request this, ignore this email.`,
      ``,
      `— Vaultier`
    ].join('\n'),
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:32px 40px;text-align:center">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:12px;margin-bottom:16px">
              <span style="font-size:24px">🔐</span>
            </div>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-.3px">Password Reset</h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.75)">Vaultier Security</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <p style="margin:0 0 6px;font-size:15px;color:#1e293b;font-weight:500">A password reset was requested</p>
            <p style="margin:0 0 28px;font-size:13px;color:#64748b">
              Machine: <strong style="color:#334155">${machine}</strong> &nbsp;·&nbsp;
              ${new Date(now).toLocaleString()}
            </p>

            <!-- OTP Block -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px">
              <p style="margin:0 0 12px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Your One-Time Code</p>
              <div style="display:inline-block;background:#ffffff;border:2px solid #e0e7ff;border-radius:10px;padding:16px 32px;margin-bottom:14px">
                <span style="font-size:40px;font-weight:800;letter-spacing:.25em;color:#4f46e5;font-family:'Courier New',Courier,monospace">${otp}</span>
              </div>
              <p style="margin:0;font-size:12px;color:#94a3b8">
                ⏱ Expires at <strong style="color:#64748b">${new Date(expiry).toLocaleString()}</strong> (30 min)
              </p>
            </div>

            <p style="margin:0 0 24px;font-size:13px;color:#64748b;line-height:1.6">
              Enter this code in the app to reset your master password. Your vault entries will remain intact.
            </p>

            <!-- Warning -->
            <div style="background:#fef9ec;border-left:4px solid #f59e0b;border-radius:4px;padding:14px 16px">
              <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5">
                <strong>Didn't request this?</strong> Ignore this email. Your vault is safe - no changes have been made.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8">
              Vaultier &nbsp;·&nbsp; Powered by <strong style="color:#6366f1">Ali Zaidi</strong>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
  })

  return { expiry }
}

/** Email the recovery key to the user at vault creation / key regeneration time. */
export async function sendRecoveryKeyEmail(
  recoveryCode: string,
  smtp: Pick<AppSettings, 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'smtpFrom'>,
  userEmail: string
): Promise<void> {
  const machine = hostname()
  const transporter = makeTransporter(smtp)
  await transporter.sendMail({
    from: smtp.smtpFrom || smtp.smtpUser,
    to: userEmail,
    subject: `[Vaultier] Your Recovery Key — ${machine}`,
    text: [
      `Your Vaultier vault recovery key for machine: ${machine}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `Recovery Key:`,
      `${recoveryCode}`,
      ``,
      `Keep this email. You will need this key if you ever forget your master password.`,
      `You will also receive a one-time code by email at that time.`,
      ``,
      `— Vaultier`
    ].join('\n'),
    html: `
      <p>Your Vaultier vault recovery key for <strong>${machine}</strong>.</p>
      <p style="color:#6b7280;font-size:13px">Generated: ${new Date().toLocaleString()}</p>
      <div style="margin:24px 0;padding:20px;background:#f1f5f9;border-radius:8px">
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Recovery Key</p>
        <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:.1em;color:#1e293b;font-family:monospace">${recoveryCode}</p>
      </div>
      <p style="color:#6b7280;font-size:13px">
        <strong>Keep this email safe.</strong> If you forget your master password, you will need
        this recovery key along with a one-time code sent to this address at that time.
      </p>
    `
  })
}

/** Verify entered OTP against stored hash. Deletes record on success (single-use). */
export async function verifyOtp(enteredOtp: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(otpFilePath(), 'utf8')
    const record: OtpRecord = JSON.parse(raw)

    if (Date.now() > record.expiry) {
      await fs.unlink(otpFilePath()).catch(() => {})
      return false
    }

    const match = hashOtp(enteredOtp.trim()) === record.otpHash
    if (match) await fs.unlink(otpFilePath()).catch(() => {})
    return match
  } catch {
    return false
  }
}
