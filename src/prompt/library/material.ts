import type { BundledSkill } from './types.js'

/**
 * Android conventions, grounded in Material 3. Auto-attaches on Android
 * targets (React Native, Expo, Flutter, Capacitor, Gradle projects);
 * reachable by trigger from any web project.
 */
export const materialAndroid: BundledSkill = {
  name: 'material-android',
  summary: 'Material 3 — Android layout, navigation, components, color roles, type roles, motion',
  triggers: [
    'android',
    'material',
    'material 3',
    'material you',
    'm3',
    'jetpack compose',
    'compose',
    'kotlin',
    'flutter',
    'fab',
    'snackbar',
    'bottom sheet',
    'navigation drawer',
    'navigation rail',
    'dynamic color',
    'roboto',
    'play store',
    'talkback',
  ],
  platforms: ['android'],
  body: `# Android (Material 3)

Applies to Android apps (Jetpack Compose, Flutter Material, React Native, Capacitor) and to web screens that should feel native on Android. Material 3 is the reference; names follow it.

Principles
- Adaptive by default: layouts respond to window size class, orientation, foldable posture and font scale. Personal by default: dynamic color from the user's wallpaper when the platform offers it.
- Material components, customized through the theme (color roles, type roles, shape scale) — never by restyling individual widgets.
- Respect system settings: font scale to 200%, display size, dark theme, "Remove animations", TalkBack, RTL.

Layout
- 8dp grid (4dp for icon and type alignment). Margins 16dp on compact, 24dp on medium and expanded. Touch targets ≥ 48×48dp with ≥ 8dp between them.
- Window size classes choose the navigation: compact (< 600dp) → navigation bar; medium (600–839dp) → navigation rail; expanded (≥ 840dp) → drawer or permanent rail with a list-detail or supporting-pane layout. Never stretch a phone layout across a tablet.
- Edge-to-edge: content draws behind translucent status and navigation bars; WindowInsets padding goes on scrolling content and floating elements. Support predictive back.

Navigation
- Navigation bar: 3–5 destinations, icon + label always, active pill indicator, no actions inside it. Top app bar (small / center-aligned / medium / large) holds the title, navigation icon and up to three actions; the rest go to the overflow menu.
- The FAB is the single primary action of a screen (extended with a label on larger widths); most screens have none. Never "Save" or "Submit" in a FAB.
- Tabs for sibling content inside a destination (scrollable beyond four). Drawer for large destination sets or expanded widths.
- Modal bottom sheet with drag handle for scoped choices; standard bottom sheet for persistent supplementary content. Dialogs for decisions that must be answered (title, supporting text, 1–2 text buttons, confirming action on the right). Full-screen dialog for multi-field entry.
- Snackbar for brief, non-critical feedback with at most one action — never for errors the user must act on. Toasts are legacy.

Components
- Buttons by emphasis: filled (one primary per screen) → filled tonal → elevated → outlined → text. Icon buttons in standard / filled / tonal / outlined variants, 40dp container. Segmented buttons for 2–5 options.
- Cards: elevated, filled or outlined — one style per surface, no cards inside cards, 12dp corners.
- Text fields: filled or outlined (consistent per form), floating label, supporting text below, error state with error color + icon + message, trailing icon for clear or visibility.
- Lists: one-, two- or three-line items with leading avatar/icon and trailing meta; dividers only when items are dense. Chips (assist / filter / input / suggestion) are not buttons.
- Switches (M3, checkmark thumb) for settings, checkboxes for multi-select in forms, radio buttons for exclusive choice; determinate progress whenever the total is known; badges on navigation items for counts.

Color
- Seed color → tonal palettes (primary, secondary, tertiary, neutral, neutral variant, error) → roles. Reference roles only: primary / onPrimary / primaryContainer / onPrimaryContainer, secondary…, surface / surfaceContainerLowest…Highest / surfaceVariant, outline / outlineVariant, inverseSurface, error / onError.
- Elevation is tonal: higher surfaces use higher surfaceContainer tiers; shadows only on floating elements (FAB, menus, dialogs).
- Dark theme: primary at tone 80, surfaces desaturated from the neutral palette (no pure black by default), containers lighter with elevation. Every on-* pair meets 4.5:1 (3:1 for large text and icons).
- State layers: hover 8%, focus 10%, pressed 10%, dragged 16% of the on-color over the container — never a hard-coded "pressed gray".

Typography
- Type roles, not sizes: display L/M/S 57/45/36, headline 32/28/24, title 22/16/14, body 16/14/12, label 14/12/11 (sp). Roboto / Roboto Flex by default; a brand face maps onto the same roles.
- sp units everywhere so font scale works; layouts wrap rather than truncate at 200%.
- Sentence case for all text, buttons and titles included. All-caps buttons are Material 2 and read as dated.

Shape and motion
- Shape scale: extra-small 4, small 8, medium 12, large 16, extra-large 28, full. Consistent per family: cards 12, bottom sheets and dialogs 28, FAB 16, buttons full.
- Easing tokens: emphasized for large or state-changing transitions, emphasized-decelerate entering, emphasized-accelerate exiting, standard for small utility motion. Durations: short 50–200ms, medium 250–400ms, long 450–600ms, extra-long 700–1000ms.
- Patterns: container transform (card → detail), shared axis (siblings, steps), fade-through (unrelated destinations), fade (dialogs, menus). Respect "Remove animations".

Icons
- Material Symbols in one style (outlined / rounded / sharp) for the whole app, weight 400, 24dp optical size, filled for the active navigation item. No mixed icon sets.

Accessibility
- Every actionable element has a contentDescription / semantics label; decorative images are null-labelled. Focus order follows reading order; live regions announce async results; status is never color alone.
- 48dp targets, 4.5:1 text contrast, 200% font scale, a TalkBack walkthrough before done.

Cross-platform sanity
- No iOS artifacts on Android: no disclosure chevrons, no iOS switches, no Title Case. Flutter: Material on Android and Cupertino (or adaptive constructors) on iOS. React Native: Platform.select for the pieces that diverge.`,
  reviewChecklist: `- Android targets: navigation component matches the window size class; at most one FAB and it is the primary action; 48dp targets with spacing; color roles instead of hex; edge-to-edge with insets handled; sentence case; dynamic color and dark theme verified; predictive back and 200% font scale work.`,
}
