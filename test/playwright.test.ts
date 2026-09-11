import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseFlow } from '../src/preview/flows.js'
import { exportFlows, flowToSpec, isSelectorLike, stepToPlaywright } from '../src/preview/playwright.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squint-pw-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('isSelectorLike', () => {
  it('mirrors the flow runner: CSS shapes and bare tags are selectors, prose is text', () => {
    for (const s of ['#email', '.cta', '[data-x]', 'nav a', 'button:first-child', 'input[type=submit]', 'button', 'summary']) {
      expect(isSelectorLike(s)).toBe(true)
    }
    for (const s of ['Sign up', 'Continue', 'Check your inbox', 'Get started free', 'Save changes']) {
      expect(isSelectorLike(s)).toBe(false)
    }
  })
})

describe('stepToPlaywright', () => {
  it('translates every verb with the runner semantics', () => {
    const flow = parseFlow(
      'signup',
      [
        'goto /pricing',
        'click Sign up',
        'click #plan-pro',
        'fill #email me@x.com',
        'press Enter',
        'expect Check your inbox',
        'shot after-signup',
        'hover .avatar',
        'hover Profile',
        'scroll bottom',
        'scroll #faq',
        'wait 250',
        'budget icp 400',
      ].join('\n'),
    )!
    const lines = flow.steps.map(stepToPlaywright)
    expect(lines).toEqual([
      'await page.goto("/pricing")',
      'await clickable(page, "Sign up").click()',
      'await page.locator("#plan-pro").click()',
      'await page.locator("#email").fill("me@x.com")',
      'await page.keyboard.press("Enter")',
      "await expect(page.locator('body')).toContainText(/Check your inbox/i)",
      'await page.screenshot({ path: test.info().outputPath("after-signup.png"), fullPage: true })',
      'await page.locator(".avatar").hover()',
      'await page.getByText(/Profile/i).first().hover()',
      'await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))',
      'await page.locator("#faq").scrollIntoViewIfNeeded()',
      'await page.waitForTimeout(250) // from the flow; prefer a web-first assertion on what you were waiting for',
      '// budget icp 400ms — a squint metric (soft-navigation ICP); keep it in the .flow, Playwright has no equivalent',
    ])
  })

  it('escapes regex metacharacters in expected text', () => {
    const step = parseFlow('x', 'expect Total: $12.50 (incl. tax)')!.steps[0]!
    expect(stepToPlaywright(step)).toBe("await expect(page.locator('body')).toContainText(/Total: \\$12\\.50 \\(incl\\. tax\\)/i)")
  })
})

describe('flowToSpec / exportFlows', () => {
  it('emits a self-contained spec, with the clickable helper only when text clicks exist', () => {
    const textClick = flowToSpec(parseFlow('signup', 'goto /\nclick Sign up\nexpect Welcome')!)
    expect(textClick).toContain("import { expect, test, type Page } from '@playwright/test'")
    expect(textClick).toContain('const clickable = (page: Page, text: string) =>')
    expect(textClick).toContain('test("signup", async ({ page }) => {')
    expect(textClick.endsWith('})\n')).toBe(true)

    const selectorOnly = flowToSpec(parseFlow('home', 'goto /\nclick #cta')!)
    expect(selectorOnly).toContain("import { expect, test } from '@playwright/test'")
    expect(selectorOnly).not.toContain('clickable')
  })

  it('writes one spec per flow, skips existing files unless forced', () => {
    const flows = path.join(dir, '.squint', 'flows')
    fs.mkdirSync(flows, { recursive: true })
    fs.writeFileSync(path.join(flows, 'home.flow'), 'goto /\nexpect Ready\nshot home\n')
    fs.writeFileSync(path.join(flows, 'signup.flow'), 'goto /signup\nfill #email a@b.co\nclick Sign up\nexpect Check your inbox\n')
    fs.writeFileSync(path.join(flows, 'broken.flow'), 'teleport /nowhere\n')

    const first = exportFlows(dir)
    expect(first.written).toEqual([path.join('tests', 'e2e', 'home.spec.ts'), path.join('tests', 'e2e', 'signup.spec.ts')])
    expect(first.skipped).toEqual([])
    const spec = fs.readFileSync(path.join(dir, 'tests', 'e2e', 'signup.spec.ts'), 'utf8')
    expect(spec).toContain('await page.locator("#email").fill("a@b.co")')
    expect(spec).toContain('await clickable(page, "Sign up").click()')

    fs.writeFileSync(path.join(dir, 'tests', 'e2e', 'home.spec.ts'), '// hand-edited\n')
    const second = exportFlows(dir)
    expect(second.written).toEqual([])
    expect(second.skipped).toEqual([path.join('tests', 'e2e', 'home.spec.ts'), path.join('tests', 'e2e', 'signup.spec.ts')])
    expect(fs.readFileSync(path.join(dir, 'tests', 'e2e', 'home.spec.ts'), 'utf8')).toBe('// hand-edited\n')

    const forced = exportFlows(dir, { force: true, dir: 'e2e' })
    expect(forced.written).toEqual([path.join('e2e', 'home.spec.ts'), path.join('e2e', 'signup.spec.ts')])
    expect(exportFlows(path.join(dir, 'nowhere'))).toEqual({ written: [], skipped: [] })
  })
})
