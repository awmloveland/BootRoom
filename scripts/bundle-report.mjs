// scripts/bundle-report.mjs
// Sums the gzipped size of every client chunk each app route references.
// Run after `next build`. Turbopack names chunks opaquely, so this reads the
// per-route client reference manifests instead of guessing from file names.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = '.next'
const APP = join(ROOT, 'server', 'app')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const gz = new Map()
function gzipSize(file) {
  if (!gz.has(file)) {
    try {
      gz.set(file, gzipSync(readFileSync(file)).length)
    } catch {
      console.warn(`Missing chunk: ${file}`)
      gz.set(file, 0)
    }
  }
  return gz.get(file)
}

try {
  statSync(APP)
} catch {
  console.error('No build found. Run `npm run build` first.')
  process.exit(1)
}

const rows = walk(APP)
  .filter((file) => file.endsWith('_client-reference-manifest.js'))
  .map((file) => {
    const source = readFileSync(file, 'utf8')
    const chunks = new Set([...source.matchAll(/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))
    const bytes = [...chunks].reduce((sum, chunk) => sum + gzipSize(join(ROOT, chunk)), 0)
    const route = file.slice(APP.length).replace('_client-reference-manifest.js', '')
    return { route, bytes, chunks: chunks.size }
  })
  .sort((a, b) => b.bytes - a.bytes)

console.log('Client JS per route (gzipped)')
const shown = rows.filter((row) => row.chunks > 0)
const skipped = rows.length - shown.length
for (const { route, bytes, chunks } of shown) {
  console.log(`${String(Math.round(bytes / 1024)).padStart(5)} kB  ${route}  (${chunks} chunks)`)
}
console.log(`${skipped} routes with no client JS`)
