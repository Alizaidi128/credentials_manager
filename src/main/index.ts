import { app, shell, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage } from 'electron'
import { deflateSync } from 'zlib'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { is } from './is'
import * as vault from './vault'
import * as settings from './settings'
import * as vpn from './vpn'
import * as dbLaunch from './dbLaunch'
import * as otp from './otp'
import * as exportVault from './export'
import type { AppSettings, CredentialEntry, DbLaunchRequest, VpnConnectRequest, VpnType, VpnOtpRequest } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function buildTrayIcon(): ReturnType<typeof nativeImage.createFromDataURL> {
  const S = 32
  // Standard RGBA pixel buffer
  const img = Buffer.alloc(S * S * 4, 0)

  const set = (x: number, y: number, r: number, g: number, b: number, a = 255): void => {
    if (x < 0 || x >= S || y < 0 || y >= S) return
    const i = (y * S + x) * 4
    img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a
  }
  const white = (x: number, y: number): void => set(x, y, 255, 255, 255)
  const indigo = (x: number, y: number): void => set(x, y, 99, 102, 241)

  const inRR = (x: number, y: number, l: number, t: number, r: number, b: number, cr: number): boolean => {
    if (x < l || x > r || y < t || y > b) return false
    if (x < l + cr && y < t + cr) return Math.hypot(x - (l + cr), y - (t + cr)) < cr
    if (x > r - cr && y < t + cr) return Math.hypot(x - (r - cr), y - (t + cr)) < cr
    if (x < l + cr && y > b - cr) return Math.hypot(x - (l + cr), y - (b - cr)) < cr
    if (x > r - cr && y > b - cr) return Math.hypot(x - (r - cr), y - (b - cr)) < cr
    return true
  }

  // 1. Solid indigo background with rounded corners
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (inRR(x, y, 0, 0, S - 1, S - 1, 7)) indigo(x, y)

  // 2. Lock body (white filled rounded rect)
  for (let y = 18; y <= 26; y++)
    for (let x = 10; x <= 22; x++)
      if (inRR(x, y, 10, 18, 22, 26, 2)) white(x, y)

  // 3. Shackle arc (outer r=6.5, inner r=4) + legs
  for (let y = 8; y <= 14; y++)
    for (let x = 9; x <= 23; x++) {
      const d = Math.hypot(x - 16, y - 14)
      if (d >= 4 && d <= 6.5) white(x, y)
    }
  for (let y = 14; y <= 18; y++) {
    for (let x = 10; x <= 12; x++) white(x, y) // left leg
    for (let x = 20; x <= 22; x++) white(x, y) // right leg
  }

  // 4. Keyhole (cut from body with indigo)
  for (let y = 19; y <= 25; y++)
    for (let x = 13; x <= 19; x++)
      if (Math.hypot(x - 16, y - 21) <= 2.5 || (y >= 21 && y <= 24 && Math.abs(x - 16) <= 1.5))
        indigo(x, y)

  // ── Encode as PNG (platform-neutral, avoids BGRA vs RGBA confusion) ──────────
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    crcTable[n] = c >>> 0
  }
  const crc32 = (b: Buffer): number => {
    let c = 0xFFFFFFFF
    for (let i = 0; i < b.length; i++) c = (crcTable[(c ^ b[i]) & 0xFF] ?? 0) ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const mkChunk = (type: string, data: Buffer): Buffer => {
    const t = Buffer.from(type, 'ascii')
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
    const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crcBuf])
  }

  // Build PNG scanlines (filter type 0 = None)
  const sl = Buffer.alloc(S * (1 + S * 4))
  for (let y = 0; y < S; y++) {
    sl[y * (1 + S * 4)] = 0
    img.copy(sl, y * (1 + S * 4) + 1, y * S * 4, (y + 1) * S * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8; ihdr[9] = 6 // bit-depth=8, color-type=RGBA

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    mkChunk('IHDR', ihdr),
    mkChunk('IDAT', deflateSync(sl)),
    mkChunk('IEND', Buffer.alloc(0))
  ])

  return nativeImage.createFromDataURL(`data:image/png;base64,${png.toString('base64')}`)
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Show Vaultier',
      click: () => { mainWindow?.show(); mainWindow?.focus() }
    },
    { type: 'separator' },
    {
      label: 'Lock',
      click: () => {
        vault.lock()
        mainWindow?.webContents.send('vault:force-lock')
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates…',
      click: () => { autoUpdater.checkForUpdates() }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        vault.lock()
        tray?.destroy()
        app.quit()
      }
    }
  ])
}

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

  // Minimize to tray instead of closing
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // System tray
  tray = new Tray(buildTrayIcon())
  tray.setToolTip('Vaultier')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => { win.show(); win.focus() })

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
    const { entries } = await vault.createVault(password)
    return { ok: true, entries }
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

  ipcMain.handle('vault:resetPassword', async (_event, newPassword: string) => {
    try {
      const entries = await vault.resetVaultPassword(newPassword)
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

  ipcMain.handle('otp:request', async () => {
    try {
      const appSettings = await settings.getSettings()
      if (!appSettings.userEmail) throw new Error('No user email configured. Please set your email in Settings first.')
      if (!appSettings.smtpHost || !appSettings.smtpUser) throw new Error('SMTP is not configured. Please set up email in Settings first.')
      const result = await otp.requestOtp(appSettings, appSettings.userEmail)
      return { ok: true as const, ...result }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Failed to send OTP email' }
    }
  })

  ipcMain.handle('otp:verify', async (_event, enteredOtp: string) => {
    const valid = await otp.verifyOtp(enteredOtp)
    return { valid }
  })

  ipcMain.handle('otp:hasPending', async () => {
    return otp.hasPendingOtp()
  })

  ipcMain.handle('export:download', async (_event, entries: CredentialEntry[], exportedBy?: string) => {
    return exportVault.downloadExport(entries, exportedBy)
  })

  ipcMain.handle('export:share', async (_event, entries: CredentialEntry[], recipientEmail: string, exportedBy?: string) => {
    const appSettings = await settings.getSettings()
    return exportVault.shareExport(entries, recipientEmail, appSettings, exportedBy)
  })

  ipcMain.handle('import:open', async () => {
    return exportVault.openImport()
  })

  ipcMain.handle('update:install', () => {
    isQuitting = true
    autoUpdater.quitAndInstall()
  })
}

// ── Single-instance guard ────────────────────────────────────────────────────
// If another instance is already running, focus it and exit this one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // ── Auto-updater (only active in production builds) ───────────────────────
  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', { version: info.version })
    })

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update:downloaded', { version: info.version })
    })

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err.message)
    })

    // Check on startup, then every 4 hours
    autoUpdater.checkForUpdates()
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // Do not quit — the app lives in the tray
  // On macOS the dock keeps the app alive anyway
})
