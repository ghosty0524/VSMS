import { describe, it, expect } from 'vitest'
import { pdnDisplay, PDN_FULL_THRESHOLD } from '../components/schedule/GanttChart'

describe('pdnDisplay', () => {
  it('左欄夠寬時顯示完整 PDN Number', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', PDN_FULL_THRESHOLD))
      .toBe('PDN-250061 NCA-5550A-CK1')
  })

  it('左欄較窄時只顯示編號段', () => {
    expect(pdnDisplay('PDN-250061 NCA-5550A-CK1', 260)).toBe('PDN-250061')
  })

  it('含中括號的機種名同樣被截去', () => {
    expect(pdnDisplay('PDN-210079 NCA-5220A-NZ1 [Nozomi]', 260)).toBe('PDN-210079')
  })

  it('不含空白的舊資料不被截成空字串', () => {
    expect(pdnDisplay('LegacyProjectName', 260)).toBe('LegacyProjectName')
  })

  it('空字串不崩潰', () => {
    expect(pdnDisplay('', 260)).toBe('')
  })
})
