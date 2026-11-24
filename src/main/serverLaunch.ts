import { spawn, exec } from 'child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { ServerLaunchRequest, ServerLaunchResult } from '../shared/types'
import { scrambleNxPassword } from './nxPassword'
import { showRdpHelper } from './rdpHelper'

export interface ServerClientPaths {
  winscpPath: string
  nomachinePath: string
}

const activeConnections = new Map<string, true>()

function connKey(serverType: string, host: string): string {
  return `${serverType}:${host}`
}

export function isConnected(serverType: string, host: string): boolean {
  return activeConnections.has(connKey(serverType, host))
}

export async function launchServer(
  paths: ServerClientPaths,
  request: ServerLaunchRequest
): Promise<ServerLaunchResult> {
  const { serverType, host, port, username, password, sftpServer } = request

  if (!host.trim()) return { ok: false, message: 'Server host is not configured.' }
  if (!username.trim()) return { ok: false, message: 'Server username is not configured.' }

  const key = connKey(serverType, host)
  if (activeConnections.has(key)) {
    return { ok: false, message: `A session for "${host}" is already open. Close it first.` }
  }

  if (serverType === 'winscp') {
    return launchWinScp(paths.winscpPath, host, port || '22', username, password, sftpServer, key)
  }
  if (serverType === 'nomachine') {
    return launchNoMachine(paths.nomachinePath, host, port || '22', username, password)
  }
  if (serverType === 'rdp') {
    return launchRdp(host, port || '3389', username, password, key)
  }

  return { ok: false, message: `Unknown server type: ${serverType}` }
}

function launchWinScp(
  winscpPath: string,
  host: string,
  port: string,
  username: string,
  password: string,
  sftpServer: string,
  key: string
): ServerLaunchResult {
  const encodedUser = encodeURIComponent(username)
  const encodedPass = encodeURIComponent(password)
  const url = `sftp://${encodedUser}:${encodedPass}@${host}:${port}/`

  const args = ['/reuse', url]
  if (sftpServer.trim()) {
    args.push('/rawsettings', `SftpServer=${sftpServer.trim()}`)
  }

  const exe = winscpPath?.trim() || 'WinSCP.exe'

  let proc: ReturnType<typeof spawn>
  try {
    proc = spawn(exe, args, { detached: true, stdio: 'ignore' })
    proc.unref()
  } catch (err) {
    return {
      ok: false,
      message: `Failed to launch WinSCP: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // /reuse ensures the session opens inside the existing WinSCP window rather
  // than spawning a second window — no need to track individual tabs.
  proc.on('error', (err) => console.error('WinSCP error:', err.message))

  return { ok: true, message: 'WinSCP opened.' }
}

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Minimal NoMachine session file, using the same keys NoMachine itself writes for
// a saved system-user password login. With `auth` (the password scrambled the way
// NoMachine does) and "Remember password" on, NoMachine logs straight in; without
// it, NoMachine shows its login dialog.
function buildNxSession(host: string, port: string, username: string, auth: string | null): string {
  return `<!DOCTYPE NXClientSettings>
<NXClientSettings version="2.3" application="nxclient" >
 <group name="General" >
  <option key="Connection service" value="nx" />
  <option key="NoMachine daemon port" value="4000" />
  <option key="Server host" value="${xmlEscape(host)}" />
  <option key="Server port" value="${xmlEscape(port)}" />
  <option key="Remember password" value="${auth ? 'true' : 'false'}" />
  <option key="Remember username" value="true" />
 </group>
 <group name="Login" >
  <option key="Server authentication method" value="system" />
  <option key="NX login method" value="password" />
  <option key="Last selected user login" value="system user" />
  <option key="User" value="${xmlEscape(username)}" />${auth ? `\n  <option key="Auth" value="${xmlEscape(auth)}" />` : ''}
 </group>
</NXClientSettings>
`
}

// NoMachine rewrites the session file it was started with (adding all its defaults,
// and keeping a saved password), so the file can hold the scrambled password again
// after we delete it. Delete it after launch, again later in case it came back,
// and sweep anything left over when the app starts or quits.
const SESSION_CLEANUP_DELAYS_MS = [30_000, 120_000, 600_000]

function nomachineSessionDir(): string {
  return join(app.getPath('userData'), 'nomachine')
}

export function sweepNoMachineSessions(): void {
  try {
    const dir = nomachineSessionDir()
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name.toLowerCase().endsWith('.nxs')) {
        try { unlinkSync(join(dir, name)) } catch { /* in use — a later sweep gets it */ }
      }
    }
  } catch {
    // best effort
  }
}

function scheduleSessionFileCleanup(file: string): void {
  for (const delay of SESSION_CLEANUP_DELAYS_MS) {
    const timer = setTimeout(() => {
      try { unlinkSync(file) } catch { /* already gone or in use */ }
    }, delay)
    timer.unref()
  }
}

function launchNoMachine(
  nomachinePath: string,
  host: string,
  port: string,
  username: string,
  password: string
): ServerLaunchResult {
  const exe = nomachinePath?.trim() || 'nxplayer.exe'
  if (/[\\/]/.test(exe) && !existsSync(exe)) {
    return {
      ok: false,
      message: `NoMachine was not found at "${exe}". Set the correct path to nxplayer.exe in Settings.`
    }
  }

  // null when the password can't be scrambled (empty, non-ASCII, too long): then
  // NoMachine's login dialog is used with the manual credential helper instead.
  const auth = scrambleNxPassword(password)

  let sessionFile: string
  try {
    sweepNoMachineSessions()
    const dir = nomachineSessionDir()
    mkdirSync(dir, { recursive: true })
    sessionFile = join(dir, `${`${host}-${username}`.replace(/[^A-Za-z0-9._-]/g, '_')}.nxs`)
    writeFileSync(sessionFile, buildNxSession(host, port, username, auth), 'utf8')
  } catch (err) {
    return {
      ok: false,
      message: `Could not write the NoMachine session file: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  scheduleSessionFileCleanup(sessionFile)

  try {
    const proc = spawn(exe, ['--session', sessionFile], { detached: true, stdio: 'ignore' })
    proc.on('error', (err) => console.error('NoMachine error:', err.message))
    proc.unref()
  } catch (err) {
    try { unlinkSync(sessionFile) } catch { /* nothing to clean up */ }
    return {
      ok: false,
      message: `Failed to launch NoMachine: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (auth) {
    return { ok: true, message: 'NoMachine opened — logging in automatically.' }
  }

  showRdpHelper(host, username, password, {
    title: 'NoMachine Credentials',
    pasteHint: 'Paste into the NoMachine login dialog'
  })
  return {
    ok: true,
    message:
      'NoMachine opened — this password cannot be filled in automatically, so paste it (already on the clipboard) into its login dialog.'
  }
}

async function launchRdp(
  host: string,
  port: string,
  username: string,
  password: string,
  key: string
): Promise<ServerLaunchResult> {
  const target = port && port !== '3389' ? `${host}:${port}` : host

  await new Promise<void>((resolve) => {
    exec(`cmdkey /add:${host} /user:"${username}" /pass:"${password}"`, () => resolve())
  })

  let proc: ReturnType<typeof spawn>
  try {
    proc = spawn('mstsc', [`/v:${target}`], { detached: true, stdio: 'ignore' })
    proc.unref()
  } catch (err) {
    exec(`cmdkey /delete:${host}`)
    return {
      ok: false,
      message: `Failed to launch Remote Desktop: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  activeConnections.set(key, true)

  const cleanup = (): void => {
    activeConnections.delete(key)
    exec(`cmdkey /delete:${host}`)
  }

  proc.on('exit', cleanup)
  proc.on('error', (err) => {
    cleanup()
    console.error('mstsc error:', err.message)
  })

  // Remove credential from Windows Credential Manager after mstsc has picked it up
  setTimeout(() => exec(`cmdkey /delete:${host}`), 8000)

  // Show floating credential helper so user can copy-paste into Windows Security dialog
  showRdpHelper(host, username, password)

  return { ok: true, message: 'Remote Desktop opened.' }
}
