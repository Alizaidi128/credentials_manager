import type { CredentialEntry } from '@shared/types'
import { GlobeIcon, LockIcon, PlusIcon, SearchIcon, SettingsIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

interface SidebarProps {
  entries: CredentialEntry[]
  filteredEntries: CredentialEntry[]
  selectedId: string | null
  query: string
  onQueryChange: (q: string) => void
  onSelect: (id: string) => void
  onAdd: () => void
  onLock: () => void
  onSettings: () => void
}

export function Sidebar({
  entries,
  filteredEntries,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onAdd,
  onLock,
  onSettings
}: SidebarProps): JSX.Element {
  return (
    <aside className="drag-region flex h-full w-72 shrink-0 flex-col border-r border-border bg-panel/70 dark:border-border-dark dark:bg-panel-dark/70">
      <div className="no-drag flex items-center justify-between px-4 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <LockIcon className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-white">Vaultier</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="no-drag px-4 pb-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search apps…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-sm text-slate-800 outline-none ring-brand-500/40 transition placeholder:text-slate-500 focus:ring-2 dark:border-border-dark dark:bg-surface-dark dark:text-white dark:placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="no-drag flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {entries.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-600">
            No entries yet.
          </p>
        )}
        {entries.length > 0 && filteredEntries.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-600">
            No matches for “{query}”.
          </p>
        )}
        {filteredEntries.map((entry) => {
          const active = entry.id === selectedId
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.id)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                active
                  ? 'bg-white shadow-card dark:bg-slate-800 dark:shadow-card-dark'
                  : 'hover:bg-white/70 dark:hover:bg-slate-800/50'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                  active
                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {entry.appName.trim().charAt(0).toUpperCase() || <GlobeIcon className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    active ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {entry.appName || 'Untitled'}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {entry.appUrl || entry.vpnHost || 'No URL set'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="no-drag border-t border-border px-4 py-1.5 text-center dark:border-border-dark">
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          Powered by{' '}
          <span className="font-semibold text-brand-500 dark:text-brand-400">Ali Zaidi</span>
        </p>
      </div>

      <div className="no-drag flex items-center gap-2 border-t border-border p-3 dark:border-border-dark">
        <button
          type="button"
          onClick={onAdd}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-3 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700"
        >
          <PlusIcon className="h-4 w-4" />
          Add Entry
        </button>
        <button
          type="button"
          onClick={onSettings}
          title="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-slate-500 transition hover:text-brand-600 dark:border-border-dark dark:text-slate-400 dark:hover:text-brand-400"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onLock}
          title="Lock vault"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-slate-500 transition hover:text-brand-600 dark:border-border-dark dark:text-slate-400 dark:hover:text-brand-400"
        >
          <LockIcon className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
