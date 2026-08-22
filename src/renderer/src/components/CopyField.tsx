import { useState } from 'react'
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from './icons'

interface CopyFieldProps {
  label: string
  value: string
  secret?: boolean
  monospace?: boolean
}

export function CopyField({ label, value, secret, monospace }: CopyFieldProps): JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const isEmpty = value.trim().length === 0

  async function handleCopy(): Promise<void> {
    if (isEmpty) return
    await window.api.copyToClipboard(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const displayValue = isEmpty
    ? '—'
    : secret && !revealed
      ? '•'.repeat(Math.min(value.length, 20))
      : value

  return (
    <div className="group">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-2 transition-colors dark:border-border-dark dark:bg-panel-dark">
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            isEmpty ? 'text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'
          } ${monospace ? 'font-mono' : ''}`}
          title={!secret && !isEmpty ? value : undefined}
        >
          {displayValue}
        </span>
        {secret && !isEmpty && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700/50 dark:hover:text-slate-200"
            title={revealed ? 'Hide' : 'Show'}
          >
            {revealed ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={isEmpty}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-slate-700/50 dark:hover:text-slate-200"
          title="Copy"
        >
          {copied ? (
            <CheckIcon className="h-4 w-4 text-emerald-500" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}
