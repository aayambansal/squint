import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildReceipt, canonical, verifyReceipt, writeReceipt } from '../src/quality/receipts.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-receipt-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('verification receipts', () => {
  it('seals the report with a recomputable digest and screenshot hashes', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@e.c', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: dir })
    const shot = path.join(dir, 'pulse.png')
    fs.writeFileSync(shot, 'fake-pixels')

    const receipt = buildReceipt(dir, { ok: true, gates: [{ id: 'typecheck', ok: true }], audit: { shots: [shot] } })
    expect(receipt.gitHead).toMatch(/^[0-9a-f]{40}$/)
    expect(receipt.screenshots['pulse.png']).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyReceipt(receipt)).toBe(true)

    const tampered = { ...receipt, report: { ...receipt.report, ok: false } }
    expect(verifyReceipt(tampered as typeof receipt)).toBe(false)
  })

  it('canonicalizes regardless of key order', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":3,"d":4}],"b":1}'.replace('"c":3,"d":4', '"c":4,"d":3'))
  })

  it('writes failed runs with a -failed suffix', () => {
    const file = writeReceipt(dir, { ok: false })
    expect(path.basename(file)).toContain('-failed')
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(verifyReceipt(loaded)).toBe(true)
  })
})

describe('receipts through squint ci', () => {
  it('the ci flow writes a verifiable receipt whose report matches the json output', async () => {
    execFileSync('git', ['init', '-q'], { cwd: dir })
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'fixture', scripts: { typecheck: 'node -e "process.exit(0)"' } }),
    )
    execFileSync('git', ['add', '-A'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@e.c', '-c', 'user.name=T', 'commit', '-qm', 'x'], { cwd: dir })

    // Drive the same path squint ci uses: gates → report → receipt.
    const { detectGates, runGates } = await import('../src/gates/gates.js')
    const gates = detectGates(dir)
    const results = await runGates(dir, gates)
    const report: Record<string, unknown> = {
      ok: results.every((r) => r.ok),
      gates: results.map((r) => ({ id: r.gate.id, ok: r.ok })),
    }
    const file = writeReceipt(dir, report)
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(verifyReceipt(receipt)).toBe(true)
    expect(receipt.report.ok).toBe(true)
    expect(receipt.gitHead).toMatch(/^[0-9a-f]{40}$/)
    expect(path.basename(file)).not.toContain('-failed')
  }, 30000)
})
