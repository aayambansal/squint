import fs from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  define: {
    // Single source of truth: the version ships from package.json.
    __SQUINT_VERSION__: JSON.stringify(pkg.version),
  },
})
