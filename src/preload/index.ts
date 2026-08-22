import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CredentialEntry,
  DbLaunchRequest,
  DbLaunchResult,
  UnlockResult,
  VpnConnectRequest,
  VpnConnectResult,
  VpnLogEvent,
  VpnOtpRequest,
  VpnType
} from '../shared/types'

const api = {
  vaultExists: (): Promise<boolean> => ipcRenderer.invoke('vault:exists'),
  createVault: (password: string): Promise<UnlockResult> =>
    ipcRenderer.invoke('vault:create', password),
  unlockVault: (password: string): Promise<UnlockResult> =>
    ipcRenderer.invoke('vault:unlock', password),
  lockVault: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
  saveEntries: (entries: CredentialEntry[]): Promise<void> =>
    ipcRenderer.invoke('vault:save', entries),
  resetVaultPassword: (newPassword: string): Promise<UnlockResult> =>
    ipcRenderer.invoke('vault:resetPassword', newPassword),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (next: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', next),

  connectVpn: (request: VpnConnectRequest): Promise<VpnConnectResult> =>
    ipcRenderer.invoke('vpn:connect', request),
  disconnectVpn: (vpnType: VpnType): Promise<VpnConnectResult> =>
    ipcRenderer.invoke('vpn:disconnect', vpnType),
  onVpnLog: (callback: (event: VpnLogEvent) => void): (() => void) => {
    const listener = (_event: unknown, data: VpnLogEvent): void => callback(data)
    ipcRenderer.on('vpn:log', listener)
    return () => ipcRenderer.removeListener('vpn:log', listener)
  },
  onVpnOtpRequired: (callback: (req: VpnOtpRequest) => void): (() => void) => {
    const listener = (_event: unknown, data: VpnOtpRequest): void => callback(data)
    ipcRenderer.on('vpn:otp-required', listener)
    return () => ipcRenderer.removeListener('vpn:otp-required', listener)
  },
  submitVpnOtp: (requestId: string, otp: string): void => {
    ipcRenderer.send('vpn:otp-submit', { requestId, otp })
  },

  requestOtp: (): Promise<{ ok: boolean; expiry?: number; error?: string }> =>
    ipcRenderer.invoke('otp:request'),
  verifyOtp: (enteredOtp: string): Promise<{ valid: boolean }> =>
    ipcRenderer.invoke('otp:verify', enteredOtp),
  hasPendingOtp: (): Promise<boolean> => ipcRenderer.invoke('otp:hasPending'),

  launchDb: (request: DbLaunchRequest): Promise<DbLaunchResult> =>
    ipcRenderer.invoke('db:launch', request),
  openUrl: (url: string): Promise<void> => ipcRenderer.invoke('shell:openUrl', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
