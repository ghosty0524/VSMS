import { describe, it, expect, vi, afterEach } from 'vitest'

// BASE_PATH 在模組載入時就算好，所以每個案例都重新載入模組。
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('basePath', () => {
  it('base 為 / 時（dev、vitest）前綴為空字串，路徑原樣', async () => {
    vi.stubEnv('BASE_URL', '/')
    const { BASE_PATH, withBase } = await import('../lib/basePath')
    expect(BASE_PATH).toBe('')
    expect(withBase('/api/me')).toBe('/api/me')
  })

  it('base 為 /vsms/ 時只對 / 開頭的站內路徑加前綴', async () => {
    vi.stubEnv('BASE_URL', '/vsms/')
    const { BASE_PATH, withBase } = await import('../lib/basePath')
    expect(BASE_PATH).toBe('/vsms')
    expect(withBase('/api/schedules')).toBe('/vsms/api/schedules')
    expect(withBase('https://other.example/x')).toBe('https://other.example/x')
    expect(withBase('relative/path')).toBe('relative/path')
  })
})
