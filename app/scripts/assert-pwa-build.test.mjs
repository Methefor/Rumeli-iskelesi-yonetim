import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pngSize, pwaProblems } from './assert-pwa-build.mjs'

const dist = resolve('dist')

test('the built PWA artefacts pass (manifest, icons, maskable, apple icon, service worker)', { skip: !existsSync(dist) && 'run `npm run build` first' }, () => {
  assert.deepEqual(pwaProblems(dist), [])
})

test('a missing or wrong artefact is reported', { skip: !existsSync(dist) && 'run `npm run build` first' }, () => {
  const copy = mkdtempSync(join(tmpdir(), 'pwa-'))
  try {
    cpSync(dist, copy, { recursive: true })
    const manifestPath = join(copy, 'manifest.webmanifest')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.id = undefined
    manifest.icons = manifest.icons.filter((i) => i.purpose !== 'maskable')
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const problems = pwaProblems(copy).join('\n')
    assert.match(problems, /manifest\.id/)
    assert.match(problems, /512x512 maskable/)
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
})

test('icon dimensions come from the real PNG header', () => {
  assert.equal(pngSize(Buffer.from('not a png')), null)
  const apple = resolve('public/apple-touch-icon.png')
  assert.deepEqual(pngSize(readFileSync(apple)), { width: 180, height: 180 })
  assert.deepEqual(pngSize(readFileSync(resolve('public/pwa-maskable-512x512.png'))), { width: 512, height: 512 })
})

test('no stale public manifest can shadow the generated one', () => {
  assert.equal(existsSync(resolve('public/manifest.webmanifest')), false)
  assert.equal(existsSync(resolve('public/manifest.json')), false)
})
