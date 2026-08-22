import { FormEvent, useEffect, useState } from 'react'
import type { CredentialEntry } from '@shared/types'
import { CopyField } from './CopyField'
import { EyeIcon, EyeOffIcon, ShieldIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

interface UnlockScreenProps {
  onUnlocked: (entries: CredentialEntry[]) => void
}

type Mode = 'unlock' | 'forgot' | 'showRecovery'

export function UnlockScreen({ onUnlocked }: UnlockScreenProps): JSX.Element {
  const [checking, setChecking] = useState(true)
  const [vaultExists, setVaultExists] = useState(false)
  const [mode, setMode] = useState<Mode>('unlock')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // After vault creation: show the recovery code before letting user in
  const [pendingEntries, setPendingEntries] = useState<CredentialEntry[] | null>(null)
  const [recoveryCodeToShow, setRecoveryCodeToShow] = useState<string | null>(null)
  const [recoveryCopied, setRecoveryCopied] = useState(false)

  useEffect(() => {
    window.api.vaultExists().then((exists) => {
      setVaultExists(exists)
      setChecking(false)
    })
  }, [])

  async function handleUnlockSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)

    if (!vaultExists) {
      if (password.length < 8) {
        setError('Master password must be at least 8 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (vaultExists) {
        const result = await window.api.unlockVault(password)
        if (!result.ok || !result.entries) {
          setError(result.error ?? 'Incorrect master password.')
          setSubmitting(false)
          return
        }
        onUnlocked(result.entries)
      } else {
        const result = await window.api.createVault(password)
        if (!result.ok || !result.entries) {
          setError(result.error ?? 'Failed to create vault.')
          setSubmitting(false)
          return
        }
        // Show recovery code before entering the app
        setPendingEntries(result.entries)
        setRecoveryCodeToShow(result.recoveryCode ?? null)
        setMode('showRecovery')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleResetSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!recoveryCodeInput.trim()) {
      setError('Please enter your recovery key.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const result = await window.api.resetWithRecoveryKey(recoveryCodeInput.trim(), newPassword)
      if (!result.ok || !result.entries) {
        setError(result.error ?? 'Incorrect recovery key.')
        setSubmitting(false)
        return
      }
      onUnlocked(result.entries)
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  function handleDoneWithRecovery(): void {
    if (pendingEntries) onUnlocked(pendingEntries)
  }

  // ── Recovery code display (after vault creation) ───────────────────────────
  if (mode === 'showRecovery') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0b0d12] dark:to-[#141821]">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface/90 p-8 shadow-popover backdrop-blur dark:border-border-dark dark:bg-surface-dark/90">
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Save your recovery key</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This is shown <strong>once only</strong>. If you forget your master password, this key is the only way to recover your vault.
              Store it somewhere safe — a password manager, printed paper, or secure notes.
            </p>
          </div>

          {recoveryCodeToShow && (
            <div className="mb-5">
              <CopyField label="Recovery Key" value={recoveryCodeToShow} monospace />
            </div>
          )}

          <button
            type="button"
            onClick={handleDoneWithRecovery}
            className="w-full rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700"
          >
            I've saved my recovery key — Enter vault
          </button>
        </div>
      </div>
    )
  }

  // ── Forgot password / reset mode ───────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0b0d12] dark:to-[#141821]">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface/90 p-8 shadow-popover backdrop-blur dark:border-border-dark dark:bg-surface-dark/90">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
              <ShieldIcon className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Reset master password</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter your recovery key and choose a new master password.
            </p>
          </div>

          <form onSubmit={handleResetSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Recovery Key</label>
              <input
                autoFocus
                type="text"
                value={recoveryCodeInput}
                onChange={(e) => setRecoveryCodeInput(e.target.value)}
                placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 font-mono text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
              />
            </div>

            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New master password"
                className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>

            <input
              type={showNewPassword ? 'text' : 'password'}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
            />

            {error && (
              <p className="animate-fade-in rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? 'Resetting…' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => { setMode('unlock'); setError(null) }}
              className="w-full text-center text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            >
              Back to unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Normal unlock / create mode ────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0b0d12] dark:to-[#141821]">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface/90 p-8 shadow-popover backdrop-blur dark:border-border-dark dark:bg-surface-dark/90">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <ShieldIcon className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            {checking ? 'Vaultier' : vaultExists ? 'Unlock your vault' : 'Create your vault'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {vaultExists
              ? 'Enter your master password to continue'
              : 'Choose a strong master password. A recovery key will be generated for you.'}
          </p>
        </div>

        {!checking && (
          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div className="relative">
              <input
                autoFocus
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master password"
                className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>

            {!vaultExists && (
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm master password"
                className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
              />
            )}

            {error && (
              <p className="animate-fade-in rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || password.length === 0}
              className="w-full rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? 'Please wait…' : vaultExists ? 'Unlock' : 'Create Vault'}
            </button>

            {vaultExists && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(null) }}
                className="w-full text-center text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
              >
                Forgot password?
              </button>
            )}
          </form>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-600">
          Everything stays on this device. Your vault is encrypted with AES-256-GCM
          and never leaves your computer.
        </p>
      </div>
    </div>
  )
}
