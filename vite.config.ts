import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
  // 部署在路徑前綴底下時由 .env.production 的 BASE_PATH 指定（例如 /vsms/），
  // 只有 vite build 會載入它，dev server 與 vitest 的 base 仍是 '/'。
  const envVars = loadEnv(mode, process.cwd(), '')
  return {
  base: envVars.BASE_PATH?.trim() || '/',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    proxy: {
      '/api': {
        // 預設指向常駐的正式後端（pm2, 3001，HTTPS）。上線前想用新版前端搭配尚未部署的
        // 新版後端實測時，另起一個後端（PORT=3002 npx tsx watch server/src/index.ts）
        // 再以 VSMS_API_TARGET=https://localhost:3002 npm run dev:client 啟動即可，
        // 全程不動 dist 與 pm2。此設定僅作用於 dev server，不影響正式建置。
        target: process.env.VSMS_API_TARGET ?? 'https://localhost:3001',
        changeOrigin: true,
        // 後端用的是內部自簽憑證，dev proxy 預設會拒絕，必須關掉驗證。
        secure: false,
      },
    },
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
}
})
