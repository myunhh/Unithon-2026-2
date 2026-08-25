import { describe, expect, it } from 'vitest'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

const playwrightModule = process.env.FE018_PLAYWRIGHT_MODULE
const browserUrl = process.env.FE018_BROWSER_URL

describe('AccountPage device-session browser behavior', () => {
  it.skipIf(!playwrightModule || !browserUrl)('opens a modal and keeps Tab inside its controls', async () => {
    const { chromium } = await import(playwrightModule!)
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })

    try {
      await page.goto(browserUrl!, { waitUntil: 'networkidle' })
      const trigger = page.getByRole('button', { name: '개인 MacBook Air 연결 해제 확인', exact: true })
      await trigger.click()

      const dialog = page.locator('dialog.account-session-dialog')
      await dialog.waitFor({ state: 'visible' })
      expect(await dialog.evaluate((element: HTMLDialogElement) => ({ open: element.open, modal: element.matches(':modal') }))).toEqual({ open: true, modal: true })

      const focusState = () => page.evaluate(() => ({
        text: document.activeElement?.textContent,
        insideDialog: document.activeElement?.closest('dialog') !== null,
      }))
      expect(await focusState()).toEqual({ text: '연결 해제 확인', insideDialog: true })
      await page.keyboard.press('Tab')
      expect(await focusState()).toEqual({ text: '취소', insideDialog: true })
      await page.keyboard.press('Tab')
      expect(await focusState()).toEqual({ text: '연결 해제 확인', insideDialog: true })
      await page.keyboard.press('Shift+Tab')
      expect(await focusState()).toEqual({ text: '취소', insideDialog: true })

      await page.keyboard.press('Escape')
      expect(await dialog.isVisible()).toBe(false)
      expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('개인 MacBook Air 연결 해제 확인')
    } finally {
      await browser.close()
    }
  })
})
