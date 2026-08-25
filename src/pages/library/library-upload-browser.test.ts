import { describe, expect, it } from 'vitest'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

const playwrightModule = process.env.FEFIGMA_LIBRARY_PLAYWRIGHT_MODULE
const browserUrl = process.env.FEFIGMA_LIBRARY_BROWSER_URL

type UploadProbe = {
  readonly fetchCalls: number
  readonly fileReaderCalls: number
  readonly arrayBufferCalls: number
  readonly submitEvents: number
}

declare global {
  interface Window {
    readonly __libraryUploadProbe: UploadProbe
  }
}

describe('LibraryPage closed upload browser boundary', () => {
  it.skipIf(!playwrightModule || !browserUrl)('keeps the disabled upload surface inert in production', async () => {
    if (!playwrightModule || !browserUrl) {
      throw new Error('FEFIGMA_LIBRARY_PLAYWRIGHT_MODULE and FEFIGMA_LIBRARY_BROWSER_URL are required for this browser test.')
    }

    const { chromium } = await import(playwrightModule)
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } })

    await page.addInitScript(() => {
      const probe = { fetchCalls: 0, fileReaderCalls: 0, arrayBufferCalls: 0, submitEvents: 0 }
      Object.defineProperty(window, '__libraryUploadProbe', { configurable: true, value: probe })

      const nativeFetch = window.fetch
      window.fetch = (...args) => {
        probe.fetchCalls += 1
        return nativeFetch.apply(window, args)
      }

      const NativeFileReader = window.FileReader
      Object.defineProperty(window, 'FileReader', {
        configurable: true,
        writable: true,
        value: class extends NativeFileReader {
          constructor() {
            super()
            probe.fileReaderCalls += 1
          }
        },
      })

      const nativeArrayBuffer = Blob.prototype.arrayBuffer
      Blob.prototype.arrayBuffer = function () {
        probe.arrayBufferCalls += 1
        return nativeArrayBuffer.call(this)
      }

      window.addEventListener('submit', () => {
        probe.submitEvents += 1
      }, true)
    })

    try {
      await page.goto(browserUrl, { waitUntil: 'networkidle' })

      const uploadSurface = page.locator('.library-upload-card')
      const fileInput = page.locator('#library-pdf-file')
      const uploadButton = page.getByRole('button', { name: '업로드', exact: true })
      const dropzone = page.locator('.library-file-dropzone')
      const uploadLabel = page.locator('label[for="library-pdf-file"]')
      const boundaryCopy = page.locator('.library-upload-boundary')

      expect(await fileInput.isDisabled()).toBe(true)
      expect(await uploadButton.isDisabled()).toBe(true)
      expect(await page.locator('form.library-upload-card').count()).toBe(0)
      expect(await boundaryCopy.textContent()).toBe('업로드와 실제 API 연결은 아직 열려 있지 않습니다.')

      const layout = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>(
          '.library-file-dropzone, .library-upload-button, .library-demo-controls summary, .library-pagination .button',
        ))
        return {
          viewportWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          controlHeights: controls.map((control) => control.getBoundingClientRect().height),
        }
      })
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.controlHeights.every((height: number) => height >= 44)).toBe(true)

      const initialProbe = await page.evaluate(() => window.__libraryUploadProbe)
      let actionRequests = 0
      page.on('request', () => { actionRequests += 1 })

      let fileChooserOpened = false
      page.on('filechooser', () => { fileChooserOpened = true })
      await uploadLabel.evaluate((element: HTMLLabelElement) => element.click())
      await page.waitForTimeout(100)
      expect(fileChooserOpened).toBe(false)

      const changeWasPrevented = await fileInput.evaluate((element: HTMLInputElement) => {
        const event = new Event('change', { bubbles: true, cancelable: true })
        element.dispatchEvent(event)
        return event.defaultPrevented
      })
      const dropWasPrevented = await dropzone.evaluate((element: HTMLElement) => {
        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        })
        element.dispatchEvent(event)
        return event.defaultPrevented
      })
      const submitWasPrevented = await uploadSurface.evaluate((element: HTMLElement) => {
        const event = new Event('submit', { bubbles: true, cancelable: true })
        element.dispatchEvent(event)
        return event.defaultPrevented
      })

      const finalProbe = await page.evaluate(() => window.__libraryUploadProbe)
      expect(changeWasPrevented).toBe(false)
      expect(dropWasPrevented).toBe(false)
      expect(submitWasPrevented).toBe(false)
      expect(actionRequests).toBe(0)
      expect(finalProbe.fetchCalls).toBe(initialProbe.fetchCalls)
      expect(finalProbe.fileReaderCalls).toBe(initialProbe.fileReaderCalls)
      expect(finalProbe.arrayBufferCalls).toBe(initialProbe.arrayBufferCalls)
      expect(finalProbe.submitEvents).toBe(initialProbe.submitEvents + 1)
      expect(await fileInput.isDisabled()).toBe(true)
      expect(await uploadButton.isDisabled()).toBe(true)
      expect(await boundaryCopy.textContent()).toBe('업로드와 실제 API 연결은 아직 열려 있지 않습니다.')
      expect(await uploadSurface.locator('[role="alert"]').count()).toBe(0)
      expect(await uploadSurface.locator('.library-upload-message').count()).toBe(0)
    } finally {
      await browser.close()
    }
  })
})
