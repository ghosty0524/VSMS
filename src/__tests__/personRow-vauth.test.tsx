// src/__tests__/personRow-vauth.test.tsx
// 單一登入模式（vauth）下 PersonRow 隱藏「停用／啟用」與「建立帳號」按鈕（帳號、
// 名冊都由入口頁的組織設定管理），「編輯」按鈕仍要保留（顏色與 VTMS 連結權限仍可改）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useOptionsStore } from '../store/optionsStore'
import { PersonRow } from '../components/settings/PersonRow'
import type { Person } from '../lib/peopleRows'
import type { OptionsMap } from '../types'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, getUsers: vi.fn(async () => []) } }
})

// 沒有帳號的人：同一列會同時出現「建立帳號」與「停用／啟用」按鈕，方便一次驗證兩者都被藏起來。
const person: Person = {
  name: 'Rock_Cai',
  label: 'Rock_Cai',
  rosterActive: true,
  memberships: [{
    unitId: 'u-hw', unitValue: 'SIT-HW', unitLabel: 'SIT-HW',
    engineer: { id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null },
  }],
  account: null,
}

const options: OptionsMap = {
  testUnits: [{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: 'SIT', engineers: [] }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

const noop = () => {}

beforeEach(() => {
  useOptionsStore.setState({ options })
})

describe('PersonRow under vauth', () => {
  it('vauth 模式：隱藏停用／啟用與建立帳號，保留編輯', () => {
    render(
      <PersonRow person={person} variant="active" authProvider="vauth"
        onEdit={noop} onToggleActive={noop} onColorChange={noop} onCreateAccount={noop} />
    )
    expect(screen.queryByRole('button', { name: '停用' })).toBeNull()
    expect(screen.queryByRole('button', { name: '啟用' })).toBeNull()
    expect(screen.queryByRole('button', { name: /新增帳號/ })).toBeNull()
    expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
  })

  it('local 模式：停用／啟用與建立帳號仍會出現', () => {
    render(
      <PersonRow person={person} variant="active" authProvider="local"
        onEdit={noop} onToggleActive={noop} onColorChange={noop} onCreateAccount={noop} />
    )
    expect(screen.getByRole('button', { name: '停用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新增帳號/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
  })
})
