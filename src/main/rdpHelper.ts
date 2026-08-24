import { BrowserWindow, clipboard } from 'electron'

let helperWin: BrowserWindow | null = null

export function showRdpHelper(host: string, username: string, password: string): void {
  clipboard.writeText(password)

  if (helperWin && !helperWin.isDestroyed()) {
    helperWin.close()
  }

  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const pwJson = JSON.stringify(password)
  const userJson = JSON.stringify(username)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
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
    flex: 1; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
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
    <div class="title">RDP Credentials</div>
    <div class="host">${esc(host)}</div>
  </div>
  <button class="close-btn" onclick="window.close()">&#x2715;</button>
</div>
<div class="body">
  <div>
    <div class="field-label">Username</div>
    <div class="field-row">
      <div class="field-val" id="uval">${esc(username)}</div>
      <button class="icon-btn" title="Copy username" onclick="copyField('user')">&#x2398;</button>
    </div>
  </div>
  <div>
    <div class="field-label">Password</div>
    <div class="field-row">
      <div class="field-val" id="pval">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</div>
      <button class="icon-btn" title="Show/hide" onclick="togglePw()" id="eyeBtn">&#128065;</button>
      <button class="icon-btn" title="Copy password" onclick="copyField('pw')">&#x2398;</button>
    </div>
  </div>
  <button class="copy-btn" id="mainBtn" onclick="copyPw()">&#x2398;&nbsp; Copy Password</button>
  <div class="hint" id="hint">Password auto-copied to clipboard</div>
</div>
<script>
  const pw = ${pwJson};
  const user = ${userJson};
  let pwVisible = false;

  function togglePw() {
    pwVisible = !pwVisible;
    document.getElementById('pval').textContent = pwVisible ? pw : '••••••••';
    document.getElementById('eyeBtn').innerHTML = pwVisible ? '&#128064;' : '&#128065;';
  }

  function copyField(which) {
    navigator.clipboard.writeText(which === 'pw' ? pw : user);
  }

  function copyPw() {
    navigator.clipboard.writeText(pw).then(() => {
      const btn = document.getElementById('mainBtn');
      const hint = document.getElementById('hint');
      btn.textContent = '✓  Copied!';
      btn.classList.add('ok');
      hint.textContent = 'Paste into the Windows Security dialog';
      setTimeout(() => {
        btn.innerHTML = '&#x2398;&nbsp; Copy Password';
        btn.classList.remove('ok');
        hint.textContent = 'Password auto-copied to clipboard';
      }, 2000);
    });
  }
</script>
</body>
</html>`

  helperWin = new BrowserWindow({
    width: 300,
    height: 230,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    skipTaskbar: false,
    title: 'RDP Credentials',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  helperWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  helperWin.on('closed', () => { helperWin = null })
}
