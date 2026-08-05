// server/src/__tests__/buildVersion.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getBuildVersion } from '../lib/buildVersion.js'

describe('getBuildVersion', () => {
  it('distPath 為空字串時回傳穩定哨兵值 0（dev 環境沒有 dist，vite 另外服務前端）', () => {
    expect(getBuildVersion('')).toBe(0)
  })

  it('回傳 dist/index.html 的 mtime（ms）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsms-build-'))
    const file = path.join(dir, 'index.html')
    fs.writeFileSync(file, '<html></html>')
    const expected = fs.statSync(file).mtimeMs

    expect(getBuildVersion(dir)).toBe(expected)
  })

  it('index.html 不存在（讀取失敗）時回傳穩定哨兵值 0', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsms-build-missing-'))

    expect(getBuildVersion(dir)).toBe(0)
  })
})
