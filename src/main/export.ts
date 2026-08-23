import { dialog } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import { hostname } from 'os'
import nodemailer from 'nodemailer'
import type { AppSettings, CredentialEntry, VaultierExportFile, ImportOpenResult, ExportDownloadResult, ExportShareResult } from '../shared/types'

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

function buildFile(entries: CredentialEntry[], exportedBy?: string): VaultierExportFile {
  return {
    _vaultier: true,
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    exportedBy,
    entries
  }
}

export async function downloadExport(
  entries: CredentialEntry[],
  exportedBy?: string
): Promise<ExportDownloadResult> {
  const date = new Date().toISOString().slice(0, 10)
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Vaultier Credentials',
    defaultPath: `vaultier-export-${date}.vaultier`,
    filters: [
      { name: 'Vaultier Export', extensions: ['vaultier'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  })
  if (canceled || !filePath) return { ok: false }
  try {
    writeFileSync(filePath, JSON.stringify(buildFile(entries, exportedBy), null, 2), 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to write file.' }
  }
}

export async function shareExport(
  entries: CredentialEntry[],
  recipientEmail: string,
  smtp: Pick<AppSettings, 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass' | 'smtpFrom'>,
  exportedBy?: string
): Promise<ExportShareResult> {
  const json = JSON.stringify(buildFile(entries, exportedBy), null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const machine = hostname()
  const senderDisplay = exportedBy || smtp.smtpFrom || smtp.smtpUser || 'A Vaultier user'
  const humanDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const count = entries.length

  const entryRows = entries.map(e => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:34px;height:34px;border-radius:9px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#6366f1;flex-shrink:0;text-align:center;line-height:34px">
            ${(e.appName || '?').trim().charAt(0).toUpperCase()}
          </div>
          <span style="font-size:14px;color:#1e293b;font-weight:500">${e.appName || 'Untitled'}</span>
        </div>
      </td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Vaultier — Credentials Shared</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:540px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.10)">

        <!-- Header gradient -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1 0%,#4338ca 100%);padding:36px 44px;text-align:center">
            <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,.18);border-radius:16px;line-height:56px;font-size:28px;margin-bottom:18px">🔐</div>
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-.4px">Credentials Shared</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,.70)">${humanDate}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 44px 24px">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#0f172a">
              ${senderDisplay} shared ${count} credential${count === 1 ? '' : 's'} with you
            </p>
            <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7">
              The credentials are attached as a
              <code style="background:#f1f5f9;border:1px solid #e2e8f0;padding:2px 6px;border-radius:5px;font-size:12px;color:#4f46e5">.vaultier</code>
              file. Download it and import into your Vaultier vault.
            </p>

            <!-- Shared entries -->
            <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px">
              <div style="background:#f8fafc;padding:11px 16px;border-bottom:1px solid #e2e8f0">
                <span style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">
                  ${count} Shared Item${count === 1 ? '' : 's'}
                </span>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${entryRows}
              </table>
            </div>

            <!-- How to import -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:22px 24px;margin-bottom:24px">
              <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#166534">How to import</p>
              <table cellpadding="0" cellspacing="0" role="presentation" width="100%">
                <tr>
                  <td style="width:24px;vertical-align:top;padding-top:1px">
                    <div style="width:20px;height:20px;background:#22c55e;border-radius:50%;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:20px">1</div>
                  </td>
                  <td style="padding:0 0 10px 10px;font-size:13px;color:#15803d;line-height:1.6">
                    Download the attached <strong>vaultier-export-*.vaultier</strong> file from this email
                  </td>
                </tr>
                <tr>
                  <td style="width:24px;vertical-align:top;padding-top:1px">
                    <div style="width:20px;height:20px;background:#22c55e;border-radius:50%;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:20px">2</div>
                  </td>
                  <td style="padding:0 0 10px 10px;font-size:13px;color:#15803d;line-height:1.6">
                    Open <strong>Vaultier</strong> and unlock your vault
                  </td>
                </tr>
                <tr>
                  <td style="width:24px;vertical-align:top;padding-top:1px">
                    <div style="width:20px;height:20px;background:#22c55e;border-radius:50%;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:20px">3</div>
                  </td>
                  <td style="padding:0 0 0 10px;font-size:13px;color:#15803d;line-height:1.6">
                    Click <strong>Import</strong> in the sidebar, select the file — only new entries will be added
                  </td>
                </tr>
              </table>
            </div>

            <!-- Security notice -->
            <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px">
              <p style="margin:0;font-size:12px;color:#92400e;line-height:1.6">
                <strong>Security notice:</strong> This attachment contains sensitive credentials.
                Store it securely and delete this email after importing.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 44px;text-align:center">
            <p style="margin:0 0 3px;font-size:11px;color:#94a3b8">Sent from Vaultier on <strong style="color:#64748b">${machine}</strong></p>
            <p style="margin:0;font-size:11px;color:#94a3b8">
              Powered by <strong style="color:#6366f1">Ali Zaidi</strong>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    const transporter = makeTransporter(smtp)
    await transporter.sendMail({
      from: smtp.smtpFrom || smtp.smtpUser,
      to: recipientEmail,
      subject: `[Vaultier] ${senderDisplay} shared ${count} credential${count === 1 ? '' : 's'} with you`,
      html,
      text: [
        `${senderDisplay} shared ${count} credential${count === 1 ? '' : 's'} with you via Vaultier.`,
        '',
        'The credentials are attached as a .vaultier file. Import it in your Vaultier app.',
        '',
        `Shared items (${count}):`,
        ...entries.map(e => `  • ${e.appName || 'Untitled'}`),
        '',
        'How to import:',
        '  1. Download the attached .vaultier file',
        '  2. Open Vaultier and unlock your vault',
        '  3. Click Import in the sidebar and select the file',
        '',
        'Security notice: This file contains sensitive credentials. Handle it with care.',
        '',
        `Sent from Vaultier on ${machine} — Powered by Ali Zaidi`
      ].join('\n'),
      attachments: [{
        filename: `vaultier-export-${date}.vaultier`,
        content: json,
        contentType: 'application/json'
      }]
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to send email.' }
  }
}

export async function openImport(): Promise<ImportOpenResult> {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Import Vaultier Credentials',
    filters: [
      { name: 'Vaultier Export', extensions: ['vaultier', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return { ok: false }
  try {
    const parsed = JSON.parse(readFileSync(filePaths[0], 'utf-8')) as VaultierExportFile
    if (parsed._vaultier !== true || !Array.isArray(parsed.entries)) {
      return { ok: false, error: 'This is not a valid Vaultier export file.' }
    }
    return { ok: true, entries: parsed.entries, exportedAt: parsed.exportedAt, exportedBy: parsed.exportedBy }
  } catch {
    return { ok: false, error: 'Could not read or parse the file. Make sure it is a valid .vaultier file.' }
  }
}
