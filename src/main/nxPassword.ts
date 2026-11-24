import { randomInt } from 'crypto'

// NoMachine stores a remembered password in a session file's "Auth" option as a
// scrambled string. The scrambling is keyless and reversible (NoMachine's own
// getScrambleString / getDescrambleString in libnx.dll), so this reproduces it:
//
//   encoded = ":" + (charCode + position) joined by ":" + ":"      e.g. "ab" -> ":98:100:"
//   layout  = reverse(encoded), padded with "{{{{" blocks (see below)
//   output  = key + body + filler
//   body[j] = alphabet[(index(layout[j]) + (j + 2) * S) mod 85],  S = (keyCode - 33 + len(layout) + 31) mod 85
//
// Verified against NoMachine's own decoder, which returned the original password
// for every generated string. Only printable ASCII is supported; anything else
// returns null so the caller can fall back to a manual login.

const BODY_ALPHABET = "!#$%&()*+-.0123456789:;<>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz{|}"
const KEY_CHARS = "!#$%&(*+.0123456789:;<>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcd"
const FILLER_CHARS = "#%&*+-/02356789:;<>@ABCDEFGHIKLMNOPQRSTUVWXYZ[]_acf"
const PAD = '{{{{'
const MODULUS = BODY_ALPHABET.length
const MIN_BODY_LENGTH = 32
const MAX_PASSWORD_LENGTH = 100

const mod = (a: number, n: number): number => ((a % n) + n) % n

export function encodeNxPassword(password: string): string {
  const codes = [...password].map((c, i) => c.charCodeAt(0) + i + 1)
  return `:${codes.join(':')}:`
}

function buildLayout(password: string): string {
  const body = [...encodeNxPassword(password)].reverse().join('')
  let length = body.length
  let blocks = 0
  while (length < MIN_BODY_LENGTH && blocks < 2) {
    length += PAD.length
    blocks++
  }
  if (blocks === 2) return PAD + body + PAD
  if (blocks === 1) return PAD + body
  return body
}

/** Scrambles with a given key and filler character. Exported for verification. */
export function scrambleNxPasswordWith(password: string, key: string, filler: string): string {
  const layout = buildLayout(password)
  const shift = mod(key.charCodeAt(0) - 33 + layout.length + 31, MODULUS)
  let body = ''
  for (let j = 0; j < layout.length; j++) {
    body += BODY_ALPHABET[mod(BODY_ALPHABET.indexOf(layout[j]) + (j + 2) * shift, MODULUS)]
  }
  return key + body + filler
}

export function canScrambleNxPassword(password: string): boolean {
  return password.length > 0 && password.length <= MAX_PASSWORD_LENGTH && /^[\x20-\x7e]+$/.test(password)
}

/** Returns the value for a session file's Auth option, or null if it can't be produced. */
export function scrambleNxPassword(password: string): string | null {
  if (!canScrambleNxPassword(password)) return null
  const key = KEY_CHARS[randomInt(KEY_CHARS.length)]
  const filler = FILLER_CHARS[randomInt(FILLER_CHARS.length)]
  return scrambleNxPasswordWith(password, key, filler)
}
