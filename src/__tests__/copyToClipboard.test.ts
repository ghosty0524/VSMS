import { describe, it, expect, afterEach, vi } from 'vitest'
import { copyTableToClipboard } from '../lib/copyToClipboard'

const TSV = '狀態\t工作類別\nCompleted\tNPI'
const HTML = '<table><tbody><tr><td>Completed</td></tr></tbody></table>'

// 每個測試都要在結束後把自己 stub 上去的 navigator.clipboard / ClipboardItem /
// document.execCommand 復原，避免互相污染下一個測試（尤其是「entirely undefined」
// 那個案例，必須確保上一個測試留下的 clipboard 物件不會殘留）。
const originalClipboard = navigator.clipboard
const originalClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem
const originalExecCommand = document.execCommand

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: originalClipboard, configurable: true, writable: true,
  })
  ;(globalThis as { ClipboardItem?: unknown }).ClipboardItem = originalClipboardItem
  document.execCommand = originalExecCommand
  vi.restoreAllMocks()
})

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value, configurable: true, writable: true,
  })
}

describe('copyTableToClipboard', () => {
  it('navigator.clipboard.write 存在時優先使用（第一層），同時放上 text/plain 與 text/html', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ write, writeText })
    ;(globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
    }

    const ok = await copyTableToClipboard(TSV, HTML)

    expect(ok).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('只有 navigator.clipboard.writeText（沒有 write）時使用第二層', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })

    const ok = await copyTableToClipboard(TSV, HTML)

    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(TSV)
  })

  it('navigator.clipboard.write 失敗（reject）時退回 writeText（第二層）', async () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ write, writeText })
    ;(globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
    }

    const ok = await copyTableToClipboard(TSV, HTML)

    expect(ok).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  it('navigator.clipboard 整個不存在（非安全來源）時退回 document.execCommand（第三層）', async () => {
    stubClipboard(undefined)
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand as typeof document.execCommand

    const ok = await copyTableToClipboard(TSV, HTML)

    expect(ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('navigator.clipboard.writeText 也失敗時退回第三層', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard({ writeText })
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand as typeof document.execCommand

    const ok = await copyTableToClipboard(TSV, HTML)

    expect(ok).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('document.execCommand 回傳 false 時整體回報失敗', async () => {
    stubClipboard(undefined)
    const execCommand = vi.fn().mockReturnValue(false)
    document.execCommand = execCommand as typeof document.execCommand

    const ok = await copyTableToClipboard(TSV, HTML)

    expect(ok).toBe(false)
  })

  it('document.execCommand 本身不存在（極端環境）時回報失敗而非拋錯', async () => {
    stubClipboard(undefined)
    document.execCommand = undefined as unknown as typeof document.execCommand

    await expect(copyTableToClipboard(TSV, HTML)).resolves.toBe(false)
  })

  it('第三層成功時，離屏元素會從 DOM 移除，不留下殘影', async () => {
    stubClipboard(undefined)
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand as typeof document.execCommand

    const before = document.body.children.length
    await copyTableToClipboard(TSV, HTML)
    expect(document.body.children.length).toBe(before)
  })

  it('第三層失敗（execCommand 回傳 false）時，離屏元素仍會被移除', async () => {
    stubClipboard(undefined)
    const execCommand = vi.fn().mockReturnValue(false)
    document.execCommand = execCommand as typeof document.execCommand

    const before = document.body.children.length
    await copyTableToClipboard(TSV, HTML)
    expect(document.body.children.length).toBe(before)
  })

  it('第一、二層路徑不會留下任何離屏元素', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ write })
    ;(globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      constructor(public items: Record<string, Blob>) {}
    }

    const before = document.body.children.length
    await copyTableToClipboard(TSV, HTML)
    expect(document.body.children.length).toBe(before)
  })

  it('第三層會還原使用者原本的選取範圍', async () => {
    stubClipboard(undefined)
    document.execCommand = vi.fn().mockReturnValue(true) as unknown as typeof document.execCommand

    // 建立一段使用者原本就選取好的內容
    const marker = document.createElement('p')
    marker.textContent = 'user selection'
    document.body.appendChild(marker)
    const range = document.createRange()
    range.selectNodeContents(marker)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    await copyTableToClipboard(TSV, HTML)

    expect(selection?.toString()).toBe('user selection')
    marker.remove()
  })
})
