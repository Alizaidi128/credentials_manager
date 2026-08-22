import { FormEvent, useEffect, useRef, useState } from 'react'
import type { CredentialEntry } from '@shared/types'
import { EyeIcon, EyeOffIcon, ShieldIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

interface UnlockScreenProps {
  onUnlocked: (entries: CredentialEntry[]) => void
}

type Mode = 'unlock' | 'otp'

export function UnlockScreen({ onUnlocked }: UnlockScreenProps): JSX.Element {
  const [checking, setChecking] = useState(true)
  const [vaultExists, setVaultExists] = useState(false)
  const [mode, setMode] = useState<Mode>('unlock')

  // Unlock / create
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // OTP reset
  const [otpRequested, setOtpRequested] = useState(false)
  const [otpInput, setOtpInput] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    window.api.vaultExists().then((exists) => {
      setVaultExists(exists)
      setChecking(false)
    })
  }, [])

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (otpExpiry === null) return
    function tick(): void {
      const remaining = Math.max(0, Math.round((otpExpiry! - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0 && countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [otpExpiry])

  function resetToUnlock(): void {
    setMode('unlock')
    setError(null)
    setOtpRequested(false)
    setOtpVerified(false)
    setOtpInput('')
    setOtpExpiry(null)
    setNewPassword('')
    setConfirmNewPassword('')
    setPassword('')
    setConfirmPassword('')
  }

  // ── Normal unlock / create ─────────────────────────────────────────────────
  async function handleUnlockSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!vaultExists) {
      if (password.length < 8) { setError('Master password must be at least 8 characters.'); return }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return }
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
        onUnlocked(result.entries)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // ── OTP reset — step 1: send OTP ──────────────────────────────────────────
  async function handleRequestOtp(): Promise<void> {
    setError(null)
    setSubmitting(true)
    try {
      const result = await window.api.requestOtp()
      if (!result.ok) {
        setError(result.error ?? 'Failed to send OTP. Check email settings.')
        setSubmitting(false)
        return
      }
      setOtpExpiry(result.expiry ?? null)
      setOtpRequested(true)
    } catch {
      setError('Could not send OTP. Check your email settings.')
    }
    setSubmitting(false)
  }

  // ── OTP reset — step 2: verify OTP ────────────────────────────────────────
  async function handleVerifyOtp(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (!otpInput.trim()) { setError('Please enter the OTP code.'); return }
    setSubmitting(true)
    const { valid } = await window.api.verifyOtp(otpInput.trim())
    setSubmitting(false)
    if (!valid) { setError('Invalid or expired OTP. Please request a new one.'); return }
    setOtpVerified(true)
  }

  // ── OTP reset — step 3: set new password ──────────────────────────────────
  async function handleResetSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      const result = await window.api.resetVaultPassword(newPassword)
      if (!result.ok || !result.entries) {
        setError(result.error ?? 'Reset failed.')
        setSubmitting(false)
        return
      }
      onUnlocked(result.entries)
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // ── OTP reset mode ─────────────────────────────────────────────────────────
  if (mode === 'otp') {
    const secsDisplay = secondsLeft !== null
      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
      : null
    const expired = secondsLeft !== null && secondsLeft === 0

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0b0d12] dark:to-[#141821]">
        <div className="absolute right-5 top-5"><ThemeToggle /></div>
        <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface/90 p-8 shadow-popover backdrop-blur dark:border-border-dark dark:bg-surface-dark/90">

          {/* Step 1: Request OTP */}
          {!otpRequested && (
            <>
              <div className="mb-5 flex flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Reset via email</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  A one-time code will be sent to the email address configured in Settings.
                </p>
              </div>
              {error && <p className="mb-3 animate-fade-in rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={submitting}
                className="w-full rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send OTP to my email'}
              </button>
            </>
          )}

          {/* Step 2: Enter OTP */}
          {otpRequested && !otpVerified && (
            <>
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Check your email</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enter the 6-digit code sent to your email.</p>
              </div>

              {secsDisplay && !expired && (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                  <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-amber-700 dark:text-amber-300">Expires in <strong>{secsDisplay}</strong></span>
                </div>
              )}
              {expired && (
                <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  Code expired.{' '}
                  <button type="button" onClick={() => { setOtpRequested(false); setOtpExpiry(null); setError(null) }} className="underline">
                    Send a new one
                  </button>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                />
                {error && <p className="animate-fade-in rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || expired || otpInput.length !== 6}
                  className="w-full rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {submitting ? 'Verifying…' : 'Verify Code'}
                </button>
              </form>
            </>
          )}

          {/* Step 3: Set new password */}
          {otpVerified && (
            <>
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Set new password</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your vault and all entries will be preserved.</p>
              </div>
              <form onSubmit={handleResetSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    autoFocus
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New master password"
                    className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none ring-brand-500/40 transition focus:ring-2 dark:border-border-dark dark:bg-panel-dark dark:text-white"
                  />
                  <button type="button" onClick={() => setShowNewPassword(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
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
                {error && <p className="animate-fade-in rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          <button type="button" onClick={resetToUnlock} className="mt-4 w-full text-center text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200">
            ← Back to unlock
          </button>
        </div>
      </div>
    )
  }

  // ── Normal unlock / create mode ────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0b0d12] dark:to-[#141821]">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface/90 p-8 shadow-popover backdrop-blur dark:border-border-dark dark:bg-surface-dark/90">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            <ShieldIcon className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            {checking ? 'Vaultier' : vaultExists ? 'Unlock your vault' : 'Create your vault'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {vaultExists ? 'Enter your master password to continue' : 'Choose a strong master password to get started.'}
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
              <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" tabIndex={-1}>
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

            {error && <p className="animate-fade-in rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

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
                onClick={() => { setMode('otp'); setError(null) }}
                className="w-full text-center text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
              >
                Forgot password?
              </button>
            )}
          </form>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-600">
          Everything stays on this device. Your vault is encrypted with AES-256-GCM and never leaves your computer.
        </p>
      </div>
    </div>
  )
}
