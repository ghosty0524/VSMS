// src/__tests__/schedule-filteredEmpty.test.tsx
// 甘特圖與列表「篩選後沒結果」改用 ListState：顯示「沒有符合條件的排程」＋「清除篩選」，
// 按下去等於條件列的「清除全部」——onFilterChange(EMPTY_FILTER)
// （UI 統一第 3 項 E，規格修正清單第 7 項）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { GanttChart } from '../components/schedule/GanttChart'
import ScheduleListView from '../components/schedule/ScheduleListView'
import { EMPTY_FILTER } from '../components/schedule/FilterSortBar'
import type { OptionsMap, Schedule } from '../types'

const options: OptionsMap = {
  testUnits: [{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: 'SIT', engineers: [] }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 已完成的排程：預設篩選（DEFAULT_FILTER）隱藏 Completed，所以一進畫面就是
// 「有排程、但篩選後 0 筆」；清除篩選（EMPTY_FILTER 不限狀態）之後會出現。
const completed: Schedule = {
  id: 's1', category: 'NPI', projectName: 'PDN-260001', taskDescription: '',
  testUnit: 'SIT-HW', testEngineer: 'Rock_Cai', timeResource: 1,
  startDate: todayYmd(), endDate: todayYmd(),
  requiredPersonnel: '', testReport: '',
  isCompleted: true, isDelayed: false, isCancelled: false, completedAt: null, delayReason: '',
  createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
  adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
}

beforeEach(() => {
  localStorage.clear()
  useScheduleStore.setState({ schedules: [completed] })
  useOptionsStore.setState({ options })
  useAuthStore.setState({ role: 'admin', linkedEngineer: '', canViewVtmsProgress: false })
})

function renderGantt() {
  const user = userEvent.setup()
  render(
    <GanttChart showAddModal={false} onAddSchedule={vi.fn()} onCloseAddModal={vi.fn()}
      filterCollapsed onToggleFilter={vi.fn()} />,
  )
  return { user }
}

describe('甘特圖篩選後沒結果', () => {
  it('顯示「沒有符合條件的排程」＋清除篩選；按下後排程出現', async () => {
    const { user } = renderGantt()
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')
    expect(screen.queryByText('無符合篩選條件的排程')).toBeNull()

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.queryByText('沒有符合條件的排程')).toBeNull()
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
  })

  it('完全沒有排程時仍是原本的「尚無工作排程」，不是篩選後沒結果', () => {
    useScheduleStore.setState({ schedules: [] })
    renderGantt()
    expect(screen.getByText('尚無工作排程')).toBeInTheDocument()
    expect(screen.queryByText('沒有符合條件的排程')).toBeNull()
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
  })
})

describe('列表篩選後沒結果', () => {
  it('透過 GanttChart：清除篩選後列表出現排程', async () => {
    localStorage.setItem('vsms-main-view-mode', 'list')
    const { user } = renderGantt()
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.queryByText('沒有符合條件的排程')).toBeNull()
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
  })

  it('ScheduleListView 單獨 render：清除篩選呼叫 onFilterChange(EMPTY_FILTER)', async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleListView schedules={[]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} onFilterChange={onFilterChange} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_FILTER)
  })

  it('ScheduleListView 有資料：照常顯示表格，沒有狀態區塊', () => {
    render(
      <ScheduleListView schedules={[completed]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} onFilterChange={vi.fn()} />,
    )
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
