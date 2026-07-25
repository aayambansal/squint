/**
 * The squint tagger, shipped as a self-contained Vite plugin file the
 * user commits to their repo (no dependency on squint being installed).
 * lovable-tagger's mechanism, distilled: alias react/jsx-dev-runtime,
 * stamp every host element's DOM node with its JSX source location,
 * and inject a picker overlay — Alt+S, click an element, get
 * "file:line:col" on the clipboard to paste into squint.
 */
export const TAGGER_FILENAME = 'squint-tagger.mjs'

export const TAGGER_SOURCE = `// squint element tagger — dev-only Vite plugin.
// Alt+S in the browser toggles the picker; clicking an element copies
// its JSX source location (file:line:col) to paste into squint.
const VIRTUAL_ID = '\\0squint-jsx-dev-runtime'

export default function squintTagger() {
  let actualRuntime = null
  return {
    name: 'squint-tagger',
    apply: 'serve',
    enforce: 'pre',

    async resolveId(id, importer) {
      if (id === 'react/jsx-dev-runtime') {
        const resolved = await this.resolve(id, importer, { skipSelf: true })
        if (!resolved) return null
        actualRuntime = resolved.id
        return VIRTUAL_ID
      }
      return null
    },

    load(id) {
      if (id !== VIRTUAL_ID || !actualRuntime) return null
      return [
        'import * as runtime from ' + JSON.stringify(actualRuntime) + ';',
        'export const Fragment = runtime.Fragment;',
        'export const jsxDEV = (type, props, key, isStatic, source, self) => {',
        '  if (source && props && typeof type === "string") {',
        '    const info = { file: source.fileName, line: source.lineNumber, col: source.columnNumber, tag: type };',
        '    const prevRef = props.ref;',
        '    props = { ...props, ref: (node) => {',
        '      if (node && node.nodeType === 1) node.__squintSource = info;',
        '      if (typeof prevRef === "function") return prevRef(node);',
        '      if (prevRef && typeof prevRef === "object") prevRef.current = node;',
        '    } };',
        '  }',
        '  return runtime.jsxDEV(type, props, key, isStatic, source, self);',
        '};',
      ].join('\\n')
    },

    // NOTE: jsxDEV line numbers reflect the transformed module (dev
    // preambles shift them), so the picker treats them as approximate
    // and copies tag + class list + text alongside — self-locating for
    // any agent regardless of build pipeline.

    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module' }, children: PICKER, injectTo: 'body' }]
    },
  }
}

const PICKER = \`(() => {
  if (window.__squintPicker) return; window.__squintPicker = true;
  let active = false;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #e8a33d;background:rgba(232,163,61,.08);display:none;font:12px ui-monospace,monospace;';
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;z-index:2147483647;background:#1b1b1b;color:#fff;padding:4px 8px;border-radius:3px;font:12px ui-monospace,monospace;display:none;pointer-events:none;max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  document.documentElement.append(box, tip);
  const find = (el) => { while (el && el !== document.body) { if (el.__squintSource) return el; el = el.parentElement; } return null; };
  const rel = (file) => file.replace(location.origin, '').replace(/^.*?\\\\/(src\\\\/)/, '$1');
  const describe = (el) => {
    const s = el.__squintSource;
    const cls = (el.getAttribute('class') || '').trim();
    const text = (el.textContent || '').trim().replace(/\\\\s+/g, ' ').slice(0, 40);
    return rel(s.file) + ' <' + s.tag + (cls ? ' class="' + cls + '"' : '') + '>' + (text ? ' "' + text + '"' : '');
  };
  const toast = (text) => {
    tip.textContent = text; tip.style.display = 'block';
    tip.style.left = '12px'; tip.style.top = '12px';
    setTimeout(() => { if (!active) tip.style.display = 'none'; }, 2200);
  };
  addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      active = !active;
      if (!active) { box.style.display = 'none'; tip.style.display = 'none'; }
      else toast('squint picker on — click an element (esc to cancel)');
    } else if (e.key === 'Escape' && active) {
      active = false; box.style.display = 'none'; tip.style.display = 'none';
    }
  });
  addEventListener('mousemove', (e) => {
    if (!active) return;
    const el = find(e.target); if (!el) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect(); const s = el.__squintSource;
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    tip.style.display = 'block';
    tip.style.left = Math.min(r.left, innerWidth - 340) + 'px';
    tip.style.top = Math.max(r.top - 26, 2) + 'px';
    tip.textContent = '<' + s.tag + '> ' + rel(s.file);
  }, true);
  addEventListener('click', (e) => {
    if (!active) return;
    e.preventDefault(); e.stopPropagation();
    const el = find(e.target); if (!el) return;
    const ref = describe(el);
    window.__squintLastPick = ref;
    const done = () => toast('copied — paste into squint: ' + ref);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(ref).then(done, done);
    else done();
    active = false; box.style.display = 'none';
  }, true);
})();\`
`

/**
 * Wire the tagger into a vite config: add the import and the plugin
 * call. Returns the patched source, or null when the config shape
 * isn't recognized (caller prints manual instructions).
 */
export function patchViteConfig(source: string): string | 'already' | null {
  if (source.includes('squint-tagger') || source.includes('squintTagger')) return 'already'
  const pluginsMatch = /plugins:\s*\[/.exec(source)
  if (!pluginsMatch) return null
  const withPlugin =
    source.slice(0, pluginsMatch.index) +
    pluginsMatch[0].replace('[', '[squintTagger(), ') +
    source.slice(pluginsMatch.index + pluginsMatch[0].length)
  return `import squintTagger from './${TAGGER_FILENAME}'\n${withPlugin}`
}
