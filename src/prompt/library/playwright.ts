import type { BundledSkill } from './types.js'

/**
 * How to write end-to-end tests that stay green for the right reasons.
 * Attaches when an ask talks about e2e, Playwright, journeys or visual
 * regression; the e2e gate's fix prompt points back at the same rules.
 */
export const playwrightE2e: BundledSkill = {
  name: 'playwright-e2e',
  summary: 'Playwright — journeys worth testing, role locators, web-first assertions, config, visual regression',
  triggers: [
    'playwright',
    'e2e',
    'end-to-end',
    'end to end',
    'integration test',
    'browser test',
    'visual regression',
    'smoke test',
    'regression test',
    'user journey',
    'test the flow',
    'test the signup',
    'test the checkout',
    'test the login',
  ],
  body: `# Playwright end-to-end tests

What to test
- User journeys, not implementation: the flows in .squint/flows/ (\`squint flows export\` scaffolds them as specs), the critical paths (sign-in, create/edit/delete, checkout), the error states, and one keyboard-only path.
- One behaviour per test. Tests are independent, run in any order and in parallel, share no mutable state, and create whatever they need.

Locators
- Priority: getByRole(name) → getByLabel → getByPlaceholder → getByText → getByTestId. CSS or XPath only for things with no semantics — then fix the semantics instead of the selector.
- Role locators double as an accessibility check: if it cannot be found by role and name, a screen reader cannot find it either.
- Never select on styling classes, generated ids, or DOM position.

Waiting and assertions
- Web-first assertions only: \`expect(locator).toBeVisible()\`, \`toHaveText()\`, \`toHaveURL()\`, \`toContainText()\` retry until they pass. Never \`waitForTimeout\`; never assert on a value read once.
- \`expect.poll\` / \`toPass\` for eventually-consistent state; the timeout belongs on the assertion, not in a sleep.

Structure
- \`tests/e2e/*.spec.ts\`, one file per journey; \`test.step\` for readable reports; fixtures for setup (auth via storageState, seeded data); a page object only when three tests share the same interactions.
- \`playwright.config\`: baseURL; \`webServer\` with command, url and \`reuseExistingServer: !process.env.CI\`; \`trace: 'on-first-retry'\`; retries only in CI; \`forbidOnly: !!process.env.CI\`; projects for chromium plus one mobile device (\`devices['iPhone 14']\` or \`devices['Pixel 7']\`).
- Mock third parties with \`page.route\` (payments, analytics, email); never call real external services. Keep first-party APIs real unless the test is about the UI alone.

Visual regression
- \`expect(page).toHaveScreenshot()\` with \`animations: 'disabled'\`, a fixed viewport, masks over dynamic regions (clocks, avatars, ads) and a small non-zero \`maxDiffPixelRatio\`. Generate baselines in the CI container so fonts and antialiasing match.

Accessibility
- \`@axe-core/playwright\` on each key page with the wcag2a / wcag2aa tags, failing on violations; assert focus order and that Escape and Enter behave on dialogs.

When a test fails
- Fix the app before the test. Change a test only when the requirement it encodes changed — and say so. Never widen a timeout, add a sleep, or mark \`.skip\` to get green.
- Read the trace (\`npx playwright show-trace\`) before guessing: the failing step, the DOM at that moment, the network.
- Missing browsers → \`npx playwright install --with-deps chromium\`. Connection refused → configure \`webServer\` or start the dev server.`,
}
