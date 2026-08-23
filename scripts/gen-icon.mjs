#!/usr/bin/env node
// Generates resources/icon.ico — multi-resolution ICO with PNG blobs.
// Run: node scripts/gen-icon.mjs
//
// Sizes: 16, 24, 32, 48, 64, 128, 256
// Design: indigo gradient bg (brand-500 → brand-700, top-left→bottom-right)
//         rounded corners + white shield matching the login screen icon.

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'

// ── PNG encoding ──────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xFF] ?? 0) ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([lenBuf, t, data, crcBuf])
}

function toPNG(rgba, S) {
  const rowLen = 1 + S * 4
  const sl = Buffer.alloc(S * rowLen)
  for (let y = 0; y < S; y++) {
    sl[y * rowLen] = 0 // filter type: None
    rgba.copy(sl, y * rowLen + 1, y * S * 4, (y + 1) * S * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(sl, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ── Cubic bezier ──────────────────────────────────────────────────────────────
function bez(t, p0, p1, p2, p3) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

// ── Shield polygon in pixel space ─────────────────────────────────────────────
// SVG path: M12 2 4 5v6 c0 5 3.4 8.7 8 11  4.6-2.3 8-6 8-11 V5 Z  (24×24 viewBox)
// Shield bounds in SVG: x∈[4..20], y∈[2..22] → width=16, height=20
// Scale so height = 75% of S, center horizontally.
function shieldPolygon(S) {
  const sc = (0.75 * S) / 20  // px per SVG unit
  const ox = (S - 16 * sc) / 2 - 4 * sc  // x origin so SVG x=4 maps to (S-16*sc)/2
  const oy = (S - 20 * sc) / 2 - 2 * sc  // y origin so SVG y=2 maps to (S-20*sc)/2

  const T = (sx, sy) => [sx * sc + ox, sy * sc + oy]
  const N = 32

  const pts = []
  pts.push(T(12, 2))  // top center
  pts.push(T(4, 5))   // left shoulder
  pts.push(T(4, 11))  // left mid (start of bottom-left curve)

  // Bottom-left curve: (4,11)→(12,22), controls (4,16) and (7.4,19.7)
  for (let i = 1; i <= N; i++) {
    const v = i / N
    pts.push(T(bez(v, 4, 4, 7.4, 12), bez(v, 11, 16, 19.7, 22)))
  }

  // Bottom-right curve: (12,22)→(20,11), controls (16.6,19.7) and (20,16)
  for (let i = 1; i <= N; i++) {
    const v = i / N
    pts.push(T(bez(v, 12, 16.6, 20, 20), bez(v, 22, 19.7, 16, 11)))
  }

  pts.push(T(20, 5))  // right shoulder → Z closes to (12,2)

  return pts
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function inRoundedRect(px, py, l, t, r, b, cr) {
  if (px < l || px > r || py < t || py > b) return false
  if (px < l + cr && py < t + cr) return Math.hypot(px - (l + cr), py - (t + cr)) < cr
  if (px > r - cr && py < t + cr) return Math.hypot(px - (r - cr), py - (t + cr)) < cr
  if (px < l + cr && py > b - cr) return Math.hypot(px - (l + cr), py - (b - cr)) < cr
  if (px > r - cr && py > b - cr) return Math.hypot(px - (r - cr), py - (b - cr)) < cr
  return true
}

// ── Gradient: brand-500 (#6366f1) top-left → brand-700 (#4338ca) bottom-right ─
function gradRGB(x, y, S) {
  const t = (x / S + y / S) / 2
  return [
    Math.round(99  + t * (67  - 99)),
    Math.round(102 + t * (56  - 102)),
    Math.round(241 + t * (202 - 241))
  ]
}

// ── Render one size ───────────────────────────────────────────────────────────
function render(S) {
  const SAMP = 4  // 4×4 supersampling
  const CR   = S * 0.22  // ~22% corner radius (like rounded-2xl scaled up)
  const shield = shieldPolygon(S)
  const rgba = Buffer.alloc(S * S * 4, 0)

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let bgHits = 0
      let shHits = 0

      for (let sy = 0; sy < SAMP; sy++) {
        for (let sx = 0; sx < SAMP; sx++) {
          const px = x + (sx + 0.5) / SAMP
          const py = y + (sy + 0.5) / SAMP
          if (inRoundedRect(px, py, 0, 0, S, S, CR)) bgHits++
          if (pointInPoly(px, py, shield)) shHits++
        }
      }

      const total = SAMP * SAMP
      if (bgHits === 0 && shHits === 0) continue

      const bgA = bgHits / total
      const shA = shHits / total
      const [gr, gg, gb] = gradRGB(x, y, S)

      // Shield is rendered on top of gradient bg; both clipped to rounded rect.
      // shieldBlend = 0 where background is transparent (outside rounded corners).
      const shBlend = Math.min(shA, bgA)

      const i = (y * S + x) * 4
      rgba[i]     = Math.round(gr + (255 - gr) * shBlend)
      rgba[i + 1] = Math.round(gg + (255 - gg) * shBlend)
      rgba[i + 2] = Math.round(gb + (255 - gb) * shBlend)
      rgba[i + 3] = Math.round(bgA * 255)
    }
  }

  return rgba
}

// ── Build ICO ────────────────────────────────────────────────────────────────
const SIZES = [16, 24, 32, 48, 64, 128, 256]

console.log('Generating Vaultier icon…')
const pngs = SIZES.map(S => {
  process.stdout.write(`  Rendering ${S}×${S}… `)
  const buf = toPNG(render(S), S)
  console.log(`${(buf.length / 1024).toFixed(1)} KB`)
  return buf
})

// 6-byte ICO header
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)            // reserved
header.writeUInt16LE(1, 2)            // type: 1 = ICO
header.writeUInt16LE(SIZES.length, 4) // number of images

// 16-byte directory entries
let dataOffset = 6 + SIZES.length * 16
const dirs = SIZES.map((S, i) => {
  const d = Buffer.alloc(16)
  d.writeUInt8(S >= 256 ? 0 : S, 0)   // width  (0 = 256)
  d.writeUInt8(S >= 256 ? 0 : S, 1)   // height (0 = 256)
  d.writeUInt8(0, 2)                    // color count (0 = true-color)
  d.writeUInt8(0, 3)                    // reserved
  d.writeUInt16LE(1, 4)                 // color planes
  d.writeUInt16LE(32, 6)                // bits per pixel
  d.writeUInt32LE(pngs[i].length, 8)   // image data size
  d.writeUInt32LE(dataOffset, 12)       // image data offset
  dataOffset += pngs[i].length
  return d
})

mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.ico', Buffer.concat([header, ...dirs, ...pngs]))
console.log(`\n✓  Saved to resources/icon.ico  (${(dataOffset / 1024).toFixed(0)} KB total)`)
