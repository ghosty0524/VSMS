// src/__tests__/navTabs.test.tsx
// 導覽分頁從頂欄搬到頂欄下方的第二列（UI 統一 4A）：40px、角色篩選規則不變、
// 只有一個可見分頁時整列不顯示。
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavTabs, visibleNavTabs } from '../components/layout/NavTabs'
import type { Role } from '../types'

describe('NavTabs', () => {
  it.each<[Role, string[]]>([
    ['super_admin', ['排程管理', '統計分析', '系統設定', '審計紀錄']],
    ['admin', ['排程管理', '統計分析', '系統設定']],
    ['user', ['排程管理']],
    ['guest', ['排程管理']],
  ])('%s 看得到的分頁', (role, labels) => {
    expect(visibleNavTabs(role).map(t => t.label)).toEqual(labels)
  })

  it.each<Role>(['user', 'guest'])('%s 只有一個分頁：整列不顯示', role => {
    const { container } = render(<NavTabs currentView="main" onNavigate={vi.fn()} role={role} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('多個分頁：40px 第二列、目前分頁有 aria-current、點擊切換頁面', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<NavTabs currentView="settings" onNavigate={onNavigate} role="super_admin" />)

    const nav = screen.getByRole('navigation', { name: '主導覽' })
    expect(nav.className).toContain('h-10')
    expect(within(nav).getAllByRole('button')).toHaveLength(4)
    expect(within(nav).getByRole('button', { name: '系統設定' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: '排程管理' })).not.toHaveAttribute('aria-current')

    await user.click(within(nav).getByRole('button', { name: '統計分析' }))
    expect(onNavigate).toHaveBeenCalledWith('analytics')
  })
})
