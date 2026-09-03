import { describe, it, expect } from 'vitest'
import { pdnDisplay, PDN_FULL_THRESHOLD } from '../components/schedule/GanttChart'

/**
 * 門檻在 2026-09-03 從 340 降到 200。
 *
 * 原本 340 的理由是「預設 260px 塞不下人員徽章、PDN 與四顆操作按鈕」，
 * 所以預設寬度下只顯示編號段。操作按鈕改成停留才浮現之後，那 85px 回到 PDN，
 * 260px 現在放得下編號加大半個機種名，超出的部分由 CSS 截字處理。
 * 只有拖到最窄（180px）時才會退回只顯示編號段。
 */
describe('pdnDisplay', () => {
  it('預設欄寬（260）就顯示完整 PDN Number', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', 260))
      .toBe('PDN-250061 NCA-5550A-CK1')
  })

  it('達到門檻即顯示完整字串', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', PDN_FULL_THRESHOLD))
      .toBe('PDN-250061 NCA-5550A-CK1')
  })

  it('拖到門檻以下時只顯示編號段', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', 180)).toBe('PDN-250061')
  })

  it('含中括號的機種名在極窄時同樣被截去', () => {
    expect(pdnDisplay('PDN-210079 NCA-5220A-NZ1 [Nozomi]', 180)).toBe('PDN-210079')
  })

  it('不含空白的舊資料不被截成空字串', () => {
    expect(pdnDisplay('LegacyProjectName', 180)).toBe('LegacyProjectName')
  })

  it('空字串不崩潰', () => {
    expect(pdnDisplay('', 180)).toBe('')
  })
})
