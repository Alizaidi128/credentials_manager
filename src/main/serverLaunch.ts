import { spawn, exec } from 'child_process'
import type { ServerLaunchRequest, ServerLaunchResult } from '../shared/types'
import { showRdpHelper } from './rdpHelper'

const activeConnections = new Map<string, true>()

function connKey(serverType: string, host: string): string {
  return `${serverType}:${host}`
}

export function isConnected(serverType: string, host: string): boolean {
  return activeConnections.has(connKey(serverType, host))
}

export async function launchServer(
  winscpPath: string,
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
    return launchWinScp(winscpPath, host, port || '22', username, password, sftpServer, key)
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
