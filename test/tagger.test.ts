import { describe, expect, it } from 'vitest'
import { patchViteConfig, TAGGER_SOURCE } from '../src/tagger/source.js'
import { templateFiles } from '../src/scaffold/template.js'

describe('TAGGER_SOURCE', () => {
  it('is a self-contained dev-only plugin with alias, stamping, and picker', () => {
    expect(TAGGER_SOURCE).toContain("apply: 'serve'")
    expect(TAGGER_SOURCE).toContain("'react/jsx-dev-runtime'")
    expect(TAGGER_SOURCE).toContain('__squintSource')
    expect(TAGGER_SOURCE).toContain('transformIndexHtml')
    expect(TAGGER_SOURCE).toContain('navigator.clipboard')
    // Only host elements get stamped — never component refs.
    expect(TAGGER_SOURCE).toContain('typeof type === "string"')
  })

  it('ships multi-pin annotations: pins, notes, numbered compile', () => {
    expect(TAGGER_SOURCE).toContain('const pins = []')
    expect(TAGGER_SOURCE).toContain('note for this pin')
    expect(TAGGER_SOURCE).toContain('__squintCompile')
    expect(TAGGER_SOURCE).toContain("' — ' + p.note")
    // Single un-noted pin degrades to the plain reference format.
    expect(TAGGER_SOURCE).toContain('pins.length === 1')
  })
})

describe('patchViteConfig', () => {
  const template = templateFiles('x')['vite.config.ts']!

  it('detects an already-wired config', () => {
    expect(patchViteConfig(template)).toBe('already')
  })

  it('wires a plain config: import added, plugin first in the list', () => {
    const plain = `import react from '@vitejs/plugin-react'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`
    const patched = patchViteConfig(plain)
    expect(patched).not.toBeNull()
    expect(patched).not.toBe('already')
    expect(patched).toContain("import squintTagger from './squint-tagger.mjs'")
    expect(patched).toContain('plugins: [squintTagger(), react()]')
  })

  it('returns null for unrecognized shapes', () => {
    expect(patchViteConfig('export default {}')).toBeNull()
  })
})

describe('template wiring', () => {
  it('new apps ship with the tagger wired', () => {
    const files = templateFiles('x')
    expect(files['squint-tagger.mjs']).toBe(TAGGER_SOURCE)
    expect(files['vite.config.ts']).toContain('squintTagger()')
  })
})
