import { appendFileSync } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, clipboard, screen } from 'electron'

let helperWin: BrowserWindow | null = null

export interface HelperField {
  label: string
  value: string
  secret?: boolean
}

export interface CredentialHelperSpec {
  title: string
  subtitle: string
  fields: HelperField[]
  /** Index of the field that is put on the clipboard and copied by the main button. */
  copyIndex: number
  pasteHint: string
}

export interface CredentialHelperOptions {
  title?: string
  pasteHint?: string
}

export function showRdpHelper(
  host: string,
  username: string,
  password: string,
  options: CredentialHelperOptions = {}
): void {
  showCredentialHelper({
    title: options.title ?? 'RDP Credentials',
    subtitle: host,
    fields: [
      { label: 'Username', value: username },
      { label: 'Password', value: password, secret: true }
    ],
    copyIndex: 1,
    pasteHint: options.pasteHint ?? 'Paste into the Windows Security dialog'
  })
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// JSON that is safe to embed inside an inline <script> (a value containing
// "</script>" must not be able to end the script block).
const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

export function showCredentialHelper(spec: CredentialHelperSpec): void {
  const { title, subtitle, fields, pasteHint } = spec
  if (fields.length === 0) return
  const copyIndex = Math.min(Math.max(spec.copyIndex, 0), fields.length - 1)
  const copyLabel = fields[copyIndex].label

  clipboard.writeText(fields[copyIndex].value)

  if (helperWin && !helperWin.isDestroyed()) {
    helperWin.close()
  }

  const rows = fields
    .map(
      (f, i) => `  <div>
    <div class="field-label">${esc(f.label)}</div>
    <div class="field-row">
      <div class="field-val" id="v${i}">${f.secret ? '&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;' : esc(f.value)}</div>${
        f.secret
          ? `\n      <button class="icon-btn" title="Show/hide" onclick="toggle(${i})" id="eye${i}">&#128065;</button>`
          : ''
      }
      <button class="icon-btn" title="Copy ${esc(f.label.toLowerCase())}" onclick="copyField(${i})">&#x2398;</button>
    </div>
  </div>`
    )
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1e1b4b;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    height: 100%;
    -webkit-app-region: drag;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .title { font-size: 12px; font-weight: 600; color: #a5b4fc; letter-spacing: 0.04em; text-transform: uppercase; }
  .host { font-size: 11px; color: #94a3b8; margin-top: 1px; font-family: monospace; }
  .close-btn {
    -webkit-app-region: no-drag;
    background: none; border: none; color: #64748b; cursor: pointer;
    font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px;
  }
  .close-btn:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
  .body { padding: 12px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .field-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .field-row { display: flex; align-items: center; gap: 6px; }
  .field-val {
    flex: 1; min-width: 0; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px; padding: 6px 10px; font-family: monospace; font-size: 12px;
    color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .icon-btn {
    -webkit-app-region: no-drag;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px; color: #94a3b8; cursor: pointer; padding: 5px 7px;
    font-size: 13px; line-height: 1; flex-shrink: 0;
  }
  .icon-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
  .copy-btn {
    -webkit-app-region: no-drag;
    margin-top: 4px; width: 100%; padding: 8px;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    border: none; border-radius: 7px; color: white;
    font-size: 12px; font-weight: 600; cursor: pointer; letter-spacing: 0.02em;
  }
  .copy-btn:hover { background: linear-gradient(135deg, #4f46e5, #4338ca); }
  .copy-btn.ok { background: linear-gradient(135deg, #22c55e, #16a34a); }
  .hint { font-size: 10px; color: #475569; text-align: center; margin-top: 2px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="title">${esc(title)}</div>
    <div class="host">${esc(subtitle)}</div>
  </div>
  <button class="close-btn" onclick="window.close()">&#x2715;</button>
</div>
<div class="body">
${rows}
  <button class="copy-btn" id="mainBtn" onclick="copyMain()">&#x2398;&nbsp; Copy ${esc(copyLabel)}</button>
  <div class="hint" id="hint">${esc(copyLabel)} auto-copied to clipboard</div>
</div>
<script>
  const fields = ${scriptJson(fields.map((f) => ({ v: f.value, s: !!f.secret, l: f.label })))};
  const copyIndex = ${copyIndex};
  const copyLabel = ${scriptJson(copyLabel)};
  const pasteHint = ${scriptJson(pasteHint)};
  const visible = {};

  function toggle(i) {
    visible[i] = !visible[i];
    document.getElementById('v' + i).textContent = visible[i] ? fields[i].v : '••••••••';
    document.getElementById('eye' + i).innerHTML = visible[i] ? '&#128064;' : '&#128065;';
  }

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // Copying the main value (the password / token the user is here for) finishes the
  // job, so the window closes itself. Copying a secondary field (e.g. the username)
  // keeps it open so the main value can still be copied afterwards.
  async function copyField(i) {
    const hint = document.getElementById('hint');
    const ok = await writeClipboard(fields[i].v);
    if (!ok) {
      hint.textContent = 'Copy failed - select the text and copy it manually';
      return;
    }
    if (i !== copyIndex) {
      hint.textContent = fields[i].l + ' copied';
      return;
    }
    const btn = document.getElementById('mainBtn');
    btn.textContent = '✓  Copied!';
    btn.classList.add('ok');
    hint.textContent = pasteHint;
    setTimeout(() => window.close(), 450);
  }

  function copyMain() {
    return copyField(copyIndex);
  }
</script>
</body>
</html>`

  const WIDTH = 300
  const HEIGHT = 114 + fields.length * 58
  // Top-right corner of the work area: centred, it sat on top of the login fields
  // of the very app (NoMachine / the Windows Security dialog) it was meant to help.
  const area = screen.getPrimaryDisplay().workArea

  const MAX_ATTEMPTS = 3
  const url = (() => {
    try {
      return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    } catch (err) {
      // The value is already on the clipboard, so the user can still paste it.
      logHelperFailure(`${title}: could not be built: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  })()
  if (!url) return

  const open = (attempt: number): void => {
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: area.x + area.width - WIDTH - 16,
      y: area.y + 16,
      show: false,
      backgroundColor: '#1e1b4b',
      alwaysOnTop: true,
      frame: false,
      resizable: false,
      skipTaskbar: false,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // The Chromium sandbox made this window's renderer crash intermittently
        // (about 1 open in 15 on a Kaspersky machine, 0 in 60 without it), leaving a
        // blank white window. The page is our own static HTML, with navigation locked
        // below, so nothing untrusted is ever loaded into it. Same setting as the main window.
        sandbox: false
      }
    })
    helperWin = win

    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // Never show an empty window: reveal it only once it has painted, without
    // stealing keyboard focus from the app the user is about to type into.
    let ready = false
    let failed = false
    const watchdog = setTimeout(() => {
      if (!ready) fail('did not paint within 8s')
    }, 8000)
    function fail(why: string): void {
      if (failed) return
      failed = true
      clearTimeout(watchdog)
      logHelperFailure(`${title}: ${why} (attempt ${attempt}/${MAX_ATTEMPTS})`)
      const wasCurrent = helperWin === win
      if (!win.isDestroyed()) win.destroy()
      if (wasCurrent && attempt < MAX_ATTEMPTS) open(attempt + 1)
    }
    win.once('ready-to-show', () => {
      ready = true
      clearTimeout(watchdog)
      if (!win.isDestroyed()) win.showInactive()
    })
    win.webContents.on('did-fail-load', (_e, code, desc) => fail(`load ${code} ${desc}`))
    win.webContents.on('render-process-gone', (_e, details) => fail(`renderer ${details.reason}`))
    win.on('closed', () => {
      if (helperWin === win) helperWin = null
    })

    void win.loadURL(url).catch((err: Error) => fail(err.message))
  }

  try {
    open(1)
  } catch (err) {
    logHelperFailure(`${title}: could not be opened: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Failures here are otherwise invisible in a packaged app, so keep a trace in the
// app data folder (credential-helper.log) that can be read when a window is missing.
function logHelperFailure(message: string): void {
  console.error(`Credential helper failed: ${message}`)
  try {
    appendFileSync(
      join(app.getPath('userData'), 'credential-helper.log'),
      `${new Date().toISOString()} ${message}\n`,
      'utf8'
    )
  } catch {
    // logging must never break a connection
  }
}
