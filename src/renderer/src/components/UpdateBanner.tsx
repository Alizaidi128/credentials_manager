import { useState } from 'react'
import { XIcon } from './icons'

interface Props {
  version: string
  downloading?: boolean
  onInstallNow: () => void
  onDismiss: () => void
  onRemindIn: (ms: number) => void
}

const REMIND_OPTIONS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '8 hours', ms: 8 * 60 * 60 * 1000 },
  { label: 'Tomorrow', ms: 24 * 60 * 60 * 1000 }
]

export function UpdateBanner({ version, downloading, onInstallNow, onDismiss, onRemindIn }: Props): JSX.Element {
  const [showRemind, setShowRemind] = useState(false)

  return (
    <div className="relative z-40 border-b border-brand-600/30 bg-gradient-to-r from-brand-600/10 via-brand-500/10 to-indigo-500/10 dark:border-brand-500/20 dark:from-brand-900/30 dark:via-brand-800/20 dark:to-indigo-900/20">
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Pulse dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
        </span>

        {/* Message */}
        <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">
          <span className="font-semibold text-brand-600 dark:text-brand-400">
            Vaultier {version}
          </span>{' '}
          {downloading ? 'is downloading…' : 'is ready to install'}
        </p>

        {/* Actions */}
        <div className="relative flex items-center gap-1.5">
          {!downloading && (
            <>
              {/* Remind me dropdown */}
              {showRemind && (
                <div className="absolute bottom-full right-0 mb-2 w-44 overflow-hidden rounded-xl border border-border bg-white shadow-xl dark:border-border-dark dark:bg-slate-800">
                  <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:border-border-dark dark:text-slate-500">
                    Remind me in…
                  </p>
                  {REMIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.ms}
                      type="button"
                      onClick={() => { setShowRemind(false); onRemindIn(opt.ms) }}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                Later
              </button>

              <button
                type="button"
                onClick={() => setShowRemind((v) => !v)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                Remind me…
              </button>

              <button
                type="button"
                onClick={onInstallNow}
                className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-600"
              >
                Install Now
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className="ml-1 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            title="Dismiss"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
