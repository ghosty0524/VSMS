// src/__tests__/personFormModal-vauth.test.tsx
// 單一登入模式（vauth）下 PersonFormModal 隱藏角色／管轄單位／所屬單位的編輯，
// 顯示由入口頁管理的說明文字；顏色仍可改。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAuthStore } from '../store/authStore'
import { useOptionsStore } from '../store/optionsStore'
import { PersonFormModal } from '../components/settings/PersonFormModal'
import type { Person } from '../lib/peopleRows'
import type { OptionsMap } from '../types'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, getUsers: vi.fn(async () => []), updateUser: vi.fn(), createUser: vi.fn() } }
})

// PersonFormModal 的實際 props 是 { person, mode, onClose, onSaved }（沒有獨立的 account
// prop；帳號資訊在 person.account，見 src/lib/peopleRows.ts 的 Person/SafeUser 定義）。
const person: Person = {
  name: 'Rock_Cai',
  label: 'Rock_Cai',
  rosterActive: true,
  memberships: [{
    unitId: 'u-hw', unitValue: 'SIT-HW', unitLabel: 'SIT-HW',
    engineer: { id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null },
  }],
  account: {
    id: 'id-Rock_Cai', username: 'Rock_Cai', displayName: 'Rock_Cai', role: 'user',
    isActive: true, allowedUnits: [], linkedEngineer: 'Rock_Cai',
    createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: '',
    canLinkVtms: false, canViewVtmsProgress: false,
  },
}

const options: OptionsMap = {
  testUnits: [{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: 'SIT', engineers: [] }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

beforeEach(() => {
  useAuthStore.setState({ authProvider: 'vauth', role: 'super_admin' })
  useOptionsStore.setState({ options })
})

describe('PersonFormModal under vauth', () => {
  it('角色、管轄單位、所屬單位不可編輯，顯示由入口頁管理；顏色仍可改', () => {
    render(<PersonFormModal person={person} mode="edit" onClose={() => {}} onSaved={async () => {}} />)
    expect(screen.queryByRole('radiogroup', { name: '角色' })).toBeNull()
    expect(screen.queryByText('所屬單位')).toBeNull()
    expect(screen.getByText(/角色與單位由入口頁的組織設定管理/)).toBeInTheDocument()
    expect(screen.getByText('SIT-HW')).toBeInTheDocument()
    expect(document.querySelector('input[type="color"]')).not.toBeNull()
  })
})
