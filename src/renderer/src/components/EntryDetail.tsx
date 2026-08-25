import { useEffect, useRef, useState } from 'react'
import type { AppEntry, CredentialEntry, VpnLogEvent, VpnOtpRequest } from '@shared/types'
import { CopyField } from './CopyField'
import { DatabaseIcon, GlobeIcon, PencilIcon, PlugIcon, ServerIcon, TrashIcon } from './icons'

interface EntryDetailProps {
  entry: CredentialEntry
  onEdit: () => void
  onDelete: () => void
}

type ActionStatus = { kind: 'success' | 'error'; message: string } | null

export function EntryDetail({ entry, onEdit, onDelete }: EntryDetailProps): JSX.Element {
  const [launchingApp, setLaunchingApp] = useState(false)
  const [launchingDb, setLaunchingDb] = useState(false)
  const [launchingServer, setLaunchingServer] = useState(false)
  const [appStatus, setAppStatus] = useState<ActionStatus>(null)
  const [dbStatus, setDbStatus] = useState<ActionStatus>(null)
  const [serverStatus, setServerStatus] = useState<ActionStatus>(null)
  const [vpnLog, setVpnLog] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)
  const [vpnConnected, setVpnConnected] = useState(false)
  const [otpRequest, setOtpRequest] = useState<VpnOtpRequest | null>(null)
  const [otpValue, setOtpValue] = useState('')
  const requestIdRef = useRef<string | null>(null)

  useEffect(() => {
    setAppStatus(null)
    setDbStatus(null)
    setServerStatus(null)
    setVpnLog([])
    setShowLog(false)
    setLaunchingApp(false)
    setLaunchingDb(false)
    setLaunchingServer(false)
    setVpnConnected(false)
  }, [entry.id])

  useEffect(() => {
    return window.api.onVpnLog((event: VpnLogEvent) => {
      if (event.requestId !== requestIdRef.current) return
      setVpnLog((prev) => [...prev, event.line])
    })
  }, [])

  useEffect(() => {
    return window.api.onVpnOtpRequired((req: VpnOtpRequest) => {
      if (req.requestId !== requestIdRef.current) return
      setOtpValue('')
      setOtpRequest(req)
    })
  }, [])

  function handleOtpSubmit(): void {
    if (!otpRequest || !otpValue.trim()) return
    window.api.submitVpnOtp(otpRequest.requestId, otpValue.trim())
    setOtpRequest(null)
    setOtpValue('')
  }

  async function openApp(app: AppEntry): Promise<void> {
    if (app.url.trim()) {
      await window.api.openUrl(app.url)
    }
  }

  async function handleConnectVpn(): Promise<void> {
    setAppStatus(null)
    setLaunchingApp(true)

    if (!entry.vpnHost.trim()) {
      setAppStatus({ kind: 'error', message: 'VPN host is not configured for this entry.' })
      setLaunchingApp(false)
      return
    }
    const requestId = crypto.randomUUID()
    requestIdRef.current = requestId
    setVpnLog([])
    setShowLog(true)
    const result = await window.api.connectVpn({
      requestId,
      vpnType: entry.vpnType,
      host: entry.vpnHost,
      port: entry.vpnPort ?? '',
      username: entry.vpnUsername,
      password: entry.vpnPassword
    })
    setLaunchingApp(false)
    if (!result.ok) {
      setAppStatus({ kind: 'error', message: result.message })
      return
    }
    setVpnConnected(true)
    setAppStatus({ kind: 'success', message: 'VPN connected.' })
  }

  async function handleDisconnectVpn(): Promise<void> {
    setAppStatus(null)
    const result = await window.api.disconnectVpn(entry.vpnType)
    setAppStatus({ kind: result.ok ? 'success' : 'error', message: result.message })
    setVpnConnected(false)
  }

  async function handleLaunchDb(): Promise<void> {
    setDbStatus(null)
    if (!entry.dbCommandTemplate.trim()) {
      setDbStatus({ kind: 'error', message: 'No launch command configured for this entry.' })
      return
    }
    setLaunchingDb(true)
    const result = await window.api.launchDb({
      dbClient: entry.dbClient,
      commandTemplate: entry.dbCommandTemplate,
      openInTerminal: entry.dbOpenInTerminal,
      vars: {
        host: entry.dbHost,
        port: entry.dbPort,
        database: entry.dbDatabase,
        instance: entry.dbInstance,
        username: entry.dbUsername,
        password: entry.dbPassword
      }
    })
    setDbStatus({ kind: result.ok ? 'success' : 'error', message: result.message })
    setLaunchingDb(false)
  }

  async function handleConnectServer(): Promise<void> {
    setServerStatus(null)

    if (entry.vpnType !== 'none' && !vpnConnected) {
      setServerStatus({ kind: 'error', message: 'Connect VPN first before connecting to the server.' })
      return
    }

    const serverType = entry.serverType ?? 'none'
    if (serverType === 'none') return

    setLaunchingServer(true)
    const result = await window.api.launchServer({
      serverType,
      host: entry.serverHost,
      port: entry.serverPort,
      username: entry.serverUsername,
      password: entry.serverPassword,
      sftpServer: entry.serverSftpServer
    })
    setServerStatus({ kind: result.ok ? 'success' : 'error', message: result.message })
    setLaunchingServer(false)
  }

  const hasVpn = entry.vpnType !== 'none'
  const connectButtonLabel = vpnConnected
    ? 'VPN Connected'
    : launchingApp
      ? 'Connecting VPN…'
      : 'Connect VPN'

  return (
    <>
      {otpRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-popover dark:border-border-dark dark:bg-surface-dark">
            <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">One-Time Password Required</h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{otpRequest.prompt}</p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleOtpSubmit()}
              placeholder="Enter OTP from your email"
              className="mb-4 w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setOtpRequest(null); window.api.submitVpnOtp(otpRequest.requestId, '') }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-panel dark:border-border-dark dark:text-slate-300 dark:hover:bg-panel-dark"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOtpSubmit}
                disabled={!otpValue.trim()}
                className="rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
              >
                Submit OTP
              </button>
            </div>
          </div>
        </div>
      )}


      <div key={entry.id} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl animate-slide-in-right px-8 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-semibold text-white shadow-lg shadow-brand-600/20">
              {entry.appName.trim().charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {entry.appName || 'Untitled'}
              </h2>
              {entry.apps.length > 0 && entry.apps[0].url && (
                <p className="text-sm text-slate-400 dark:text-slate-500">{entry.apps[0].url}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-border-dark dark:text-slate-300 dark:hover:text-brand-400"
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600 dark:border-border-dark dark:text-slate-300 dark:hover:text-red-400"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark dark:shadow-card-dark">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              Quick Actions
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {hasVpn && (
                <button
                  type="button"
                  onClick={handleConnectVpn}
                  disabled={launchingApp || vpnConnected}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-60"
                >
                  <PlugIcon className="h-4 w-4" />
                  {connectButtonLabel}
                </button>
              )}

              {hasVpn && (
                <button
                  type="button"
                  onClick={handleDisconnectVpn}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600 dark:border-border-dark dark:text-slate-300 dark:hover:text-red-400"
                >
                  <PlugIcon className="h-4 w-4" />
                  {entry.vpnType === 'sangfor' ? 'How to Disconnect' : 'Disconnect VPN'}
                </button>
              )}

              <button
                type="button"
                onClick={handleLaunchDb}
                disabled={launchingDb}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-border-dark dark:text-slate-300 dark:hover:text-brand-400 disabled:pointer-events-none disabled:opacity-60"
              >
                <DatabaseIcon className="h-4 w-4" />
                {launchingDb ? 'Launching…' : 'Connect Database'}
              </button>

              {(entry.serverType ?? 'none') !== 'none' && (
                <button
                  type="button"
                  onClick={handleConnectServer}
                  disabled={launchingServer}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-border-dark dark:text-slate-300 dark:hover:text-brand-400 disabled:pointer-events-none disabled:opacity-60"
                >
                  <ServerIcon className="h-4 w-4" />
                  {launchingServer ? 'Connecting…' : entry.serverType === 'winscp' ? 'Connect WinSCP' : 'Connect RDP'}
                </button>
              )}
            </div>

            {appStatus && (
              <p className={`mt-3 text-sm ${appStatus.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {appStatus.message}
              </p>
            )}
            {dbStatus && (
              <p className={`mt-3 text-sm ${dbStatus.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {dbStatus.message}
              </p>
            )}
            {serverStatus && (
              <p className={`mt-3 text-sm ${serverStatus.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {serverStatus.message}
              </p>
            )}

            {vpnLog.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowLog((s) => !s)}
                  className="text-xs font-medium text-slate-400 underline-offset-2 hover:underline dark:text-slate-500"
                >
                  {showLog ? 'Hide VPN log' : 'Show VPN log'}
                </button>
                {showLog && (
                  <pre className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300 dark:bg-black/40">
                    {vpnLog.join('\n')}
                  </pre>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark dark:shadow-card-dark">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              VPN
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CopyField label="VPN Host" value={entry.vpnHost} monospace />
              <CopyField label="VPN Username" value={entry.vpnUsername} monospace />
              <CopyField label="VPN Password" value={entry.vpnPassword} secret monospace />
            </div>
          </section>

          {entry.apps.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark dark:shadow-card-dark">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Applications
              </h3>
              <div className="space-y-4">
                {entry.apps.map((app, idx) => (
                  <div key={app.id} className="rounded-xl border border-border bg-panel/50 p-4 dark:border-border-dark dark:bg-panel-dark/50">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {app.name || `App ${idx + 1}`}
                      </span>
                      {app.url.trim() && (
                        <button
                          type="button"
                          onClick={() => openApp(app)}
                          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-border-dark dark:text-slate-300 dark:hover:text-brand-400"
                        >
                          <GlobeIcon className="h-3.5 w-3.5" />
                          Launch
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <CopyField label="URL" value={app.url} monospace />
                      </div>
                      <CopyField label="Username" value={app.username} monospace />
                      <CopyField label="Password" value={app.password} secret monospace />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(entry.serverType ?? 'none') !== 'none' && (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark dark:shadow-card-dark">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Server — {entry.serverType === 'winscp' ? 'Linux / SFTP (WinSCP)' : 'Windows (Remote Desktop)'}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CopyField label="Host" value={entry.serverHost} monospace />
                <CopyField label="Port" value={entry.serverPort} monospace />
                <CopyField label="Username" value={entry.serverUsername} monospace />
                <CopyField label="Password" value={entry.serverPassword} secret monospace />
                {entry.serverType === 'winscp' && entry.serverSftpServer && (
                  <div className="sm:col-span-2">
                    <CopyField label="SFTP Server" value={entry.serverSftpServer} monospace />
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark dark:shadow-card-dark">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              Database
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CopyField label="DB Host" value={entry.dbHost} monospace />
              <CopyField label="DB Port" value={entry.dbPort} monospace />
              <CopyField label="Database" value={entry.dbDatabase} monospace />
              <CopyField label="Instance" value={entry.dbInstance} monospace />
              <CopyField label="DB Username" value={entry.dbUsername} monospace />
              <CopyField label="DB Password" value={entry.dbPassword} secret monospace />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark dark:shadow-card-dark">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              Notes
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {entry.notes || <span className="text-slate-400 dark:text-slate-600">No notes</span>}
            </p>
          </section>
        </div>
      </div>
      </div>
    </>
  )
}
