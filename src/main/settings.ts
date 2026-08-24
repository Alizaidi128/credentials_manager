import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  vpnCliPath: 'C:\\Program Files (x86)\\Cisco\\Cisco AnyConnect Secure Mobility Client\\vpncli.exe',
  sangforClientPath: 'C:\\Program Files (x86)\\Sangfor\\SSL\\EasyConnect\\EasyConnect.exe',
  sangforSettleMs: 10000,
  fortiClientPath: 'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe',
  checkpointPath: 'C:\\Program Files (x86)\\CheckPoint\\Endpoint Connect\\trac.exe',
  winscpPath: 'C:\\Program Files (x86)\\WinSCP\\WinSCP.exe',
  openconnectPath: 'C:\\Program Files\\OpenConnect-GUI\\openconnect.exe',
  smtpHost: 'smtp.office365.com',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: 'Vaultier <noreply@centegytechnologies.com>',
  userEmail: '',
  idleTimeoutMinutes: 0
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}
