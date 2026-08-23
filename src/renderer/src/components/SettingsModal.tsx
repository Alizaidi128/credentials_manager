import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    await window.api.saveSettings(settings)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[90vh] w-full max-w-md animate-scale-in flex-col rounded-2xl border border-border bg-surface shadow-popover dark:border-border-dark dark:bg-surface-dark">
        <div className="shrink-0 border-b border-border px-6 pt-6 pb-4 dark:border-border-dark">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {settings ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Cisco AnyConnect CLI Path
                </label>
                <input
                  value={settings.vpnCliPath}
                  onChange={(e) => setSettings({ ...settings, vpnCliPath: e.target.value })}
                  placeholder="C:\Program Files (x86)\Cisco\Cisco AnyConnect Secure Mobility Client\vpncli.exe"
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Path to vpncli.exe. Used to automate VPN connect/disconnect.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Sangfor EasyConnect Path
                </label>
                <input
                  value={settings.sangforClientPath}
                  onChange={(e) => setSettings({ ...settings, sangforClientPath: e.target.value })}
                  placeholder="C:\Program Files (x86)\Sangfor\SSL\EasyConnect.exe"
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Path to EasyConnect.exe. Keystrokes are used to fill in the login form automatically.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  EasyConnect Login Settle Time (ms)
                </label>
                <input
                  type="number"
                  min={2000}
                  max={30000}
                  step={1000}
                  value={settings.sangforSettleMs}
                  onChange={(e) => setSettings({ ...settings, sangforSettleMs: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Wait time after window ready before sending keystrokes. Increase if form loads slowly. Default: 10000 ms.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Fortinet FortiClient Path
                </label>
                <input
                  value={settings.fortiClientPath}
                  onChange={(e) => setSettings({ ...settings, fortiClientPath: e.target.value })}
                  placeholder="C:\Program Files\Fortinet\FortiClient\FortiClient.exe"
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Path to FortiClient.exe (requires v7.4.7+). Tunnel name in each entry must match exactly.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Check Point Endpoint Security Path
                </label>
                <input
                  value={settings.checkpointPath}
                  onChange={(e) => setSettings({ ...settings, checkpointPath: e.target.value })}
                  placeholder="C:\Program Files (x86)\CheckPoint\Endpoint Connect\trac.exe"
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Path to trac.exe. Site name must match what appears in the Check Point GUI. Supports 2FA.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
          )}

          {/* Idle auto-lock */}
          {settings && (
            <div className="mt-6 border-t border-border pt-5 dark:border-border-dark">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Security
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Auto-lock after idle
                </label>
                <select
                  value={settings.idleTimeoutMinutes}
                  onChange={(e) => setSettings({ ...settings, idleTimeoutMinutes: Number(e.target.value) })}
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                >
                  <option value={0}>Unlimited (never lock)</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  The vault locks automatically after this period of inactivity.
                </p>
              </div>
            </div>
          )}

          {/* Password Reset — OTP email */}
          {settings && (
            <div className="mt-6 border-t border-border pt-5 dark:border-border-dark">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                Password Reset
              </p>
              <p className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">
                If you forget your master password, a one-time code will be sent here to verify your identity.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Your Email Address</label>
                  <input
                    type="email"
                    value={settings.userEmail}
                    onChange={(e) => setSettings({ ...settings, userEmail: e.target.value })}
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                  />
                </div>

                {/* SMTP — collapsible-style sub-section */}
                <div className="rounded-lg border border-border p-3 dark:border-border-dark">
                  <p className="mb-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">SMTP Configuration</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="mb-1 block text-[11px] text-slate-400 dark:text-slate-500">Host</label>
                        <input
                          value={settings.smtpHost}
                          onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                          placeholder="smtp.office365.com"
                          className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-400 dark:text-slate-500">Port</label>
                        <input
                          type="number"
                          value={settings.smtpPort}
                          onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })}
                          className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400 dark:text-slate-500">Username</label>
                      <input
                        value={settings.smtpUser}
                        onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                        placeholder="noreply@company.com"
                        autoComplete="off"
                        className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400 dark:text-slate-500">Password</label>
                      <input
                        type="password"
                        value={settings.smtpPass}
                        onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value })}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400 dark:text-slate-500">From Address</label>
                      <input
                        value={settings.smtpFrom}
                        onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
                        placeholder="Vaultier <noreply@company.com>"
                        className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border px-6 py-4 dark:border-border-dark">
          {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-panel dark:border-border-dark dark:text-slate-300 dark:hover:bg-panel-dark"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!settings}
            className="rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
