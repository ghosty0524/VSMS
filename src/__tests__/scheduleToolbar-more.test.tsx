// src/__tests__/scheduleToolbar-more.test.tsx
// 工具列的次要動作收進「更多」（UI 統一第 3 項 C）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { DEFAULT_FILTER } from '../components/schedule/FilterSortBar'
import type { OptionsMap, Role } from '../types'

const { downloadTemplateSpy } = vi.hoisted(() => ({ downloadTemplateSpy: vi.fn() }))
vi.mock('../lib/excel', async () => {
  const actual = await vi.importActual<typeof import('../lib/excel')>('../lib/excel')
  return { ...actual, downloadTemplate: downloadTemplateSpy }
})

const options: OptionsMap = {
  testUnits: [{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: 'SIT', engineers: [] }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

function renderToolbar(role: Role, viewMode: 'gantt' | 'list', overrides: Partial<Parameters<typeof ScheduleToolbar>[0]> = {}) {
  const props = {
    role,
    viewMode,
    onViewModeChange: vi.fn(),
    groupBy: 'engineer' as const,
    onGroupByChange: vi.fn(),
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    onCopyList: vi.fn(),
    onAddSchedule: vi.fn(),
    filterSort: DEFAULT_FILTER,
    onFilterChange: vi.fn(),
    ...overrides,
  }
  const user = userEvent.setup()
  const utils = render(<ScheduleToolbar {...props} />)
  return { user, props, ...utils }
}

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /更多/ }))
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map(el => el.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
  useScheduleStore.setState({ schedules: [] })
  useOptionsStore.setState({ options })
})

describe('ScheduleToolbar「更多」', () => {
  it('admin、甘特圖：更多裡有匯入／匯出／範本，沒有複製表格', async () => {
    const { user } = renderToolbar('admin', 'gantt')
    expect(await openMore(user)).toEqual(['匯入排程…', '匯出…', '下載匯入範本'])
  })

  it('admin、列表：多出複製表格，點下去呼叫 onCopyList', async () => {
    const { user, props } = renderToolbar('admin', 'list')
    expect(await openMore(user)).toEqual(['匯入排程…', '匯出…', '下載匯入範本', '複製表格'])
    await user.click(screen.getByRole('menuitem', { name: '複製表格' }))
    expect(props.onCopyList).toHaveBeenCalledTimes(1)
  })

  it('super_admin 與 admin 相同', async () => {
    const { user } = renderToolbar('super_admin', 'gantt')
    expect(await openMore(user)).toEqual(['匯入排程…', '匯出…', '下載匯入範本'])
  })

  it('項目保留原按鈕的說明文字', async () => {
    const { user } = renderToolbar('admin', 'list')
    await openMore(user)
    expect(screen.getByRole('menuitem', { name: '匯入排程…' })).toHaveAttribute('title', '從 Excel 匯入排程')
    expect(screen.getByRole('menuitem', { name: '匯出…' })).toHaveAttribute('title', '匯出排程或 Dashboard')
    expect(screen.getByRole('menuitem', { name: '下載匯入範本' })).toHaveAttribute('title', '下載 Excel 匯入範本')
    expect(screen.getByRole('menuitem', { name: '複製表格' }))
      .toHaveAttribute('title', '複製目前篩選結果的完整列表（可貼到 Excel、Word 或 Outlook）')
  })

  it('下載匯入範本呼叫 downloadTemplate', async () => {
    const { user } = renderToolbar('admin', 'gantt')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: '下載匯入範本' }))
    expect(downloadTemplateSpy).toHaveBeenCalledTimes(1)
  })

  it('匯入排程…開啟匯入視窗', async () => {
    const { user } = renderToolbar('admin', 'gantt')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: '匯入排程…' }))
    expect(screen.queryByRole('menu')).toBeNull()
    // ExcelImportModal 在 isOpen 時才渲染；以它的標題判斷有開起來
    expect(await screen.findByRole('heading', { name: '從 Excel 匯入排程' })).toBeInTheDocument()
  })

  it('user、甘特圖：沒有更多，也沒有新增排程', () => {
    renderToolbar('user', 'gantt')
    expect(screen.queryByRole('button', { name: /更多/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /新增排程/ })).toBeNull()
  })

  it('user、列表：更多只有複製表格', async () => {
    const { user } = renderToolbar('user', 'list')
    expect(await openMore(user)).toEqual(['複製表格'])
  })

  it('guest、甘特圖：沒有更多', () => {
    renderToolbar('guest', 'gantt')
    expect(screen.queryByRole('button', { name: /更多/ })).toBeNull()
  })

  it('admin：新增排程是工具列最後一顆按鈕，排在更多之後', () => {
    const { container } = renderToolbar('admin', 'gantt')
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button'))
    const last = buttons[buttons.length - 1]
    expect(last).toHaveTextContent('新增排程')
    const more = screen.getByRole('button', { name: /更多/ })
    expect(buttons.indexOf(more)).toBe(buttons.length - 2)
  })

  it('左側不再有匯入／匯出／範本按鈕', () => {
    renderToolbar('admin', 'gantt')
    expect(screen.queryByRole('button', { name: '匯入' })).toBeNull()
    expect(screen.queryByRole('button', { name: '匯出' })).toBeNull()
    expect(screen.queryByTitle('下載 Excel 匯入範本')).toBeNull()
  })

  it('全螢幕按鈕只有圖示、有 aria-label，切換時文字跟著變', () => {
    const { unmount } = renderToolbar('admin', 'gantt')
    const fs = screen.getByRole('button', { name: '全螢幕檢視' })
    expect(fs).toHaveAttribute('title', '全螢幕檢視')
    expect(fs.textContent).toBe('')
    unmount()
    renderToolbar('admin', 'gantt', { isFullscreen: true })
    expect(screen.getByRole('button', { name: '離開全螢幕（Esc）' })).toHaveAttribute('title', '離開全螢幕（Esc）')
  })
})
