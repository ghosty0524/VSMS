// src/__tests__/testUnitManager-vauth.test.tsx
// 單一登入模式（vauth）下單位清單由入口頁的組織設定管理：新增／刪除／停用啟用／
// 改名都會被後端忽略（PUT /api/options 只套用顏色、label 與排序），所以這些按鈕
// 要藏起來，不然使用者按了會「看似成功、實際無效」。顏色仍可改。
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { TestUnitManager } from '../components/settings/TestUnitManager'
import type { OptionsMap } from '../types'

const options: OptionsMap = {
  testUnits: [{
    id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: 'SIT',
    engineers: [{ id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null }],
  }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

beforeEach(() => {
  useOptionsStore.setState({ options })
})

describe('TestUnitManager under vauth', () => {
  it('vauth 模式：隱藏新增／刪除／停用／編輯，保留顏色選擇器', () => {
    useAuthStore.setState({ authProvider: 'vauth' })
    render(<TestUnitManager />)

    expect(screen.queryByRole('button', { name: '新增' })).toBeNull()
    expect(screen.queryByPlaceholderText('新增測試單位')).toBeNull()
    expect(screen.queryByRole('button', { name: '刪除' })).toBeNull()
    expect(screen.queryByRole('button', { name: '停用' })).toBeNull()
    expect(screen.queryByRole('button', { name: '啟用' })).toBeNull()
    expect(screen.queryByRole('button', { name: '編輯' })).toBeNull()
    expect(screen.getByTitle('自訂單位色（甘特圖 bar 外框）')).toBeInTheDocument()
  })

  it('local 模式：新增／刪除／停用／編輯都還在', () => {
    useAuthStore.setState({ authProvider: 'local' })
    render(<TestUnitManager />)

    expect(screen.getByRole('button', { name: '新增' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('新增測試單位')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刪除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編輯' })).toBeInTheDocument()
    expect(screen.getByTitle('自訂單位色（甘特圖 bar 外框）')).toBeInTheDocument()
  })
})
