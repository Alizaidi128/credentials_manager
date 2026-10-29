import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'crypto'
import { promises as fs } from 'fs'
import { join } from 'path'
import { app, safeStorage } from 'electron'
import type { AppEntry, CredentialEntry } from '../shared/types'

const SCRYPT_N = 1 << 15
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password, salt, keylen,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (err, key) => { if (err) reject(err); else resolve(key) }
    )
  })
}

interface VaultFile {
  version: 1
  salt: string
  iv: string
  authTag: string
  ciphertext: string
  // Recovery path — always present; managed internally via safeStorage
  recoverySalt?: string
  recoveryIv?: string
  recoveryAuthTag?: string
  recoveryCiphertext?: string
}

function vaultPath(): string { return join(app.getPath('userData'), 'vault.dat') }
function recoveryKeyPath(): string { return join(app.getPath('userData'), 'vault-rk.bin') }

export async function vaultExists(): Promise<boolean> {
  try { await fs.access(vaultPath()); return true } catch { return false }
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH)
}

function encryptData(key: Buffer, entries: CredentialEntry[]): { iv: string; authTag: string; ciphertext: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(entries), 'utf8')), cipher.final()])
  return { iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), ciphertext: ct.toString('base64') }
}

function decryptData(key: Buffer, iv: string, authTag: string, ciphertext: string): CredentialEntry[] {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(authTag, 'base64'))
  const pt = Buffer.concat([d.update(Buffer.from(ciphertext, 'base64')), d.final()])
  return (JSON.parse(pt.toString('utf8')) as Record<string, unknown>[]).map(migrateEntry)
}

function migrateEntry(raw: Record<string, unknown>): CredentialEntry {
  if (!Array.isArray(raw.apps)) {
    const url = (raw.appUrl as string | undefined) ?? ''
    raw.apps = url.trim() ? [{
      id: crypto.randomUUID(),
      name: (raw.appName as string | undefined) ?? 'App',
      url,
      username: (raw.appUsername as string | undefined) ?? '',
      password: (raw.appPassword as string | undefined) ?? ''
    }] as AppEntry[] : []
  }
  if (!Array.isArray(raw.servers)) {
    const legacyType = raw.serverType as string | undefined
    if (legacyType && legacyType !== 'none') {
      raw.servers = [{
        id: crypto.randomUUID(),
        type: legacyType,
        name: legacyType === 'rdp' ? 'Remote Desktop' : 'SFTP',
        host: (raw.serverHost as string | undefined) ?? '',
        port: (raw.serverPort as string | undefined) ?? '',
        username: (raw.serverUsername as string | undefined) ?? '',
        password: (raw.serverPassword as string | undefined) ?? '',
        sftpServer: (raw.serverSftpServer as string | undefined) ?? ''
      }]
    } else {
      raw.servers = []
    }
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
  return JSON.parse(await fs.readFile(vaultPath(), 'utf8'))
}

function normalise(input: string): string {
  return input.replace(/[\s\-]/g, '').toLowerCase()
}

function formatCode(raw: Buffer): string {
  const h = raw.toString('hex').toUpperCase()
  return [h.slice(0, 8), h.slice(8, 16), h.slice(16, 24), h.slice(24, 32)].join('-')
}

// ── safeStorage helpers ──────────────────────────────────────────────────────

async function storeRecoveryCode(code: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store as plain text (still on-device, OS file permissions apply)
    await fs.writeFile(recoveryKeyPath(), code, 'utf8')
    return
  }
  await fs.writeFile(recoveryKeyPath(), safeStorage.encryptString(code))
}

async function loadRecoveryCode(): Promise<string> {
  const data = await fs.readFile(recoveryKeyPath())
  if (!safeStorage.isEncryptionAvailable()) return data.toString('utf8')
  // If the file looks like plain text (fallback case), return as-is
  try { return safeStorage.decryptString(data) } catch { return data.toString('utf8') }
}

// ── Session state ────────────────────────────────────────────────────────────

let sessionKey: Buffer | null = null
let sessionSalt: Buffer | null = null
let sessionRecoveryKey: Buffer | null = null
let sessionRecoverySalt: Buffer | null = null

export function isUnlocked(): boolean { return sessionKey !== null }

export function lock(): void {
  sessionKey = null; sessionSalt = null
  sessionRecoveryKey = null; sessionRecoverySalt = null
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function createVault(password: string): Promise<{ entries: CredentialEntry[] }> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await deriveKey(password, salt)
  const entries: CredentialEntry[] = []

  const recoveryRaw = randomBytes(16)
  const recoveryCode = formatCode(recoveryRaw)
  const recoverySalt = randomBytes(SALT_LENGTH)
  const recoveryKey = await deriveKey(normalise(recoveryCode), recoverySalt)

  const primary = encryptData(key, entries)
  const recovery = encryptData(recoveryKey, entries)

  await writeVaultFile({
    version: 1,
    salt: salt.toString('base64'),
    ...primary,
    recoverySalt: recoverySalt.toString('base64'),
    recoveryIv: recovery.iv,
    recoveryAuthTag: recovery.authTag,
    recoveryCiphertext: recovery.ciphertext
  })

  await storeRecoveryCode(recoveryCode)

  sessionKey = key
  sessionSalt = salt
  sessionRecoveryKey = recoveryKey
  sessionRecoverySalt = recoverySalt

  return { entries }
}

export async function unlockVault(password: string): Promise<CredentialEntry[]> {
  const file = await readVaultFile()
  const salt = Buffer.from(file.salt, 'base64')
  const key = await deriveKey(password, salt)
  try {
    const entries = decryptData(key, file.iv, file.authTag, file.ciphertext)
    sessionKey = key
    sessionSalt = salt
    if (file.recoverySalt) sessionRecoverySalt = Buffer.from(file.recoverySalt, 'base64')
    return entries
  } catch {
    throw new Error('Incorrect master password')
  }
}

/** Reset master password using the internally-stored recovery key.
 *  Called after OTP is verified. Entries are fully preserved. */
export async function resetVaultPassword(newPassword: string): Promise<CredentialEntry[]> {
  const file = await readVaultFile()
  if (!file.recoverySalt || !file.recoveryCiphertext || !file.recoveryIv || !file.recoveryAuthTag) {
    throw new Error('No recovery path found. Please re-create your vault.')
  }

  const recoveryCode = await loadRecoveryCode()
  const recoverySalt = Buffer.from(file.recoverySalt, 'base64')
  const recoveryKey = await deriveKey(normalise(recoveryCode), recoverySalt)

  let entries: CredentialEntry[]
  try {
    entries = decryptData(recoveryKey, file.recoveryIv, file.recoveryAuthTag, file.recoveryCiphertext)
  } catch {
    throw new Error('Internal recovery key mismatch. Please re-create your vault.')
  }

  const newSalt = randomBytes(SALT_LENGTH)
  const newKey = await deriveKey(newPassword, newSalt)
  const primary = encryptData(newKey, entries)
  const recovery = encryptData(recoveryKey, entries)

  await writeVaultFile({
    version: 1,
    salt: newSalt.toString('base64'),
    ...primary,
    recoverySalt: file.recoverySalt,
    recoveryIv: recovery.iv,
    recoveryAuthTag: recovery.authTag,
    recoveryCiphertext: recovery.ciphertext
  })

  sessionKey = newKey
  sessionSalt = newSalt
  sessionRecoveryKey = recoveryKey
  sessionRecoverySalt = recoverySalt

  return entries
}

export async function saveEntries(entries: CredentialEntry[]): Promise<void> {
  if (!sessionKey || !sessionSalt) throw new Error('Vault is locked')

  const existing = await readVaultFile().catch(() => null)
  const primary = encryptData(sessionKey, entries)
  const file: VaultFile = { version: 1, salt: sessionSalt.toString('base64'), ...primary }

  if (sessionRecoveryKey && sessionRecoverySalt) {
    const r = encryptData(sessionRecoveryKey, entries)
    file.recoverySalt = sessionRecoverySalt.toString('base64')
    file.recoveryIv = r.iv
    file.recoveryAuthTag = r.authTag
    file.recoveryCiphertext = r.ciphertext
  } else if (existing?.recoverySalt && existing.recoveryCiphertext) {
    file.recoverySalt = existing.recoverySalt
    file.recoveryIv = existing.recoveryIv
    file.recoveryAuthTag = existing.recoveryAuthTag
    file.recoveryCiphertext = existing.recoveryCiphertext
  }

  await writeVaultFile(file)
}
