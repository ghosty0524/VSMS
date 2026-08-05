// server/src/lib/buildVersion.ts
import fs from 'node:fs'
import path from 'node:path'

/**
 * 回傳目前正在服務的 dist/index.html 版本標記——用它的 mtime（ms）即可，
 * 不需要 hash：只要 index.html 變了，任何在那之前載入的分頁就是 stale，
 * 這正是我們要偵測的條件。
 *
 * distPath 為空字串（dev 環境，前端由 vite 另外服務，不是 express.static）
 * 或讀檔失敗時，回傳穩定哨兵值 0，讓前端輪詢邏輯的第一次觀察永遠記錄到同一個
 * 值、後續也不會被誤判為「版本改變」。
 */
export function getBuildVersion(distPath: string): number {
  if (!distPath) return 0
  try {
    return fs.statSync(path.join(distPath, 'index.html')).mtimeMs
  } catch {
    return 0
  }
}
