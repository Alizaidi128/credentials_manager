import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AppEntry, CredentialEntry } from '../shared/types'

const SCRYPT_N = 1 << 15 // 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32 // AES-256
const IV_LENGTH = 12 // GCM standard nonce size
const SALT_LENGTH = 16

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keylen,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) reject(err)
        else resolve(derivedKey)
      }
    )
  })
}

interface VaultFile {
  version: 1
  salt: string // base64 — scrypt salt for the master password path
  iv: string
  authTag: string
  ciphertext: string // entries encrypted with the master-password-derived key
  // Optional recovery fields — present only after setupRecoveryKey() is called
  recoverySalt?: string // base64 — scrypt salt for the recovery code path
  recoveryIv?: string
  recoveryAuthTag?: string
  recoveryCiphertext?: string // same entries, encrypted with the recovery-derived key
}

function vaultPath(): string {
  return join(app.getPath('userData'), 'vault.dat')
}

export async function vaultExists(): Promise<boolean> {
  try {
    await fs.access(vaultPath())
    return true
  } catch {
    return false
  }
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH)
}

function encryptData(key: Buffer, entries: CredentialEntry[]): { iv: string; authTag: string; ciphertext: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(entries), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }
}

function decryptData(key: Buffer, iv: string, authTag: string, ciphertext: string): CredentialEntry[] {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ])
  const raw = JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>[]
  return raw.map(migrateEntry)
}

function migrateEntry(raw: Record<string, unknown>): CredentialEntry {
  if (!Array.isArray(raw.apps)) {
    const legacy: AppEntry[] = []
    const url = (raw.appUrl as string | undefined) ?? ''
    if (url.trim()) {
      legacy.push({
        id: crypto.randomUUID(),
        name: (raw.appName as string | undefined) ?? 'App',
        url,
        username: (raw.appUsername as string | undefined) ?? '',
        password: (raw.appPassword as string | undefined) ?? ''
      })
    }
    raw.apps = legacy
  }
  return raw as unknown as CredentialEntry
}

async function writeVaultFile(file: VaultFile): Promise<void> {
  const target = vaultPath()
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(file), 'utf8')
  await fs.rename(tmp, target)
}

async function readVaultFile(): Promise<VaultFile> {
  const raw = await fs.readFile(vaultPath(), 'utf8')
  return JSON.parse(raw)
}

// Normalise a user-entered recovery code: strip spaces/dashes, lowercase.
// Stored/derived key always uses the normalised hex string as scrypt password.
function normaliseRecoveryCode(input: string): string {
  return input.replace(/[\s\-]/g, '').toLowerCase()
}

function formatRecoveryCode(raw: Buffer): string {
  // 16 bytes → "XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" (32 uppercase hex chars)
  const hex = raw.toString('hex').toUpperCase()
  return [hex.slice(0, 8), hex.slice(8, 16), hex.slice(16, 24), hex.slice(24, 32)].join('-')
}

/** In-memory session state. Master password and recovery code are never persisted. */
let sessionKey: Buffer | null = null
let sessionSalt: Buffer | null = null
let sessionRecoveryKey: Buffer | null = null
let sessionRecoverySalt: Buffer | null = null

export function isUnlocked(): boolean {
  return sessionKey !== null
}

export function lock(): void {
  sessionKey = null
  sessionSalt = null
  sessionRecoveryKey = null
  sessionRecoverySalt = null
}

export async function hasRecoveryKey(): Promise<boolean> {
  try {
    const file = await readVaultFile()
    return !!(file.recoverySalt && file.recoveryCiphertext)
  } catch {
    return false
  }
}

export async function createVault(password: string): Promise<{ entries: CredentialEntry[]; recoveryCode: string }> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await deriveKey(password, salt)

  const entries: CredentialEntry[] = []

  // Generate recovery key immediately on creation
  const recoveryRaw = randomBytes(16)
  const recoveryCode = formatRecoveryCode(recoveryRaw)
  const recoverySalt = randomBytes(SALT_LENGTH)
  const recoveryKey = await deriveKey(normaliseRecoveryCode(recoveryCode), recoverySalt)

  const primary = encryptData(key, entries)
  const recovery = encryptData(recoveryKey, entries)

  const file: VaultFile = {
    version: 1,
    salt: salt.toString('base64'),
    ...primary,
    recoverySalt: recoverySalt.toString('base64'),
    recoveryIv: recovery.iv,
    recoveryAuthTag: recovery.authTag,
    recoveryCiphertext: recovery.ciphertext
  }
  await writeVaultFile(file)

  sessionKey = key
  sessionSalt = salt
  sessionRecoveryKey = recoveryKey
  sessionRecoverySalt = recoverySalt

  return { entries, recoveryCode }
}

export async function unlockVault(password: string): Promise<CredentialEntry[]> {
  const file = await readVaultFile()
  const salt = Buffer.from(file.salt, 'base64')
  const key = await deriveKey(password, salt)
  try {
    const entries = decryptData(key, file.iv, file.authTag, file.ciphertext)
    sessionKey = key
    sessionSalt = salt
    // Load recovery salt into session so saveEntries can carry it forward
    if (file.recoverySalt) {
      sessionRecoverySalt = Buffer.from(file.recoverySalt, 'base64')
      // Recovery key itself is NOT loaded — we don't have the recovery code.
      // saveEntries will carry the existing recovery ciphertext forward unchanged
      // until setupRecoveryKey() is called in this session.
    }
    return entries
  } catch {
    throw new Error('Incorrect master password')
  }
}

/** Generate a new recovery code and encrypt the current vault contents with it.
 *  Vault must already be unlocked. Returns the recovery code to display. */
export async function setupRecoveryKey(): Promise<string> {
  if (!sessionKey || !sessionSalt) throw new Error('Vault is locked')

  const file = await readVaultFile()
  const entries = decryptData(sessionKey, file.iv, file.authTag, file.ciphertext)

  const recoveryRaw = randomBytes(16)
  const recoveryCode = formatRecoveryCode(recoveryRaw)
  const recoverySalt = randomBytes(SALT_LENGTH)
  const recoveryKey = await deriveKey(normaliseRecoveryCode(recoveryCode), recoverySalt)

  const recovery = encryptData(recoveryKey, entries)

  const updatedFile: VaultFile = {
    ...file,
    recoverySalt: recoverySalt.toString('base64'),
    recoveryIv: recovery.iv,
    recoveryAuthTag: recovery.authTag,
    recoveryCiphertext: recovery.ciphertext
  }
  await writeVaultFile(updatedFile)

  sessionRecoveryKey = recoveryKey
  sessionRecoverySalt = recoverySalt

  return recoveryCode
}

/** Decrypt vault using a recovery code, set a new master password, and return entries.
 *  Does NOT require the vault to be unlocked. */
export async function resetWithRecoveryKey(
  recoveryCode: string,
  newPassword: string
): Promise<CredentialEntry[]> {
  const file = await readVaultFile()
  if (!file.recoverySalt || !file.recoveryCiphertext || !file.recoveryIv || !file.recoveryAuthTag) {
    throw new Error('No recovery key is configured for this vault.')
  }

  const recoverySalt = Buffer.from(file.recoverySalt, 'base64')
  const recoveryKey = await deriveKey(normaliseRecoveryCode(recoveryCode), recoverySalt)

  let entries: CredentialEntry[]
  try {
    entries = decryptData(recoveryKey, file.recoveryIv, file.recoveryAuthTag, file.recoveryCiphertext)
  } catch {
    throw new Error('Incorrect recovery key.')
  }

  // Re-encrypt with the new master password
  const newSalt = randomBytes(SALT_LENGTH)
  const newKey = await deriveKey(newPassword, newSalt)
  const primary = encryptData(newKey, entries)

  // Keep the same recovery key (fresh ciphertext so it matches the entries we just set)
  const recovery = encryptData(recoveryKey, entries)

  const updatedFile: VaultFile = {
    version: 1,
    salt: newSalt.toString('base64'),
    ...primary,
    recoverySalt: file.recoverySalt,
    recoveryIv: recovery.iv,
    recoveryAuthTag: recovery.authTag,
    recoveryCiphertext: recovery.ciphertext
  }
  await writeVaultFile(updatedFile)

  sessionKey = newKey
  sessionSalt = newSalt
  sessionRecoveryKey = recoveryKey
  sessionRecoverySalt = recoverySalt

  return entries
}

export async function saveEntries(entries: CredentialEntry[]): Promise<void> {
  if (!sessionKey || !sessionSalt) throw new Error('Vault is locked')

  // Read the existing file to preserve recovery metadata we might not have in session
  const existing = await readVaultFile().catch(() => null)

  const primary = encryptData(sessionKey, entries)

  const file: VaultFile = {
    version: 1,
    salt: sessionSalt.toString('base64'),
    ...primary
  }

  if (sessionRecoveryKey && sessionRecoverySalt) {
    // Recovery key is active in this session — keep it in sync with the new entries
    const recovery = encryptData(sessionRecoveryKey, entries)
    file.recoverySalt = sessionRecoverySalt.toString('base64')
    file.recoveryIv = recovery.iv
    file.recoveryAuthTag = recovery.authTag
    file.recoveryCiphertext = recovery.ciphertext
  } else if (existing?.recoverySalt && existing.recoveryCiphertext) {
    // Recovery key not in session (was set in a prior session) — carry the
    // existing ciphertext forward so we don't silently erase it.
    // It will be stale until the user regenerates it from Settings.
    file.recoverySalt = existing.recoverySalt
    file.recoveryIv = existing.recoveryIv
    file.recoveryAuthTag = existing.recoveryAuthTag
    file.recoveryCiphertext = existing.recoveryCiphertext
  }

  await writeVaultFile(file)
}
