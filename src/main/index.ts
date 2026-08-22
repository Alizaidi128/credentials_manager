import { app, shell, BrowserWindow, ipcMain, clipboard } from 'electron'
import { join } from 'path'
import { is } from './is'
import * as vault from './vault'
import * as settings from './settings'
import * as vpn from './vpn'
import * as dbLaunch from './dbLaunch'
import type { AppSettings, CredentialEntry, DbLaunchRequest, VpnConnectRequest, VpnType, VpnOtpRequest } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Prevent the vault from staying unlocked in the main process after the
  // window is gone (e.g. on macOS where the app can linger in the dock).
  win.on('closed', () => {
    vault.lock()
    if (mainWindow === win) mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('vault:exists', async () => {
    return vault.vaultExists()
  })

  ipcMain.handle('vault:create', async (_event, password: string) => {
    const { entries, recoveryCode } = await vault.createVault(password)
    return { ok: true, entries, recoveryCode }
  })

  ipcMain.handle('vault:unlock', async (_event, password: string) => {
    try {
      const entries = await vault.unlockVault(password)
      return { ok: true as const, entries }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Failed to unlock' }
    }
  })

  ipcMain.handle('vault:lock', async () => {
    vault.lock()
  })

  ipcMain.handle('vault:hasRecovery', async () => {
    return vault.hasRecoveryKey()
  })

  ipcMain.handle('vault:setupRecovery', async () => {
    try {
      const recoveryCode = await vault.setupRecoveryKey()
      return { ok: true as const, recoveryCode }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Failed to set up recovery key' }
    }
  })

  ipcMain.handle('vault:resetWithRecovery', async (_event, recoveryCode: string, newPassword: string) => {
    try {
      const entries = await vault.resetWithRecoveryKey(recoveryCode, newPassword)
      return { ok: true as const, entries }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Reset failed' }
    }
  })

  ipcMain.handle('vault:save', async (_event, entries: CredentialEntry[]) => {
    await vault.saveEntries(entries)
  })

  ipcMain.handle('clipboard:write', async (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('settings:get', async () => {
    return settings.getSettings()
  })

  ipcMain.handle('settings:save', async (_event, next: AppSettings) => {
    await settings.saveSettings(next)
  })

  ipcMain.handle('vpn:connect', async (_event, request: VpnConnectRequest) => {
    const appSettings = await settings.getSettings()
    const onLog = (logEvent: { requestId: string; line: string }): void => {
      mainWindow?.webContents.send('vpn:log', logEvent)
    }
    switch (request.vpnType) {
      case 'cisco-anyconnect':
        return vpn.connectCiscoAnyConnect(appSettings.vpnCliPath, request, onLog)
      case 'sangfor':
        return vpn.connectSangfor(appSettings.sangforClientPath, request, onLog, appSettings.sangforSettleMs)
      case 'forti-client':
        return vpn.connectFortiClient(appSettings.fortiClientPath, request, onLog)
      case 'checkpoint': {
        const onOtpRequired = (prompt: string): Promise<string> => {
          return new Promise((resolveOtp, rejectOtp) => {
            const otpReq: VpnOtpRequest = { requestId: request.requestId, prompt }
            mainWindow?.webContents.send('vpn:otp-required', otpReq)
            ipcMain.once('vpn:otp-submit', (_ev, { requestId, otp }: { requestId: string; otp: string }) => {
              if (requestId === request.requestId) resolveOtp(otp)
              else rejectOtp(new Error('OTP response for wrong request'))
            })
          })
        }
        return vpn.connectCheckpoint(appSettings.checkpointPath, request, onLog, onOtpRequired)
      }
      default:
        return { ok: false, message: `Unsupported VPN type: ${request.vpnType}` }
    }
  })

  ipcMain.handle('vpn:disconnect', async (_event, vpnType: VpnType) => {
    const appSettings = await settings.getSettings()
    switch (vpnType) {
      case 'cisco-anyconnect':
        return vpn.disconnectCiscoAnyConnect(appSettings.vpnCliPath)
      case 'sangfor':
        return vpn.disconnectSangfor()
      case 'forti-client':
        return vpn.disconnectFortiClient(appSettings.fortiClientPath)
      case 'checkpoint':
        return vpn.disconnectCheckpoint(appSettings.checkpointPath)
      default:
        return { ok: false, message: `Unsupported VPN type: ${vpnType}` }
    }
  })

  ipcMain.handle('db:launch', async (_event, request: DbLaunchRequest) => {
    return dbLaunch.launch(request)
  })

  ipcMain.handle('shell:openUrl', async (_event, url: string) => {
    await shell.openExternal(url)
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  vault.lock()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
