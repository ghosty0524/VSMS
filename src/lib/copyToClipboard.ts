// src/lib/copyToClipboard.ts
// 三層式複製剪貼簿：安全來源（HTTPS／localhost）用 Clipboard API，非安全來源
// （純 HTTP，例如同仁實際存取的 http://172.16.204.69:3001）退回
// document.execCommand('copy')，確保「同時放上 text/plain 與 text/html」
// 這個需求（貼到 Excel 是欄位、貼到 Word 是表格）在 HTTP 環境下依然成立，
// 而不是整支 Clipboard API 都不存在就直接失敗。
//
// navigator.clipboard 在非安全來源下整個不存在（不是被拒絕，是 undefined），
// 對它解參考會直接拋錯而不是進入 catch 分支，這正是原本 bug 的成因，
// 因此每一層呼叫前都先用 optional chaining／型別檢查確認 API 存在。
//
// 三層依序嘗試，前一層不可用或失敗才會試下一層：
//   1. navigator.clipboard.write + ClipboardItem（text/plain + text/html）—— 安全來源的標準路徑
//   2. navigator.clipboard.writeText（只有 TSV）—— write 存在但因故失敗時的退回
//   3. document.execCommand('copy')（選取一個離屏 DOM 表格後複製）—— navigator.clipboard
//      整個不存在時（非安全來源）的退回；瀏覽器會從 DOM 選取範圍同時衍生出
//      text/html 與 text/plain 兩種格式，因此貼上體驗與第 1 層等價，不會退化成純文字。

/**
 * 把 TSV（text/plain）與 HTML 表格（text/html）兩種表示法寫入剪貼簿。
 *
 * @param tsv  純文字表格，供 Excel／Google 試算表貼上時還原成欄位。
 * @param html HTML `<table>`，供 Word／Outlook／Google Docs 貼上時還原成真正的表格。
 * @returns 任一層成功即為 true；三層都不可用或都失敗則為 false，呼叫端應顯示錯誤提示。
 */
export async function copyTableToClipboard(tsv: string, html: string): Promise<boolean> {
  // ── 第 1 層：navigator.clipboard.write + ClipboardItem ──
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
      return true
    } catch {
      // write 存在但被拒絕（例如權限或瀏覽器實作限制）——退回下一層，
      // 不視為整體失敗，讓仍支援 writeText 的環境保有純文字複製體驗。
    }
  }

  // ── 第 2 層：navigator.clipboard.writeText（只有 TSV）──
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(tsv)
      return true
    } catch {
      // 繼續往下一層退回
    }
  }

  // ── 第 3 層：document.execCommand('copy')（非安全來源的退回路徑）──
  // 這是 navigator.clipboard 整個不存在（HTTP 非安全來源）時唯一還能動的路徑，
  // 必須完全同步（建立元素 → 選取 → execCommand，中間不能有 await），
  // 否則會消耗掉點擊事件帶來的 user activation，導致 execCommand 被瀏覽器拒絕。
  return legacyCopyViaExecCommand(html)
}

function legacyCopyViaExecCommand(html: string): boolean {
  if (typeof document === 'undefined' || !document.execCommand) return false

  const container = document.createElement('div')
  container.innerHTML = html
  // 用「移到視窗外」而非 display:none／visibility:hidden：被隱藏的元素無法被
  // Selection API 選取，execCommand('copy') 會靜默地什麼都沒複製到。
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-9999px'
  document.body.appendChild(container)

  const selection = window.getSelection()
  // 複製前先保留使用者原本的選取範圍，結束後要還原，不能把它蓋掉。
  const savedRanges: Range[] = []
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i++) {
      savedRanges.push(selection.getRangeAt(i).cloneRange())
    }
  }

  try {
    const range = document.createRange()
    range.selectNodeContents(container)
    selection?.removeAllRanges()
    selection?.addRange(range)

    return document.execCommand('copy')
  } finally {
    // 無論成功或失敗都要還原選取、移除暫時元素，不能留下 DOM 殘影
    // 或蓋掉使用者原本選取的內容。
    selection?.removeAllRanges()
    for (const r of savedRanges) selection?.addRange(r)
    container.remove()
  }
}
