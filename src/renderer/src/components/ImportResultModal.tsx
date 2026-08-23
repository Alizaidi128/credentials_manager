import type { CredentialEntry } from '@shared/types'
import { CheckIcon, XIcon } from './icons'

interface Props {
  toImport: CredentialEntry[]
  toSkip: CredentialEntry[]
  exportedBy?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ImportResultModal({ toImport, toSkip, exportedBy, onCancel, onConfirm }: Props): JSX.Element {
  const hasNew = toImport.length > 0
  const hasSkipped = toSkip.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-[460px] flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 dark:border-border-dark">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Import Preview</h2>
            {exportedBy && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                From <span className="font-medium text-brand-500">{exportedBy}</span>
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Nothing to import */}
          {!hasNew && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-800/40 dark:bg-amber-900/20">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                All entries already exist
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-500">
                Every entry in this file is already in your vault. Nothing to import.
              </p>
            </div>
          )}

          {/* Entries to import */}
          {hasNew && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckIcon className="h-3 w-3 stroke-[2.5] text-green-600 dark:text-green-400" />
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">
                  {toImport.length} {toImport.length === 1 ? 'entry' : 'entries'} will be imported
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-green-200 dark:border-green-800/40">
                {toImport.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${i < toImport.length - 1 ? 'border-b border-green-100 dark:border-green-900/30' : ''} bg-green-50 dark:bg-green-900/10`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-100 text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                      {entry.appName.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                      {entry.appName || 'Untitled'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Already-existing entries (skipped) */}
          {hasSkipped && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <span className="text-[11px] font-bold leading-none text-amber-600 dark:text-amber-400">!</span>
                </span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white">
                  {toSkip.length} {toSkip.length === 1 ? 'entry' : 'entries'} already exist — will be skipped
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-amber-200 dark:border-amber-800/40">
                {toSkip.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${i < toSkip.length - 1 ? 'border-b border-amber-100 dark:border-amber-900/30' : ''} bg-amber-50 dark:bg-amber-900/10`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      {entry.appName.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                      {entry.appName || 'Untitled'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4 dark:border-border-dark">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-border-dark dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          {hasNew && (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              Import {toImport.length} {toImport.length === 1 ? 'Entry' : 'Entries'}
            </button>
          )}
          {!hasNew && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg bg-slate-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
