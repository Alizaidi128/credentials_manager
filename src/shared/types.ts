export type VpnType = 'none' | 'cisco-anyconnect' | 'sangfor' | 'forti-client' | 'checkpoint'

export type DbClientType =
  | 'toad'
  | 'dbeaver'
  | 'ssms'
  | 'sqlcmd'
  | 'sqlplus'
  | 'mysql-cli'
  | 'psql'
  | 'custom'

export interface AppEntry {
  id: string
  name: string
  url: string
  username: string
  password: string
}

export interface CredentialEntry {
  id: string
  appName: string
  pinned?: boolean

  vpnType: VpnType
  vpnHost: string
  vpnUsername: string
  vpnPassword: string
  vpnPreSharedKey: string

  apps: AppEntry[]

  dbClient: DbClientType
  dbHost: string
  dbPort: string
  dbDatabase: string
  dbInstance: string
  dbUsername: string
  dbPassword: string
  dbCommandTemplate: string
  dbOpenInTerminal: boolean

  notes: string
  createdAt: number
  updatedAt: number
}

export interface UnlockResult {
  ok: boolean
  entries?: CredentialEntry[]
  error?: string
}

export interface AppSettings {
  vpnCliPath: string
  sangforClientPath: string
  sangforSettleMs: number
  fortiClientPath: string
  checkpointPath: string
  // SMTP — shared configuration for sending recovery/OTP emails
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  // Per-user email — OTP and recovery key emails are sent here
  userEmail: string
  // 0 = unlimited (never lock on idle)
  idleTimeoutMinutes: number
}

export interface VaultierExportFile {
  _vaultier: true
  version: string
  exportedAt: string
  exportedBy?: string
  entries: CredentialEntry[]
}

export interface ImportOpenResult {
  ok: boolean
  entries?: CredentialEntry[]
  exportedAt?: string
  exportedBy?: string
  error?: string
}

export interface ExportShareResult {
  ok: boolean
  error?: string
}

export interface ExportDownloadResult {
  ok: boolean
  error?: string
}

export interface VpnOtpRequest {
  requestId: string
  prompt: string
}

export interface VpnConnectRequest {
  requestId: string
  vpnType: VpnType
  host: string
  username: string
  password: string
}

export interface VpnConnectResult {
  ok: boolean
  message: string
}

export interface VpnLogEvent {
  requestId: string
  line: string
}

export interface DbLaunchRequest {
  dbClient: DbClientType
  commandTemplate: string
  openInTerminal: boolean
  vars: {
    host: string
    port: string
    database: string
    instance: string
    username: string
    password: string
  }
}

export interface DbLaunchResult {
  ok: boolean
  message: string
}
