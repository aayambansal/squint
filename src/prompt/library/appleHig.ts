import type { BundledSkill } from './types.js'

/**
 * Apple platform conventions, grounded in the Human Interface Guidelines.
 * Auto-attaches on iOS targets (React Native, Expo, Flutter, Capacitor,
 * Xcode projects); reachable by trigger from any web project that wants
 * to feel native on an iPhone.
 */
export const appleHig: BundledSkill = {
  name: 'apple-hig',
  summary: 'Apple HIG — iOS/iPadOS/macOS layout, navigation, controls, type, color, motion',
  triggers: [
    'ios',
    'iphone',
    'ipad',
    'ipados',
    'macos',
    'apple',
    'hig',
    'human interface',
    'swiftui',
    'uikit',
    'appkit',
    'cupertino',
    'sf symbols',
    'sf pro',
    'san francisco',
    'dynamic type',
    'safe area',
    'tab bar',
    'navigation bar',
    'sheet',
    'liquid glass',
    'visionos',
    'watchos',
    'app store',
  ],
  platforms: ['ios'],
  body: `# Apple platforms (Human Interface Guidelines)

Applies to iOS, iPadOS and macOS, and to web/PWA or cross-platform screens (React Native, Flutter, Capacitor) that should feel native on Apple devices. Names follow Apple's; map them to your framework (SafeAreaView, Cupertino widgets, \`env(safe-area-inset-*)\`).

Principles
- Content first, chrome defers: bars and controls are translucent and quiet, content is opaque and vivid. Depth carries hierarchy — sheets rise over content, popovers point at their source.
- System components before custom ones: they bring Dynamic Type, dark mode, Increase Contrast, Reduce Motion, VoiceOver, RTL and Liquid Glass for free. Customize appearance, never behavior.
- User settings are not optional: Dynamic Type up to accessibility sizes, Bold Text, Reduce Motion, Reduce Transparency, Increase Contrast, dark mode, locale and RTL.

Layout
- Safe areas are law: nothing interactive under the status bar, Dynamic Island or home indicator. Web: \`viewport-fit=cover\` plus \`env(safe-area-inset-*)\` padding. React Native: SafeAreaView / useSafeAreaInsets.
- Points, not pixels. 8pt grid; 16pt horizontal margins on iPhone (20pt on Max), 20–24pt on iPad. Readable width caps near 672pt on iPad — never stretch text edge to edge.
- Size classes: compact width (iPhone portrait) stacks; regular width (iPad, landscape) earns sidebar + detail (NavigationSplitView). Support landscape and iPad multitasking unless the app is deliberately portrait-only.
- Hit targets ≥ 44×44pt. Bars: navigation 44pt (large title 96pt), tab bar 49pt plus the home-indicator inset.

Navigation
- Tab bar for 3–5 peer destinations: bottom, SF Symbol + short label, never hidden on push. More than five means the information architecture needs work, not a "More" tab.
- Navigation stack: back button on the left inheriting the previous title, large titles that collapse on scroll. The edge swipe back always works — never intercept it.
- Sheets for scoped tasks: detents (.medium / .large), grabber, swipe to dismiss. Full-screen cover only for immersive or multi-step work. Popover on iPad, action sheet on iPhone for the same choice.
- Alerts are rare: title, one sentence, 2–3 actions, destructive in red, Cancel present whenever an action destroys. Never an alert to confirm success.
- Search lives in the navigation bar; filters are pull-down menus, not modal screens. Context menus on long press, swipe actions on rows, pull to refresh on lists — standard and expected.

Controls
- Buttons: filled for the single primary action, tinted or gray for secondary, plain text in bars. One prominent button per screen.
- Prefer system pickers, date pickers, steppers, switches (never a checkbox on iOS), segmented controls, sliders and menus. A custom control must reproduce every state and accessibility trait of the one it replaces.
- SF Symbols matched to the text's weight and scale; hierarchical or multicolor rendering used deliberately; one symbol per concept across the app. Tab bars and toolbars pair symbols with labels.
- Keyboard: correct keyboard type and return key, content scrolls above the keyboard, dismiss on scroll or tap outside.

Typography
- SF Pro (SF Compact on watchOS, New York for long-form reading). Text styles, not raw sizes: Large Title 34, Title 1 28, Title 2 22, Title 3 20, Headline 17 semibold, Body 17, Callout 16, Subheadline 15, Footnote 13, Caption 1 12, Caption 2 11. Minimum 11pt.
- Everything scales with Dynamic Type; at accessibility sizes horizontal layouts stack and text wraps — nothing essential truncates.
- Web: \`font-family: -apple-system, BlinkMacSystemFont, system-ui\`; \`font: -apple-system-body\` where supported. No all-caps tracked labels except grouped-list section headers.

Color and materials
- One app tint carries interactivity; semantic system colors carry the rest: label / secondaryLabel / tertiaryLabel, systemBackground / secondarySystemBackground (grouped variants for inset lists), separator, systemRed for destructive, systemGreen for success.
- Dark mode: base and elevated backgrounds (elevated is lighter), no shadows for depth, desaturated accents. Never a light screen with inverted values.
- Materials: bars, sheets and floating controls use system materials (ultraThin → thick) with vibrant text. On iOS 26+ Liquid Glass renders tab bars, toolbars and floating controls as glass that refracts the content beneath — keep that content legible, never stack glass on glass, let system components provide the glass, tint sparingly. On the web approximate with \`backdrop-filter: blur() saturate()\` and verify contrast over busy imagery.

Motion and feedback
- System springs (≈0.35s, small bounce) for presentation; matched-geometry transitions from a thumbnail to its detail. Reduce Motion → crossfade.
- Haptics are punctuation: selection for pickers, light impact for toggles, notification for outcomes. Never on scroll, never on every tap.
- Progress: indeterminate under 2s, a progress bar with Cancel beyond that, skeleton rows for lists. Never block the screen for a background sync.

Text and terminology
- Title Case for navigation titles, buttons and menu items; sentence case for body. "Tap", not "click". Done closes, Cancel discards, Save persists — no synonyms.
- Settings and lists: grouped inset style (10pt radius, 16pt insets), disclosure chevrons for pushes, toggles right-aligned, one-sentence footers.

macOS
- Menu bar with the standard menus (App, File, Edit, View, Window, Help); every command has a menu item and a shortcut (⌘N ⌘O ⌘S ⌘W ⌘, ⌘F ⌘Z ⇧⌘Z). Settings open at ⌘, in their own window — never an in-content settings page.
- Sidebar (source list) + content (+ inspector) with resizable splits; toolbar items with icon and label; windows remember size and position; hover states and tooltips; contextual menus on right-click; drag and drop from Finder.
- 13pt system text, 11pt secondary; sheets attach to their window, popovers anchor to their control. Do not port iOS patterns (tab bars, full-width buttons, bottom sheets) to the Mac.

App icon
- One centered glyph, no words, no photos, no transparency on iOS; layered artwork so Liquid Glass can light it. Check it at 29, 40, 60 and 1024pt.`,
  reviewChecklist: `- Apple targets: safe areas honored at the notch and home indicator; 44pt targets; Dynamic Type at the largest size; a native navigation pattern (no FAB, top tabs or hamburger unless deliberately cross-platform); dark mode as a real palette; RTL mirrored; edge-swipe back works; system fonts and semantic system colors.`,
}
