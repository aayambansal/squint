/**
 * The embedded starter: Vite + React + TS + Tailwind v4, token-first CSS.
 * Deliberately a blank canvas — the design brief has the engine commit to
 * a direction and set real tokens on the first prompt, so the template
 * ships neutral structure, not decoration. Embedded (not fetched) so init
 * is deterministic and instant.
 */
import { TAGGER_FILENAME, TAGGER_SOURCE } from '../tagger/source.js'

export function templateFiles(name: string): Record<string, string> {
  return {
    [TAGGER_FILENAME]: TAGGER_SOURCE,
    'package.json': `${JSON.stringify(
      {
        name,
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc --noEmit && vite build',
          preview: 'vite preview',
          typecheck: 'tsc --noEmit',
        },
        dependencies: {
          react: '^19.1.0',
          'react-dom': '^19.1.0',
        },
        devDependencies: {
          '@tailwindcss/vite': '^4.1.0',
          '@types/react': '^19.1.0',
          '@types/react-dom': '^19.1.0',
          '@vitejs/plugin-react': '^4.4.0',
          tailwindcss: '^4.1.0',
          typescript: '~5.8.0',
          vite: '^6.3.0',
        },
      },
      null,
      2,
    )}\n`,

    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

    'vite.config.ts': `import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import squintTagger from './squint-tagger.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), squintTagger()],
})
`,

    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          skipLibCheck: true,
          isolatedModules: true,
          useDefineForClassFields: true,
          noUncheckedIndexedAccess: true,
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,

    'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,

    'src/App.tsx': `export default function App() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper text-ink">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Ready.</h1>
        <p className="mt-2 text-sm text-muted">Open squint and describe what to build.</p>
      </div>
    </main>
  )
}
`,

    'src/index.css': `@import "tailwindcss";

/*
 * Design tokens live here — this file IS the design system.
 * Commit to a visual direction before building components:
 * set real display/body fonts, a deliberate palette, then compose
 * every component from these tokens (bg-paper, text-ink, text-accent…).
 * Never scatter literal colors through components.
 */
@theme {
  /* Type — replace with a committed pairing on the first design pass */
  --font-display: ui-sans-serif, system-ui, sans-serif;
  --font-body: ui-sans-serif, system-ui, sans-serif;

  /* Palette — neutral canvas + one accent until a direction is chosen */
  --color-ink: oklch(0.22 0.01 260);
  --color-paper: oklch(0.985 0.002 90);
  --color-muted: oklch(0.55 0.01 260);
  --color-accent: oklch(0.55 0.15 155);
}

body {
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
`,

    '.gitignore': `node_modules/
dist/
*.log
.DS_Store
`,

    '.squint/flows/home.flow': `# The starter journey: replayed headlessly by /flows after every change.
# Grow this file as the app grows — or ask the engine to.
goto /
expect Ready
shot home
`,

    '.squint/checks/root-renders.js': `// The starter check: replayed against the live page after every turn.
// Contract: this file evaluates IN THE PAGE to an array of failure
// strings — empty means pass. First-line pragmas move a check to full
// audits (// squint-trigger: audit) or the daemon's clock (interval:300).
(() => {
  const root = document.querySelector('#root');
  if (!root) return ['#root is missing from the page'];
  if (root.children.length === 0) return ['#root rendered empty — the app did not mount'];
  return [];
})()
`,

    '.squint/rules.md': `Build from the design tokens in src/index.css — never hardcode a color a token covers.
Keep every interactive element reachable by keyboard with a visible focus state.
`,
  }
}
