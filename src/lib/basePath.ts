/// <reference types="vite/client" />
/**
 * 部署在路徑前綴底下（例如 https://host/vtms/）時，所有以 '/' 開頭的站內 URL
 * 都要加上前綴。Vite 在建置時把 base 寫進 import.meta.env.BASE_URL；
 * base 為 '/' 時 BASE_PATH 是空字串，行為與現在完全相同（vitest 也是這個情況）。
 */
export const BASE_PATH: string = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

/** '/api/x' → '/vtms/api/x'；非 '/' 開頭的字串原樣回傳。 */
export function withBase(p: string): string {
  return p.startsWith('/') ? BASE_PATH + p : p;
}
