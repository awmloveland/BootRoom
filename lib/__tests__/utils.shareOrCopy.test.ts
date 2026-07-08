/**
 * @jest-environment jsdom
 */
import { shareOrCopy } from '../utils'

function setInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
}

function setNavigatorShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, 'share', { value: fn, configurable: true })
}

function setClipboardWriteText(fn: (text: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: fn },
    configurable: true,
  })
}

describe('shareOrCopy', () => {
  afterEach(() => {
    setNavigatorShare(undefined)
  })

  it('copies to clipboard on desktop widths even when navigator.share exists', async () => {
    setInnerWidth(1024)
    const share = jest.fn().mockResolvedValue(undefined)
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(share).not.toHaveBeenCalled()
  })

  it('uses the native share sheet on small screens', async () => {
    setInnerWidth(390)
    const share = jest.fn().mockResolvedValue(undefined)
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hello' })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('returns failed when the user dismisses the share sheet (AbortError)', async () => {
    setInnerWidth(390)
    const share = jest.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('failed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when the share sheet errors (non-abort)', async () => {
    setInnerWidth(390)
    const share = jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('copies on small screens when navigator.share is unavailable', async () => {
    setInnerWidth(390)
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNavigatorShare(undefined)
    setClipboardWriteText(writeText)

    await expect(shareOrCopy('hello')).resolves.toBe('copied')
  })

  it('returns failed when the clipboard write rejects', async () => {
    setInnerWidth(1024)
    setNavigatorShare(undefined)
    setClipboardWriteText(jest.fn().mockRejectedValue(new Error('no clipboard')))

    await expect(shareOrCopy('hello')).resolves.toBe('failed')
  })
})
