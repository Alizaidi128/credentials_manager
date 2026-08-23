import { useState } from 'react'
import type { CredentialEntry } from '@shared/types'
import { CheckIcon, DownloadIcon, MailIcon, XIcon } from './icons'

interface Props {
  entries: CredentialEntry[]
  exportedBy?: string
  onClose: () => void
}

type Step = 'select' | 'email' | 'sending' | 'done'

export function ExportModal({ entries, exportedBy, onClose }: Props): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set(entries.map((e) => e.id)))
  const [step, setStep] = useState<Step>('select')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allChecked = selected.size === entries.length
  const noneChecked = selected.size === 0
  const selectedEntries = entries.filter((e) => selected.has(e.id))

  function toggleAll(): void {
    setSelected(allChecked ? new Set() : new Set(entries.map((e) => e.id)))
  }

  function toggleOne(id: string): void {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  async function handleDownload(): Promise<void> {
    if (noneChecked) return
    setDownloading(true)
    setError(null)
    try {
      const result = await window.api.exportDownload(selectedEntries, exportedBy)
      if (!result.ok && result.error) setError(result.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleSendEmail(): Promise<void> {
    if (!recipientEmail.trim() || noneChecked) return
    setStep('sending')
    setError(null)
    try {
      const result = await window.api.exportShare(selectedEntries, recipientEmail.trim(), exportedBy)
      if (result.ok) {
        setStep('done')
      } else {
        setError(result.error ?? 'Failed to send email.')
        setStep('email')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send email.')
      setStep('email')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex max-h-[82vh] w-[480px] flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 dark:border-border-dark">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Export Credentials</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose entries and how to share them</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {step === 'done' ? (
          /* Success state */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30">
              <MailIcon className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-white">Email sent successfully!</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedEntries.length} credential{selectedEntries.length === 1 ? '' : 's'} shared with{' '}
                <span className="font-medium text-brand-500">{recipientEmail}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-brand-500 px-8 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Entry checklist */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {/* Select all row */}
              <button
                type="button"
                onClick={toggleAll}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition ${allChecked ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-slate-600'}`}>
                  {allChecked && <CheckIcon className="h-2.5 w-2.5 stroke-[3] text-white" />}
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {allChecked ? 'Deselect all' : 'Select all'}
                </span>
                <span className="ml-auto text-xs text-slate-400">
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </button>

              <div className="my-1 border-t border-border dark:border-border-dark" />

              <div className="mt-1 space-y-0.5">
                {entries.map((entry) => {
                  const checked = selected.has(entry.id)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => toggleOne(entry.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition ${checked ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-slate-600'}`}>
                        {checked && <CheckIcon className="h-2.5 w-2.5 stroke-[3] text-white" />}
                      </span>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${checked ? 'bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {entry.appName.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <span className={`truncate text-sm ${checked ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                        {entry.appName || 'Untitled'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Email input section */}
            {(step === 'email' || step === 'sending') && (
              <div className="border-t border-border px-6 py-4 dark:border-border-dark">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Recipient email address
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSendEmail() }}
                  placeholder="colleague@company.com"
                  disabled={step === 'sending'}
                  autoFocus
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-brand-500/40 transition focus:ring-2 disabled:opacity-60 dark:border-border-dark dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                />
                {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4 dark:border-border-dark">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selected.size} of {entries.length} selected
              </p>
              <div className="flex gap-2">
                {step === 'select' ? (
                  <>
                    {error && <p className="mr-2 self-center text-xs text-red-500">{error}</p>}
                    <button
                      type="button"
                      onClick={() => void handleDownload()}
                      disabled={noneChecked || downloading}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-border-dark dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      {downloading ? 'Saving…' : 'Download'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setError(null); setStep('email') }}
                      disabled={noneChecked}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
                    >
                      <MailIcon className="h-4 w-4" />
                      Share via Email
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { setStep('select'); setError(null) }}
                      disabled={step === 'sending'}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-border-dark dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSendEmail()}
                      disabled={!recipientEmail.trim() || step === 'sending'}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-40"
                    >
                      <MailIcon className="h-4 w-4" />
                      {step === 'sending' ? 'Sending…' : 'Send Email'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
