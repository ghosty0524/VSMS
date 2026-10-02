// 頂欄「使用說明」：站內對話框（iframe 載入入口頁說明 ?embed=1），與 VTMS 同一做法（2026-10-02）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuideDialog, guideEmbedUrl } from '../components/shared/GuideDialog'
import { Topbar } from '../components/layout/Topbar'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { GUIDE_SLUG_BY_VIEW, guideHref } from '../lib/guideLink'
import type { Role } from '../types'

describe('guideEmbedUrl / guideHref', () => {
  it('在路徑後加 ?embed=1，錨點保留在最後', () => {
    expect(guideEmbedUrl('/guide/vsms/schedules')).toBe('/guide/vsms/schedules?embed=1')
    expect(guideEmbedUrl('/guide/vsms/schedules#篩選')).toBe('/guide/vsms/schedules?embed=1#篩選')
  })
  it('每個 View 都有對照；settings 與 accounts 都連到 settings', () => {
    expect(Object.keys(GUIDE_SLUG_BY_VIEW).sort()).toEqual(['accounts', 'analytics', 'audit', 'main', 'settings'])
    expect(guideHref('main')).toBe('/guide/vsms/schedules')
    expect(guideHref('accounts')).toBe('/guide/vsms/settings')
  })
})

describe('GuideDialog', () => {
  it('aria-modal 對話框、iframe 帶 embed=1、新分頁連結', () => {
    render(<GuideDialog href="/guide/vsms/schedules" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '使用說明' })).toHaveAttribute('aria-modal', 'true')
    const frame = screen.getByTitle('使用說明')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', '/guide/vsms/schedules?embed=1')
    const open = screen.getByRole('link', { name: '在新分頁開啟' })
    expect(open).toHaveAttribute('href', '/guide/vsms/schedules')
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', 'noopener')
  })
  it('焦點在關閉鈕；關閉鈕、Esc、點遮罩都呼叫 onClose；點對話框本身不會', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<GuideDialog href="/guide/vsms/schedules" onClose={onClose} />)
    const close = screen.getByRole('button', { name: '關閉' })
    expect(close).toHaveFocus()
    await user.click(close)
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('guide-dialog-overlay'))
    await user.click(screen.getByRole('dialog', { name: '使用說明' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

describe('Topbar 使用者選單的「使用說明」', () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }))
  function login(role: Role) {
    useAuthStore.setState({
      isLoggedIn: true, isChecking: false, role, displayName: '系統管理員', username: 'admin',
      authProvider: 'vauth', checkAuth: vi.fn(async () => {}),
    })
  }
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); useUIStore.setState({ view: 'analytics' }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('第一項是「使用說明」，點了開對話框並載入目前頁面對應的章節；關閉後消失', async () => {
    login('super_admin')
    const user = userEvent.setup()
    render(<Topbar />)
    await user.click(screen.getByRole('button', { name: '使用者選單' }))
    const menu = screen.getByRole('menu', { name: '使用者選單' })
    const items = within(menu).getAllByRole('menuitem').map(i => i.textContent)
    expect(items[0]).toBe('使用說明')
    await user.click(within(menu).getByRole('menuitem', { name: '使用說明' }))
    const dialog = await screen.findByRole('dialog', { name: '使用說明' })
    expect(within(dialog).getByTitle('使用說明')).toHaveAttribute('src', '/guide/vsms/analytics?embed=1')
    await user.click(within(dialog).getByRole('button', { name: '關閉' }))
    expect(screen.queryByRole('dialog', { name: '使用說明' })).toBeNull()
  })

  it('訪客也看得到「使用說明」', async () => {
    login('guest')
    const user = userEvent.setup()
    render(<Topbar />)
    await user.click(screen.getByRole('button', { name: '使用者選單' }))
    expect(within(screen.getByRole('menu', { name: '使用者選單' })).getByRole('menuitem', { name: '使用說明' })).toBeInTheDocument()
  })
})
