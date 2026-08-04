import { defineConfig, defaultExclude } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    // 只跑前端測試。未設 include 時 vitest 會掃到整個專案，因而收進三類不該跑的檔案：
    //   1. server/dist（tsc 編譯輸出）裡的 *.test.js —— src 測試的過期快照，會讓同一個測試
    //      跑兩次，且過期版本可能與現行原始碼結果不符而誤導判斷
    //   2. dist.stable-* / server/dist.stable-*（退版快照）裡的同類編譯產物
    //   3. .claude/worktrees 底下其他工作區的測試
    // server/vitest.config.ts 早已排除第 1 類，此處補齊同樣的防護。
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: [...defaultExclude, '**/dist/**', '**/dist.stable-*/**', '.claude/**'],
  },
})
