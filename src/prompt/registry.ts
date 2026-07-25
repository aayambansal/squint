import fs from 'node:fs'
import path from 'node:path'

/**
 * shadcn-registry awareness: when a repo uses components.json, tell the
 * engine which UI components are actually installed so it composes from
 * them instead of hallucinating lookalike primitives — and knows the
 * registry can install more.
 */
export interface ComponentInventory {
  components: string[]
  uiDir: string
}

export function loadComponentInventory(cwd: string): ComponentInventory | null {
  let config: { aliases?: { components?: string; ui?: string } }
  try {
    config = JSON.parse(fs.readFileSync(path.join(cwd, 'components.json'), 'utf8'))
  } catch {
    return null
  }
  // Resolve the conventional layout: alias "@/components" → src/components.
  const alias = config.aliases?.ui ?? (config.aliases?.components ? `${config.aliases.components}/ui` : '@/components/ui')
  const relative = alias.replace(/^@\//, 'src/').replace(/^~\//, '')
  const uiDir = path.join(cwd, relative)
  let entries: string[]
  try {
    entries = fs.readdirSync(uiDir)
  } catch {
    return null
  }
  const components = entries
    .filter((f) => /\.(tsx|jsx|vue|svelte)$/.test(f))
    .map((f) => f.replace(/\.[^.]+$/, ''))
    .sort()
  if (components.length === 0) return null
  return { components, uiDir: relative }
}

export function inventorySection(inventory: ComponentInventory): string {
  return `## Installed UI components (${inventory.uiDir})

${inventory.components.join(' · ')}

Compose from these before writing new primitives. More are one command away: \`npx shadcn@latest add <name>\`. Never invent props for these components — read the file when unsure.`
}
