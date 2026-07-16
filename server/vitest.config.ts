import { defineConfig } from 'vitest/config'
import { defaultExclude } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // 只跑後端測試：前端測試（src/__tests__）需要 jsdom，在 node 環境會誤判失敗
    include: ['server/src/__tests__/**/*.test.ts'],
    // server/dist 是 tsc 編譯輸出，裡面的 *.test.js 是 src 測試的舊快照，
    // 一起跑會讓每個測試執行兩次、且過期快照可能誤導結果
    exclude: [...defaultExclude, '**/dist/**'],
  },
})