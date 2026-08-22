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
  recoveryCode?: string // present only on vault:create
  error?: string
}

export interface AppSettings {
  vpnCliPath: string
  sangforClientPath: string
  // Extra time (ms) to wait after EasyConnect's window is ready before sending
  // keystrokes. EasyConnect fetches its login page over the network after the
  // window opens; how long this takes depends on your VPN server's response time.
  // Increase this if keystrokes still land before the login form appears.
  sangforSettleMs: number
  fortiClientPath: string
  checkpointPath: string
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
