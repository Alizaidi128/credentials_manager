import { FormEvent, ReactNode, useEffect, useState } from 'react'
import type { AppEntry, CredentialEntry, DbClientType, ServerType, VpnType } from '@shared/types'
import { EyeIcon, EyeOffIcon } from './icons'

interface EntryModalProps {
  initial: CredentialEntry | null
  onCancel: () => void
  onSave: (values: Omit<CredentialEntry, 'id' | 'createdAt' | 'updatedAt'>) => void
}

type FormState = Omit<CredentialEntry, 'id' | 'createdAt' | 'updatedAt'>

function newApp(): AppEntry {
  return { id: crypto.randomUUID(), name: '', url: '', username: '', password: '' }
}

const emptyForm: FormState = {
  appName: '',

  vpnType: 'none',
  vpnHost: '',
  vpnUsername: '',
  vpnPassword: '',
  vpnPreSharedKey: '',

  apps: [newApp()],

  serverType: 'none',
  serverHost: '',
  serverPort: '',
  serverUsername: '',
  serverPassword: '',
  serverSftpServer: '',

  dbClient: 'custom',
  dbHost: '',
  dbPort: '',
  dbDatabase: '',
  dbInstance: '',
  dbUsername: '',
  dbPassword: '',
  dbCommandTemplate: '',
  dbOpenInTerminal: false,

  notes: ''
}

const VPN_TYPE_LABELS: Record<VpnType, string> = {
  none: 'No VPN required',
  'cisco-anyconnect': 'Cisco AnyConnect',
  sangfor: 'Sangfor (EasyConnect)',
  'forti-client': 'Fortinet FortiClient',
  checkpoint: 'Check Point Endpoint Security'
}

const VPN_HOST_PLACEHOLDERS: Record<VpnType, string> = {
  none: '',
  'cisco-anyconnect': 'vpn.example.com',
  sangfor: 'https://vpn.example.com:4430',
  'forti-client': 'e.g. AMANA TAKAFUL_SLT  (exact tunnel name)',
  checkpoint: 'e.g. Solarelle Checkpoint VPN  (exact site name)'
}

const SERVER_TYPE_LABELS: Record<ServerType, string> = {
  none: 'No server connection',
  winscp: 'Linux / SFTP (WinSCP)',
  rdp: 'Windows (Remote Desktop)'
}

const SERVER_DEFAULT_PORT: Record<ServerType, string> = {
  none: '',
  winscp: '22',
  rdp: '3389'
}

const DB_CLIENT_LABELS: Record<DbClientType, string> = {
  toad: 'Toad',
  dbeaver: 'DBeaver',
  ssms: 'SQL Server Management Studio',
  sqlcmd: 'sqlcmd',
  sqlplus: 'SQL*Plus',
  'mysql-cli': 'MySQL CLI',
  psql: 'psql (PostgreSQL)',
  custom: 'Custom command'
}

const DB_DEFAULT_TEMPLATES: Record<DbClientType, string> = {
  toad: '"C:\\Program Files\\Quest Software\\Toad for Oracle 13.3\\Toad.exe"',
  dbeaver:
    'dbeaver -con "driver=oracle|host={host}|port={port}|database={database}|user={username}|password={password}|savePassword=true|connect=true"',
  ssms: 'ssms -S {host}\\{instance} -d {database} -U {username} -P {password}',
  sqlcmd: 'sqlcmd -S {host},{port} -d {database} -U {username} -P {password}',
  sqlplus: 'sqlplus {username}/{password}@{host}:{port}/{database}',
  'mysql-cli': 'mysql -h {host} -P {port} -u {username} -p{password} {database}',
  psql: 'psql -h {host} -p {port} -U {username} {database}',
  custom: ''
}

const DB_DEFAULT_TERMINAL: Record<DbClientType, boolean> = {
  toad: false,
  dbeaver: false,
  ssms: false,
  sqlcmd: true,
  sqlplus: true,
  'mysql-cli': true,
  psql: true,
  custom: false
}

function inputClass(extra = ''): string {
  return `w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white ${extra}`
}

function labelClass(): string {
  return 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400'
}

interface SecretInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  fieldKey: string
  revealed: Record<string, boolean>
  onToggleReveal: (key: string) => void
  className?: string
}

function SecretInput({
  value,
  onChange,
  placeholder,
  fieldKey,
  revealed,
  onToggleReveal
}: SecretInputProps): JSX.Element {
  const isRevealed = !!revealed[fieldKey]
  return (
    <div className="relative">
      <input
        type={isRevealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass('pr-9')}
      />
      <button
        type="button"
        onClick={() => onToggleReveal(fieldKey)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        tabIndex={-1}
      >
        {isRevealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <fieldset className="rounded-xl border border-border p-4 dark:border-border-dark">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export function EntryModal({ initial, onCancel, onSave }: EntryModalProps): JSX.Element {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (initial) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = initial
      setForm({ ...emptyForm, ...rest })
    } else {
      setForm(emptyForm)
    }
  }, [initial])

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleDbClientChange(next: DbClientType): void {
    setForm((prev) => ({
      ...prev,
      dbClient: next,
      dbCommandTemplate: prev.dbCommandTemplate.trim() ? prev.dbCommandTemplate : DB_DEFAULT_TEMPLATES[next],
      dbOpenInTerminal: prev.dbCommandTemplate.trim() ? prev.dbOpenInTerminal : DB_DEFAULT_TERMINAL[next]
    }))
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    if (!form.appName.trim()) return
    onSave(form)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl animate-scale-in overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-popover dark:border-border-dark dark:bg-surface-dark">
        <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-white">
          {initial ? 'Edit Entry' : 'Add Entry'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass()}>
              App Name<span className="text-red-500"> *</span>
            </label>
            <input
              value={form.appName}
              onChange={(e) => update('appName', e.target.value)}
              placeholder="e.g. Acme Dashboard"
              className={inputClass()}
            />
          </div>

          <Section title="VPN">
            <div>
              <label className={labelClass()}>VPN Type</label>
              <select
                value={form.vpnType}
                onChange={(e) => update('vpnType', e.target.value as VpnType)}
                className={inputClass()}
              >
                {(Object.keys(VPN_TYPE_LABELS) as VpnType[]).map((type) => (
                  <option key={type} value={type}>
                    {VPN_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            {form.vpnType !== 'none' && (
              <>
                <div>
                  <label className={labelClass()}>
                    {form.vpnType === 'sangfor'
                      ? 'VPN URL'
                      : form.vpnType === 'forti-client'
                        ? 'Tunnel Name'
                        : form.vpnType === 'checkpoint'
                          ? 'Site Name'
                          : 'VPN Host'}
                  </label>
                  <input
                    value={form.vpnHost}
                    onChange={(e) => update('vpnHost', e.target.value)}
                    placeholder={VPN_HOST_PLACEHOLDERS[form.vpnType]}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>VPN Username</label>
                  <input
                    value={form.vpnUsername}
                    onChange={(e) => update('vpnUsername', e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>VPN Password</label>
                  <SecretInput
                    fieldKey="vpnPassword"
                    value={form.vpnPassword}
                    onChange={(v) => update('vpnPassword', v)}
                    revealed={revealed}
                    onToggleReveal={(k) => setRevealed((p) => ({ ...p, [k]: !p[k] }))}
                  />
                </div>
                {form.vpnType === 'forti-client' && (
                  <div className="sm:col-span-2">
                    <label className={labelClass()}>Pre-Shared Key (IPSec)</label>
                    <SecretInput
                      fieldKey="vpnPreSharedKey"
                      value={form.vpnPreSharedKey}
                      onChange={(v) => update('vpnPreSharedKey', v)}
                      placeholder="Leave blank for SSL VPN tunnels"
                      revealed={revealed}
                      onToggleReveal={(k) => setRevealed((p) => ({ ...p, [k]: !p[k] }))}
                    />
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      Required for IPSec tunnels. Configure this key once in FortiClient → Remote Access → Edit tunnel → Authentication. Leave blank for SSL VPN.
                    </p>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="Applications">
            {form.apps.map((app, idx) => {
              function updateApp(field: keyof AppEntry, val: string): void {
                const next = form.apps.map((a, i) => i === idx ? { ...a, [field]: val } : a)
                update('apps', next)
              }
              return (
                <div key={app.id} className="sm:col-span-2 rounded-xl border border-border bg-panel/50 p-4 dark:border-border-dark dark:bg-panel-dark/50">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                      App {idx + 1}
                    </span>
                    {form.apps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => update('apps', form.apps.filter((_, i) => i !== idx))}
                        className="text-xs text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass()}>App Name</label>
                      <input value={app.name} onChange={(e) => updateApp('name', e.target.value)} placeholder="e.g. Production" className={inputClass()} />
                    </div>
                    <div>
                      <label className={labelClass()}>App URL</label>
                      <input value={app.url} onChange={(e) => updateApp('url', e.target.value)} placeholder="https://app.example.com" className={inputClass('font-mono')} />
                    </div>
                    <div>
                      <label className={labelClass()}>App Username</label>
                      <input value={app.username} onChange={(e) => updateApp('username', e.target.value)} className={inputClass()} />
                    </div>
                    <div>
                      <label className={labelClass()}>App Password</label>
                      <SecretInput
                        fieldKey={`appPassword-${app.id}`}
                        value={app.password}
                        onChange={(v) => updateApp('password', v)}
                        revealed={revealed}
                        onToggleReveal={(k) => setRevealed((p) => ({ ...p, [k]: !p[k] }))}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => update('apps', [...form.apps, newApp()])}
                className="w-full rounded-lg border border-dashed border-border py-2 text-sm text-slate-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-border-dark dark:text-slate-400 dark:hover:text-brand-400"
              >
                + Add another app
              </button>
            </div>
          </Section>

          <Section title="Server">
            <div>
              <label className={labelClass()}>Server Type</label>
              <select
                value={form.serverType}
                onChange={(e) => {
                  const t = e.target.value as ServerType
                  setForm((prev) => ({
                    ...prev,
                    serverType: t,
                    serverPort: prev.serverPort || SERVER_DEFAULT_PORT[t]
                  }))
                }}
                className={inputClass()}
              >
                {(Object.keys(SERVER_TYPE_LABELS) as ServerType[]).map((type) => (
                  <option key={type} value={type}>
                    {SERVER_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            {form.serverType !== 'none' && (
              <>
                <div>
                  <label className={labelClass()}>Host</label>
                  <input
                    value={form.serverHost}
                    onChange={(e) => update('serverHost', e.target.value)}
                    placeholder="192.168.1.100"
                    className={inputClass('font-mono')}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Port</label>
                  <input
                    value={form.serverPort}
                    onChange={(e) => update('serverPort', e.target.value)}
                    placeholder={SERVER_DEFAULT_PORT[form.serverType]}
                    className={inputClass('font-mono')}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Username</label>
                  <input
                    value={form.serverUsername}
                    onChange={(e) => update('serverUsername', e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass()}>Password</label>
                  <SecretInput
                    fieldKey="serverPassword"
                    value={form.serverPassword}
                    onChange={(v) => update('serverPassword', v)}
                    revealed={revealed}
                    onToggleReveal={(k) => setRevealed((p) => ({ ...p, [k]: !p[k] }))}
                  />
                </div>
                {form.serverType === 'winscp' && (
                  <div className="sm:col-span-2">
                    <label className={labelClass()}>SFTP Server (optional)</label>
                    <input
                      value={form.serverSftpServer}
                      onChange={(e) => update('serverSftpServer', e.target.value)}
                      placeholder="sudo /usr/libexec/openssh/sftp-server"
                      className={inputClass('font-mono')}
                    />
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      Override WinSCP's SFTP server path. Leave blank for default.
                    </p>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="Database">
            <div>
              <label className={labelClass()}>DB Client</label>
              <select
                value={form.dbClient}
                onChange={(e) => handleDbClientChange(e.target.value as DbClientType)}
                className={inputClass()}
              >
                {(Object.keys(DB_CLIENT_LABELS) as DbClientType[]).map((client) => (
                  <option key={client} value={client}>
                    {DB_CLIENT_LABELS[client]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.dbOpenInTerminal}
                  onChange={(e) => update('dbOpenInTerminal', e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-brand-600 dark:border-border-dark"
                />
                Open in terminal window
              </label>
            </div>
            <div>
              <label className={labelClass()}>DB Host</label>
              <input
                value={form.dbHost}
                onChange={(e) => update('dbHost', e.target.value)}
                className={inputClass('font-mono')}
              />
            </div>
            <div>
              <label className={labelClass()}>DB Port</label>
              <input
                value={form.dbPort}
                onChange={(e) => update('dbPort', e.target.value)}
                placeholder="1521"
                className={inputClass('font-mono')}
              />
            </div>
            <div>
              <label className={labelClass()}>Database</label>
              <input
                value={form.dbDatabase}
                onChange={(e) => update('dbDatabase', e.target.value)}
                className={inputClass('font-mono')}
              />
            </div>
            <div>
              <label className={labelClass()}>Instance</label>
              <input
                value={form.dbInstance}
                onChange={(e) => update('dbInstance', e.target.value)}
                placeholder="e.g. SQLEXPRESS or Oracle SID"
                className={inputClass('font-mono')}
              />
            </div>
            <div>
              <label className={labelClass()}>DB Username</label>
              <input
                value={form.dbUsername}
                onChange={(e) => update('dbUsername', e.target.value)}
                className={inputClass()}
              />
            </div>
            <div>
              <label className={labelClass()}>DB Password</label>
              <SecretInput
                fieldKey="dbPassword"
                value={form.dbPassword}
                onChange={(v) => update('dbPassword', v)}
                revealed={revealed}
                onToggleReveal={(k) => setRevealed((p) => ({ ...p, [k]: !p[k] }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass()}>
                {form.dbClient === 'toad' ? 'Toad Executable Path' : 'Launch Command'}
              </label>
              <textarea
                value={form.dbCommandTemplate}
                onChange={(e) => update('dbCommandTemplate', e.target.value)}
                rows={2}
                placeholder={
                  form.dbClient === 'toad'
                    ? '"C:\\Program Files\\Quest Software\\Toad for Oracle 13.3\\Toad.exe"'
                    : 'e.g. sqlplus {username}/{password}@{host}:{port}/{database}'
                }
                className={`${inputClass('font-mono')} resize-none`}
              />
              {form.dbClient !== 'toad' && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Uses {'{host} {port} {database} {instance} {username} {password}'} placeholders. Edit
                  to match the exact CLI syntax of your installed client/version.
                </p>
              )}
            </div>
          </Section>

          <div>
            <label className={labelClass()}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              className={`${inputClass()} resize-none`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-panel dark:border-border-dark dark:text-slate-300 dark:hover:bg-panel-dark"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.appName.trim()}
              className="rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {initial ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
