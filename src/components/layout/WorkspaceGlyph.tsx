/**
 * Validation Workspace 標誌圖形（2026-09-30 定案「四格拼塊」：一個入口裝多個系統，右下實心那格＝入口）。
 * 取代原本的 lucide Check。顏色吃 currentColor，底色方塊由呼叫端決定。
 * 入口頁、VTMS、VSMS 各有一份一模一樣的檔案，改圖形要三邊同步。
 */
export function WorkspaceGlyph({ size }: { size: number }) {
  return (
    <svg
      data-glyph="workspace"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
