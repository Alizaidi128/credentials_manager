import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { VpnConnectRequest, VpnConnectResult, VpnDroppedEvent, VpnLogEvent } from '../shared/types'

const CONNECT_TIMEOUT_MS = 30000

type LogSink = (event: VpnLogEvent) => void
type DroppedSink = (event: VpnDroppedEvent) => void

/** Only one connect attempt (and one live tunnel) is tracked at a time —
 * the Cisco CLI itself only supports a single active session per machine. */
let activeChild: ChildProcessWithoutNullStreams | null = null

const SVC_CONFLICT = '__anyconnect_svc_conflict__'

function restartVpnAgentService(onLog: LogSink, requestId: string): Promise<void> {
  const emit = (l: string): void => { if (l.trim()) onLog({ requestId, line: l }) }
  return new Promise((resolve) => {
    const stop = spawn('net', ['stop', 'vpnagent'], { windowsHide: true })
    let buf = ''
    stop.stdout?.on('data', (c: Buffer) => (buf += c.toString('utf8')))
    stop.stderr?.on('data', (c: Buffer) => (buf += c.toString('utf8')))
    stop.on('exit', () => {
      buf.split(/\r?\n/).forEach(emit)
      buf = ''
      const start = spawn('net', ['start', 'vpnagent'], { windowsHide: true })
      start.stdout?.on('data', (c: Buffer) => (buf += c.toString('utf8')))
      start.stderr?.on('data', (c: Buffer) => (buf += c.toString('utf8')))
      start.on('exit', () => {
        buf.split(/\r?\n/).forEach(emit)
        setTimeout(resolve, 3000) // give the service time to fully start
      })
      start.on('error', () => setTimeout(resolve, 3000))
    })
    stop.on('error', () => { emit('Could not stop vpnagent — service may already be stopped'); resolve() })
  })
}

function connectCiscoAnyConnectOnce(
  cliPath: string,
  request: VpnConnectRequest,
  onLog: LogSink
): Promise<VpnConnectResult> {
  if (activeChild) {
    return Promise.resolve({
      ok: false,
      message: 'A VPN connection attempt is already in progress.'
    })
  }

  return new Promise((resolve) => {
    let settled = false
    // Accumulates *all* output seen so far (never cleared). A single chunk
    // from the OS pipe can contain several prompts at once (e.g. the
    // certificate warning's "[y/n]" together with "Username:"/"Password:"
    // printed right after), so prompts are tracked with individual "already
    // answered" guards instead of wiping the buffer after the first match —
    // wiping it previously discarded prompt text that had already arrived,
    // leaving the CLI waiting on input that was never sent.
    let buffer = ''
    // Several distinct [y/n] prompts can occur in one session (certificate
    // trust, then a separate login banner acceptance, ...), so this counts
    // how many prompts have appeared vs. how many we've answered, rather
    // than a one-shot flag that would only ever answer the first.
    let acceptPromptsAnswered = 0
    let sentUsername = false
    let sentPassword = false

    // "-s" puts vpncli in stdin-script mode instead of its normal interactive
    // mode. This matters beyond just letting us drive it non-interactively:
    // in interactive mode, vpncli reads masked fields (the password prompt)
    // directly from the real console device rather than redirected stdin, so
    // a plain piped write to that prompt is silently never seen. -s reads
    // every field — including the password — as a plain stdin line instead.
    const child = spawn(cliPath, ['-s'], { windowsHide: true })
    activeChild = child
    child.stdin.write(`connect ${request.host}\r\n`)

    const timeout = setTimeout(() => {
      finish(false, 'Timed out waiting for the VPN client to respond.')
    }, CONNECT_TIMEOUT_MS)

    function emit(line: string): void {
      if (line.trim()) onLog({ requestId: request.requestId, line })
    }

    function finish(ok: boolean, message: string): void {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ ok, message })
      if (!ok && activeChild === child) {
        child.kill()
      }
      if (activeChild === child) {
        activeChild = null
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      text.split(/\r?\n/).forEach(emit)
      if (settled) return // still surface late output to the log; stop acting on it

      buffer += text
      const lower = buffer.toLowerCase()

      const acceptPromptsSeen = (lower.match(/\[y\/n\]|y\/n\s*:|\[accept\]|accept\/deny/g) ?? []).length
      while (acceptPromptsAnswered < acceptPromptsSeen) {
        // Certificate-trust and banner prompts of this shape expect a bare
        // "y", not the word "accept" — anything else is silently ignored
        // and the CLI just re-waits on stdin forever. vpncli.exe is a
        // Windows console app reading a redirected pipe, so a bare "\n"
        // is sometimes not recognized as a submitted line — send "\r\n".
        child.stdin.write('y\r\n')
        acceptPromptsAnswered++
      }
      if (!sentUsername && /username/.test(lower)) {
        sentUsername = true
        child.stdin.write(`${request.username}\r\n`)
      }
      if (!sentPassword && /password/.test(lower)) {
        sentPassword = true
        child.stdin.write(`${request.password}\r\n`)
      }
      if (/state:\s*connected|connected successfully|already connected/.test(lower)) {
        finish(true, 'VPN connected.')
        return
      }
      // Deliberately specific: Cisco's own informational text contains loose
      // words like "error" and "denied" in benign sentences (e.g. "...unless
      // the reason for the error condition is known."), which would otherwise
      // trip a false failure while a prompt is still on its way.
      if (/connect not available.*another anyconnect|another anyconnect application is running/i.test(buffer)) {
        finish(false, SVC_CONFLICT)
        return
      }
      if (
        /login denied|login failed|authentication failed|connection( attempt)? (has failed|failed)|not able to establish|invalid (username|password|credentials)|vpn establishment capability failed/.test(
          lower
        )
      ) {
        const lastLine =
          text
            .split(/\r?\n/)
            .filter((l) => l.trim())
            .pop() ?? 'VPN connection failed.'
        finish(false, lastLine)
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      chunk
        .toString('utf8')
        .split(/\r?\n/)
        .forEach(emit)
    })

    child.on('error', (err) => {
      finish(false, `Could not start VPN client: ${err.message}`)
    })

    child.on('exit', (code) => {
      if (!settled) {
        finish(code === 0, code === 0 ? 'VPN client exited.' : `VPN client exited with code ${code}.`)
      } else if (activeChild === child) {
        activeChild = null
      }
    })
  })
}

export async function connectCiscoAnyConnect(
  cliPath: string,
  request: VpnConnectRequest,
  onLog: LogSink
): Promise<VpnConnectResult> {
  const result = await connectCiscoAnyConnectOnce(cliPath, request, onLog)
  if (result.message === SVC_CONFLICT) {
    onLog({ requestId: request.requestId, line: 'AnyConnect service conflict detected — restarting vpnagent service...' })
    await restartVpnAgentService(onLog, request.requestId)
    onLog({ requestId: request.requestId, line: 'Service restarted — retrying connection...' })
    return connectCiscoAnyConnectOnce(cliPath, request, onLog)
  }
  return result
}

export function disconnectCiscoAnyConnect(cliPath: string): Promise<VpnConnectResult> {
  return new Promise((resolve) => {
    const child = spawn(cliPath, ['disconnect'], { windowsHide: true })
    let output = ''
    child.stdout?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.stderr?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.on('error', (err) => resolve({ ok: false, message: err.message }))
    child.on('exit', (code) => {
      if (activeChild) activeChild = null
      resolve({
        ok: code === 0,
        message: output.trim() || (code === 0 ? 'Disconnected.' : `Exit code ${code}`)
      })
    })
  })
}

// Sangfor's EasyConnect is a Win32 GUI app that exposes no UI Automation
// tree and no real child windows (confirmed via scripts/inspect-window.ps1
// and inspect-window-win32.ps1 — it renders its whole login screen on one
// custom-drawn canvas), and its Windows build ignores the -d/-u/-p flags
// that Sangfor's separate Linux CLI build supports. The only remaining
// option is simulating real keystrokes into the window, done by
// scripts/sangfor-login.ps1. This relies on manually-confirmed behavior:
// EasyConnect auto-connects to its last-used server URL on launch, lands
// on a username/password screen with username already focused/populated,
// Tab moves focus to the password field, and Enter submits.
const SANGFOR_PROCESS_NAME = 'EasyConnect'
// Short pause between launching EasyConnect and the first script run.
// The PS1 itself polls for the window handle to appear (up to 15 s) and
// then waits for the login form to load, so this only needs to be long
// enough for the process to show up in the process list.
const SANGFOR_LAUNCH_SETTLE_MS = 1500

function sangforLoginScriptPath(): string {
  return join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'scripts', 'sangfor-login.ps1')
}

export function connectSangfor(
  clientPath: string,
  request: VpnConnectRequest,
  onLog: LogSink,
  settleMs: number
): Promise<VpnConnectResult> {
  return new Promise((resolve) => {
    function emit(line: string): void {
      if (line.trim()) onLog({ requestId: request.requestId, line })
    }

    function runLoginScript(onNotRunning: () => void): void {
      const ps = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          sangforLoginScriptPath(),
          '-ProcessName',
          SANGFOR_PROCESS_NAME,
          '-Password',
          request.password,
          '-SettleDelayMs',
          String(settleMs)
        ],
        { windowsHide: true }
      )

      let output = ''
      let sawNotRunning = false
      let sawFailed = false

      function handleChunk(chunk: Buffer): void {
        const text = chunk.toString('utf8')
        output += text
        text.split(/\r?\n/).forEach((line) => {
          emit(line)
          if (/no running process/i.test(line) || /not.*running|process.*not.*found/i.test(line)) sawNotRunning = true
          if (/^FAILED/.test(line)) sawFailed = true
        })
      }

      ps.stdout?.on('data', handleChunk)
      ps.stderr?.on('data', handleChunk)

      ps.on('error', (err) => {
        resolve({ ok: false, message: `Could not run Sangfor login automation: ${err.message}` })
      })

      ps.on('exit', (code) => {
        if (sawNotRunning) {
          onNotRunning()
          return
        }
        if (code === 0 && !sawFailed) {
          resolve({
            ok: true,
            message: 'Login keystrokes sent — check the EasyConnect window to confirm it actually connected.'
          })
        } else {
          resolve({ ok: false, message: output.trim() || `Login automation exited with code ${code}.` })
        }
      })
    }

    runLoginScript(() => {
      emit('EasyConnect is not running yet — launching it...')
      const child = spawn(clientPath, [], { detached: true, stdio: 'ignore' })
      child.unref()
      child.on('error', (err) => {
        resolve({ ok: false, message: `Could not start EasyConnect: ${err.message}` })
      })
      setTimeout(() => {
        runLoginScript(() => {
          resolve({ ok: false, message: 'EasyConnect still was not detected running after launching it.' })
        })
      }, SANGFOR_LAUNCH_SETTLE_MS)
    })
  })
}

// ── FortiClient VPN ───────────────────────────────────────────────────────────
//
// FortiClient 7.4.7+ exposes FortiVPN.exe --cli for non-interactive VPN
// control. FortiVPN.exe lives in the same directory as FortiClient.exe.
//
// "request.host" = tunnel name exactly as it appears in FortiClient's
// Remote Access tunnel list (must be pre-configured in the GUI first).
//
// FortiVPN.exe exits 0 on success, non-zero on failure, and writes
// human-readable status lines to stdout.

function runFortiVpn(exe: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true })
    let output = ''
    child.stdout?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.stderr?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.on('error', () => resolve({ code: 1, output }))
    child.on('exit', (code) => resolve({ code: code ?? 1, output }))
  })
}

function fortiIpsecScriptPath(): string {
  return join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'scripts', 'forticlient-ipsec.ps1')
}

export function connectFortiClient(
  _clientPath: string,
  request: VpnConnectRequest,
  onLog: LogSink
): Promise<VpnConnectResult> {
  return new Promise((resolve) => {
    function emit(line: string): void {
      if (line.trim()) onLog({ requestId: request.requestId, line })
    }

    const child = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-File', fortiIpsecScriptPath(),
      '-TunnelName', request.host,
      '-Username', request.username,
      '-Password', request.password
    ], { windowsHide: true })

    child.stdout?.on('data', (c: Buffer) => c.toString('utf8').split(/\r?\n/).forEach(emit))
    child.stderr?.on('data', (c: Buffer) => c.toString('utf8').split(/\r?\n/).forEach(emit))
    child.on('error', (err) => resolve({ ok: false, message: `Could not start PowerShell: ${err.message}` }))
    child.on('exit', (code) => {
      resolve(code === 0
        ? { ok: true, message: 'FortiClient IPSec VPN connected.' }
        : { ok: false, message: `FortiClient connection failed (exit ${code}). Check VPN log for details.` })
    })
  })
}

export function disconnectFortiClient(_clientPath: string): Promise<VpnConnectResult> {
  return new Promise((resolve) => {
    // GetActiveTunnel() returns the current tunnel name; disconnect it.
    const ps = `$vpn = New-Object -ComObject 'FCCOMInt.XVPN.1'; $t = $vpn.GetActiveTunnel(); if ($t) { $vpn.Disconnect($t); Write-Host "Disconnected $t" } else { Write-Host 'No active tunnel' }`
    const child = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true })
    let output = ''
    child.stdout?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.stderr?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.on('error', (err) => resolve({ ok: false, message: err.message }))
    child.on('exit', (code) => resolve({
      ok: code === 0,
      message: output.trim() || (code === 0 ? 'FortiClient VPN disconnected.' : 'Disconnect failed.')
    }))
  })
}

// ── Check Point Endpoint Security ─────────────────────────────────────────────
//
// CLI tool: trac.exe (in the Endpoint Connect install directory)
// Connect:    trac connect -s <site> -u <username> -p <password>
// Disconnect: trac disconnect
//
// For 2FA (email OTP), trac prompts on stdout after the password phase.
// We detect the prompt and call onOtpRequired(), which the caller resolves
// when the user provides the OTP via the UI.  The OTP is then written to stdin.

const CHECKPOINT_CONNECT_TIMEOUT_MS = 90000

export async function connectCheckpoint(
  tracPath: string,
  request: VpnConnectRequest,
  onLog: LogSink,
  onOtpRequired: (prompt: string) => Promise<string>
): Promise<VpnConnectResult> {
  function emit(line: string): void {
    if (line.trim()) onLog({ requestId: request.requestId, line })
  }

  const tracDir = tracPath.replace(/[/\\][^/\\]+$/, '')

  // Clear any lingering previous connection before attempting a new one.
  emit('Clearing any previous connection…')
  await runFortiVpn(tracPath, ['disconnect'])

  return new Promise((resolve) => {
    let settled = false
    let buffer = ''
    let otpSent = false
    let otpProbeTimer: ReturnType<typeof setTimeout>

    function finish(ok: boolean, message: string): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(otpProbeTimer)
      if (!ok) child.kill()
      resolve({ ok, message })
    }

    emit(`Running: trac connect -s "${request.host}" -u "${request.username}" -p ***`)
    const child = spawn(
      tracPath,
      ['connect', '-s', request.host, '-u', request.username, '-p', request.password],
      { windowsHide: true, cwd: tracDir }
    )
    emit(`trac.exe started (pid ${child.pid})`)

    const timer = setTimeout(() => {
      finish(false, 'Timed out waiting for Check Point VPN to connect.')
    }, CHECKPOINT_CONNECT_TIMEOUT_MS)

    // trac.exe writes its "Challenge:" OTP prompt to the Windows console device,
    // not to the stdout pipe — so the regex below never fires.  Instead we show
    // the OTP dialog proactively after a fixed delay: long enough for trac to
    // reach the challenge step (typically 8-15 s), short enough that the user
    // still has time to enter the OTP before the process times out.
    const otpProbeMs = 12000
    otpProbeTimer = setTimeout(() => {
      if (!settled && !otpSent) {
        otpSent = true
        emit('Waiting for OTP — check your email and enter the code in the dialog.')
        onOtpRequired('Enter the one-time password sent to your email').then((otp) => {
          if (settled) return
          emit('OTP received — submitting…')
          child.stdin?.write(`${otp}\r\n`)
        }).catch(() => {
          finish(false, 'OTP entry cancelled.')
        })
      }
    }, otpProbeMs)

    function handleChunk(chunk: Buffer): void {
      const text = chunk.toString('utf8')
      buffer += text
      text.split(/\r?\n/).forEach(emit)
      if (settled) return

      const lower = buffer.toLowerCase()

      // Success
      if (/connected|connection established|vpn.*connected/.test(lower)) {
        finish(true, 'Check Point VPN connected.')
        return
      }

      // Hard errors (after OTP probe timer fires we no longer want these to
      // kill the process — trac may still be processing the OTP response)
      if (!otpSent && /authentication failed|invalid (user|password|credentials)|site .* not found/i.test(buffer)) {
        const lastLine = buffer.split(/\r?\n/).filter((l) => l.trim()).pop() ?? ''
        finish(false, lastLine || 'Check Point VPN connection failed.')
        return
      }

      // OTP / challenge-response prompt — detect and ask the user
      if (!otpSent && /one.?time|otp|passcode|challenge|enter.*code|verification code/i.test(buffer)) {
        otpSent = true
        const promptLine = buffer.split(/\r?\n/).filter((l) => l.trim()).pop() ?? 'Enter OTP'
        onOtpRequired(promptLine).then((otp) => {
          if (settled) return
          child.stdin?.write(`${otp}\r\n`)
        }).catch(() => {
          finish(false, 'OTP entry cancelled.')
        })
      }
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', handleChunk)

    child.on('error', (err) => {
      finish(false, `Could not start trac.exe: ${err.message}`)
    })

    child.on('exit', (code) => {
      if (!settled) {
        finish(
          code === 0,
          code === 0
            ? 'Check Point VPN connected.'
            : buffer.trim() || `trac.exe exited with code ${code}.`
        )
      }
    })
  })
}

export function disconnectCheckpoint(tracPath: string): Promise<VpnConnectResult> {
  return new Promise((resolve) => {
    const child = spawn(tracPath, ['disconnect'], { windowsHide: true })
    let output = ''
    child.stdout?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.stderr?.on('data', (c: Buffer) => (output += c.toString('utf8')))
    child.on('error', (err) => resolve({ ok: false, message: `Could not run trac.exe: ${err.message}` }))
    child.on('exit', (code) => {
      resolve({
        ok: code === 0,
        message: output.trim() || (code === 0 ? 'Check Point VPN disconnected.' : `trac.exe exited with code ${code}.`)
      })
    })
  })
}

// ── OpenConnect (FortiClient SSL-VPN) ────────────────────────────────────────
//
// openconnect --protocol=fortinet connects to FortiClient SSL-VPN gateways
// without using the FortiClient application at all.  The process stays alive
// for the duration of the tunnel (like AnyConnect's vpncli); we kill it to
// disconnect.  openconnect writes status to stderr; success is indicated by
// "Tunnel connected" / "ESP tunnel connected" in the output.
//
// FortiGate gateways almost always use self-signed or private-CA certificates.
// GnuTLS builds of openconnect exit immediately on cert verification failure
// rather than prompting.  We therefore do a pre-flight fetch of the server
// certificate fingerprint (via .NET TcpClient/SslStream, ignoring validation)
// and pass it as --servercert=pin-sha256:HASH so openconnect can trust it.
//
// Requirements on the machine:
//   • openconnect.exe installed (openconnect-gui package includes it)
//   • TAP-Windows adapter driver (bundled with the installer)
//   • App must run as Administrator (TAP interface creation requires it)

let openConnectChild: ChildProcessWithoutNullStreams | null = null
let openConnectBusy = false
const intentionalStops = new WeakSet<ChildProcessWithoutNullStreams>()

const OPENCONNECT_MAX_ATTEMPTS = 3
const OPENCONNECT_ATTEMPT_TIMEOUT_MS = 90000

interface TunnelInfo {
  ip: string
  mtu: number | null
  routes: { addr: string; mask: string }[]
  dns: string[]
}

interface AttemptResult {
  ok: boolean
  message: string
  retryable: boolean
}

// OpenConnect runs its --script as `cscript.exe "<script>"` and BLOCKS until it
// exits; PPP negotiation with the FortiGate only starts afterwards. The stock
// vpnc-script-win.js shells out once per route (netsh/route via WSH, ~0.3 s each),
// which takes 10+ s with ~30 routes. The gateway gives up on a silent client after
// roughly 18 s and closes the tunnel — the "connects only sometimes" failure.
// So OpenConnect gets an instant no-op script, and the adapter is configured
// here in parallel (configureTunnel), outside OpenConnect's critical path.
function ensureNoopScript(): string {
  const path = join(app.getPath('userData'), 'vaultier-noop.js')
  writeFileSync(path, 'WScript.Quit(0);\r\n', 'utf8')
  return path
}

// Mirrors what vpnc-script-win.js does for "connect" with split-include routes:
// MTU, IPv4 address on the adapter, DNS, and one route per network via the
// tunnel address. Verifies the address really landed before reporting success.
function buildTunnelScript(ifIndex: number, info: TunnelInfo): string {
  const lines = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$idx = ${ifIndex}`,
    `$ip = '${info.ip}'`
  ]
  if (info.mtu) {
    lines.push(`netsh interface ipv4 set subinterface $idx mtu=${info.mtu} store=active 2>&1 | Out-Null`)
  }
  lines.push(`netsh interface ip set address $idx static $ip 255.255.255.255 store=active 2>&1 | Out-Null`)
  if (info.dns.length > 0) {
    const servers = info.dns.map((d) => `'${d}'`).join(',')
    lines.push(`Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses @(${servers})`)
  }
  for (const r of info.routes) {
    lines.push(`route add ${r.addr} mask ${r.mask} $ip if $idx 2>&1 | Out-Null`)
  }
  lines.push(
    `$ok = [bool](Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $ip })`,
    `$n = @(Get-NetRoute -InterfaceIndex $idx -AddressFamily IPv4 | Where-Object { $_.NextHop -eq $ip }).Count`,
    `Write-Output ('VAULTIER_CFG ip=' + $(if ($ok) { 'OK' } else { 'MISSING' }) + ' routes=' + $n)`
  )
  return lines.join('\n')
}

function spawnPowerShellFile(fileName: string, script: string, captureOutput: boolean): ReturnType<typeof spawn> {
  const file = join(app.getPath('userData'), fileName)
  writeFileSync(file, script, 'utf8')
  return spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
    { windowsHide: true, stdio: captureOutput ? ['ignore', 'pipe', 'ignore'] : 'ignore' }
  )
}

function configureTunnel(
  ifIndex: number,
  info: TunnelInfo,
  emit: (l: string) => void
): Promise<boolean> {
  return new Promise((resolve) => {
    emit(`Configuring VPN adapter (index ${ifIndex}): ${info.ip}, ${info.routes.length} routes, ${info.dns.length} DNS servers...`)
    let ps: ReturnType<typeof spawn>
    try {
      ps = spawnPowerShellFile('vaultier-tunnel.ps1', buildTunnelScript(ifIndex, info), true)
    } catch (err) {
      emit(`Adapter setup failed to start: ${err instanceof Error ? err.message : String(err)}`)
      resolve(false)
      return
    }
    let out = ''
    const timer = setTimeout(() => ps.kill(), 30000)
    ps.stdout?.on('data', (c: Buffer) => { out += c.toString('utf8') })
    ps.on('error', (err) => {
      clearTimeout(timer)
      emit(`Adapter setup failed to start: ${err.message}`)
      resolve(false)
    })
    ps.on('exit', () => {
      clearTimeout(timer)
      const m = out.match(/VAULTIER_CFG ip=(OK|MISSING) routes=(\d+)/)
      if (!m) {
        emit('Adapter setup did not report a result.')
        resolve(false)
        return
      }
      const routeCount = parseInt(m[2], 10)
      if (m[1] !== 'OK') {
        emit('Adapter setup failed: the VPN address was not applied to the adapter.')
        resolve(false)
        return
      }
      if (routeCount < info.routes.length) {
        emit(`Warning: only ${routeCount} of ${info.routes.length} routes were installed.`)
      } else {
        emit(`VPN adapter ready: ${info.ip}, ${routeCount} routes.`)
      }
      resolve(true)
    })
  })
}

// A killed OpenConnect cannot remove its Wintun adapter, which would leave stale
// routes pointing at a dead interface. Only touches an adapter that is Wintun.
function cleanupTunnel(ifIndex: number): void {
  const script = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$a = Get-NetAdapter -InterfaceIndex ${ifIndex}`,
    `if ($a -and $a.InterfaceDescription -like '*Wintun*') {`,
    `  Get-NetRoute -InterfaceIndex ${ifIndex} -AddressFamily IPv4 | Where-Object { $_.NextHop -ne '0.0.0.0' } | Remove-NetRoute -Confirm:$false`,
    `  Get-NetIPAddress -InterfaceIndex ${ifIndex} -AddressFamily IPv4 | Remove-NetIPAddress -Confirm:$false`,
    `}`
  ].join('\n')
  try {
    spawnPowerShellFile('vaultier-cleanup.ps1', script, false).on('error', () => undefined)
  } catch {
    // best effort — Windows removes the orphaned adapter on the next connect anyway
  }
}

// Probe the server with a dummy --servercert pin. OpenConnect will fail but
// print the real pin in its error output, which we then parse and reuse.
function probeServerCertPin(
  openconnectPath: string,
  server: string,
  emit: (l: string) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(
      openconnectPath,
      ['--protocol=fortinet', '--servercert=pin-sha256:AAAA==', '--non-inter', server],
      { windowsHide: true }
    )
    let output = ''
    const collect = (c: Buffer): void => { output += c.toString('utf8') }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', () => resolve(null))
    child.on('exit', () => {
      // openconnect prints: "...match server's certificate: pin-sha256:BASE64="
      const match = output.match(/pin-sha256:[A-Za-z0-9+/]+=*/)
      const pin = match?.[0]
      if (pin && pin !== 'pin-sha256:AAAA==') {
        emit(`Server cert pin: ${pin}`)
        resolve(pin)
      } else {
        emit('Could not extract server cert pin from probe — connection may fail')
        resolve(null)
      }
    })
  })
}

function runOpenConnectAttempt(
  openconnectPath: string,
  request: VpnConnectRequest,
  server: string,
  certArgs: string[],
  scriptPath: string,
  emit: (l: string) => void,
  onDropped: DroppedSink
): Promise<AttemptResult> {
  return new Promise((resolve) => {
    const info: TunnelInfo = { ip: '', mtu: null, routes: [], dns: [] }
    let settled = false
    let connected = false
    let tunnelUp = false
    let configuring = false
    let ifIndex: number | null = null
    let lastLine = ''
    let heartbeatNoted = false
    let lastWasHeartbeat = false

    const child = spawn(
      openconnectPath,
      [
        '--protocol=fortinet',
        `--script=${scriptPath}`,
        `--user=${request.username}`,
        '--passwd-on-stdin',
        ...certArgs,
        server
      ],
      { windowsHide: true }
    ) as ChildProcessWithoutNullStreams
    openConnectChild = child

    function settle(result: AttemptResult): void {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    function stopChild(): void {
      intentionalStops.add(child)
      if (openConnectChild === child) openConnectChild = null
      child.kill()
    }

    const timeout = setTimeout(() => {
      if (settled) return
      stopChild()
      settle({ ok: false, message: 'Timed out waiting for OpenConnect to connect.', retryable: false })
    }, OPENCONNECT_ATTEMPT_TIMEOUT_MS)

    function startConfigure(): void {
      if (configuring || ifIndex === null) return
      configuring = true
      if (!info.ip) {
        stopChild()
        settle({ ok: false, message: 'OpenConnect did not report a VPN address.', retryable: true })
        return
      }
      void configureTunnel(ifIndex, info, emit).then((ok) => {
        if (settled) return
        if (!ok) {
          stopChild()
          settle({ ok: false, message: 'Could not configure the VPN adapter.', retryable: true })
          return
        }
        connected = true
        settle({ ok: true, message: 'OpenConnect SSL VPN connected.', retryable: false })
      })
    }

    function onLine(raw: string): void {
      const line = raw.trimEnd()
      if (!line.trim()) return

      // FortiGate sends GFtype heartbeat frames that OpenConnect logs as
      // "Unexpected pre-PPP packet header" plus a hex dump. They are log noise
      // on a healthy tunnel, so show the first one and hide the repeats.
      if (/^Unexpected pre-PPP packet header/i.test(line)) {
        lastWasHeartbeat = true
        if (!heartbeatNoted) {
          heartbeatNoted = true
          emit('FortiGate heartbeat packet received (OpenConnect ignores these). Further ones are hidden.')
        }
        return
      }
      if (lastWasHeartbeat && /^[<>]\s+[0-9a-f]{4}:/i.test(line)) return
      lastWasHeartbeat = false

      emit(line)
      lastLine = line

      let m: RegExpMatchArray | null
      if ((m = line.match(/Got Legacy IP address (\d+\.\d+\.\d+\.\d+)/))) {
        info.ip = m[1]
      } else if ((m = line.match(/Got IPv4 route (\d+\.\d+\.\d+\.\d+)\/(\d+\.\d+\.\d+\.\d+)/))) {
        const [, addr, mask] = m
        if (!info.routes.some((r) => r.addr === addr && r.mask === mask)) info.routes.push({ addr, mask })
      } else if ((m = line.match(/Got IPv4 DNS server (\d+\.\d+\.\d+\.\d+)/))) {
        if (!info.dns.includes(m[1])) info.dns.push(m[1])
      } else if ((m = line.match(/Requesting calculated MTU of (\d+)/))) {
        info.mtu = parseInt(m[1], 10)
      } else if (/Established DTLS connection|Configured as \d+\.\d+\.\d+\.\d+/i.test(line)) {
        tunnelUp = true
      } else if ((m = line.match(/Using Wintun device '[^']*', index (\d+)/i))) {
        tunnelUp = true
        ifIndex = parseInt(m[1], 10)
        startConfigure()
      } else if (/authentication failure|login failed|no such host|connection refused|failed to open https/i.test(line)) {
        stopChild()
        settle({ ok: false, message: line, retryable: false })
      }
    }

    function attach(stream: NodeJS.ReadableStream | null): void {
      let buf = ''
      stream?.on('data', (c: Buffer) => {
        buf += c.toString('utf8')
        const parts = buf.split(/\r?\n/)
        buf = parts.pop() ?? ''
        parts.forEach(onLine)
      })
      stream?.on('end', () => {
        if (buf) onLine(buf)
        buf = ''
      })
    }
    attach(child.stdout)
    attach(child.stderr)

    child.stdin.on('error', () => undefined)
    child.stdin.write(`${request.password}\n`)

    child.on('error', (err) => {
      settle({ ok: false, message: `Could not start OpenConnect: ${err.message}`, retryable: false })
    })

    child.on('exit', (code) => {
      if (openConnectChild === child) openConnectChild = null
      if (ifIndex !== null) cleanupTunnel(ifIndex)
      const intentional = intentionalStops.has(child)
      if (connected) {
        if (!intentional) {
          onDropped({
            requestId: request.requestId,
            message: `VPN tunnel dropped${lastLine ? `: ${lastLine}` : '.'}`
          })
        }
        return
      }
      settle({
        ok: false,
        message: lastLine || `OpenConnect exited with code ${code}.`,
        retryable: tunnelUp && !intentional
      })
    })
  })
}

export async function connectOpenConnect(
  openconnectPath: string,
  request: VpnConnectRequest,
  onLog: LogSink,
  onDropped: DroppedSink
): Promise<VpnConnectResult> {
  if (openConnectChild || openConnectBusy) {
    return { ok: false, message: 'An OpenConnect VPN session is already active.' }
  }
  openConnectBusy = true

  function emit(line: string): void {
    if (line.trim()) onLog({ requestId: request.requestId, line })
  }

  try {
    const server = request.port?.trim() ? `${request.host}:${request.port.trim()}` : request.host

    let scriptPath: string
    try {
      scriptPath = ensureNoopScript()
    } catch (err) {
      return {
        ok: false,
        message: `Could not prepare OpenConnect script: ${err instanceof Error ? err.message : String(err)}`
      }
    }

    emit('Probing server certificate...')
    const certPin = await probeServerCertPin(openconnectPath, server, emit)
    const certArgs = certPin ? [`--servercert=${certPin}`] : []

    let result: AttemptResult = { ok: false, message: 'OpenConnect did not start.', retryable: false }
    for (let attempt = 1; attempt <= OPENCONNECT_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        emit(`Tunnel dropped during setup — retrying (${attempt}/${OPENCONNECT_MAX_ATTEMPTS})...`)
        await new Promise((r) => setTimeout(r, 1500))
      }
      result = await runOpenConnectAttempt(
        openconnectPath, request, server, certArgs, scriptPath, emit, onDropped
      )
      if (result.ok || !result.retryable) break
    }
    return { ok: result.ok, message: result.message }
  } finally {
    openConnectBusy = false
  }
}

export function disconnectOpenConnect(): Promise<VpnConnectResult> {
  const child = openConnectChild
  if (!child) {
    return Promise.resolve({ ok: true, message: 'No active OpenConnect session.' })
  }
  intentionalStops.add(child)
  openConnectChild = null
  child.kill()
  return Promise.resolve({ ok: true, message: 'OpenConnect SSL VPN disconnected.' })
}

// Deliberately not automated: killing EasyConnect.exe (via taskkill) gets
// silently respawned by its own watchdog service (SangforPromoteService /
// SangforServiceClient), which is very likely an intentional corporate
// anti-tamper feature — fighting it doesn't actually disconnect anything,
// it just falsely reports success while the tunnel stays up in the tray.
// The real disconnect (tray icon -> right-click -> Logout) opens a menu
// that, like the main window, is fully custom-drawn with zero accessible
// controls (confirmed via scripts/inspect-tray.ps1), so automating that
// click reliably would need fragile hardcoded pixel coordinates. Surfacing
// clear guidance here is more honest than a fake "success".
export function disconnectSangfor(): Promise<VpnConnectResult> {
  return Promise.resolve({
    ok: true,
    message:
      "EasyConnect can't be safely disconnected from here — right-click its icon in the system tray and choose Logout."
  })
}
