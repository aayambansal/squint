import type { BundledSkill } from './types.js'

/**
 * Desktop conventions for Electron, Tauri and native shells: the things
 * that make a window feel like an app rather than a web page in a frame.
 * Auto-attaches when the repo targets the desktop.
 */
export const desktopApp: BundledSkill = {
  name: 'desktop-app',
  summary: 'Electron/Tauri/native desktop — menus, shortcuts, windows, density, per-OS chrome',
  triggers: [
    'electron',
    'tauri',
    'desktop app',
    'menu bar',
    'menubar',
    'title bar',
    'titlebar',
    'tray',
    'keyboard shortcut',
    'shortcuts',
    'command palette',
    'sidebar',
    'native app',
    'wails',
    'neutralino',
    'windows 11',
    'fluent',
  ],
  platforms: ['desktop'],
  body: `# Desktop apps (Electron, Tauri, native)

Feel native on each OS
- macOS: menu bar with the standard menus (App, File, Edit, View, Window, Help), ⌘ shortcuts, ⌘, for Settings, traffic lights top-left (a hidden-inset title bar leaves ~78px clear), sidebar + content + inspector, 13px system text, translucent sidebar material, thin overlay scrollbars, \`cursor: default\` on buttons.
- Windows: in-window menu or command bar (no Mac-style menu bar), Ctrl shortcuts, window controls top-right, Segoe UI Variable at 14px, 4–8px corner radius, the system accent color, Mica/Acrylic sparingly, snap layouts, 125/150/200% scaling verified.
- Linux: respect the system theme and font, native title bar unless there is a strong reason, XDG base directories.
- Everywhere: follow the OS light/dark theme and accent live (\`prefers-color-scheme\`, nativeTheme), reduced motion and reduced transparency, system file dialogs, native context menus, system notifications, drag and drop from the file manager.

Structure and density
- An app layout, not a web page: no hero, no marketing whitespace, no footer. Persistent sidebar or rail, content area, optional inspector; resizable panes with minimum widths, remembered across launches together with window size and position.
- Desktop density: 28–32px rows, 8px grid, 13–14px UI text, hover states and tooltips everywhere (pointer users), cursor changes only where the OS would (text, grab, resize).
- Multiple windows when tasks are independent; one window with tabs or panes when they are not. Reopen the last document or view.

Keyboard first
- Every action has a shortcut following platform conventions (⌘/Ctrl + N O S W Q F Z, ⇧⌘Z / Ctrl+Y, ⌘, / Ctrl+, for settings); shortcuts show in menus and tooltips; a command palette (⌘K / Ctrl+K or ⇧⌘P) exposes everything searchable.
- Full Tab traversal, arrow keys inside lists and trees, type-ahead selection, Enter confirms the default action, Escape closes or cancels, focus ring always visible.

Web-tech hygiene (Electron, Tauri)
- \`user-select: none\` on chrome, selectable in content; no pinch zoom; no rubber-band overscroll; no link cursors on controls.
- Under one second to the first interactive frame (a skeleton, not a splash); heavy work off the UI thread; a minimal, validated IPC surface; auto-update prompts that never block, with "Restart later".
- \`-webkit-app-region: drag\` on custom title bars with \`no-drag\` on controls; native window buttons keep working; double-clicking the title bar zooms on macOS.
- Offline by default: local state first, sync in the background, conflicts surfaced instead of silently overwritten.

Accessibility
- Screen-reader names for every control (VoiceOver, NVDA), focus management across panes and dialogs, Windows high-contrast themes, zoom without breakage.`,
  reviewChecklist: `- Desktop targets: menus complete with shortcuts; window state persisted; title bar correct per OS; theme follows the OS; desktop density and hover states; no web-page look; a keyboard-only walkthrough is clean.`,
}
