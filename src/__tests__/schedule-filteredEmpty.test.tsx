// src/__tests__/schedule-filteredEmpty.test.tsx
// 甘特圖與列表「篩選後沒結果」改用 ListState：顯示「沒有符合條件的排程」＋「清除篩選」，
// 按下去等於條件列的「清除全部」——onFilterChange(EMPTY_FILTER)
// （UI 統一第 3 項 E，規格修正清單第 7 項）。
//
// Final review（2026-09-24，使用者選定）之後：「清除篩選」改成保留目前的
// showAllUnits（我的排程／全部），目標等於目前篩選時不顯示按鈕——見下方
// 「清除篩選保留 showAllUnits」與「目標已達成時不顯示清除篩選」兩組測試。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { GanttChart } from '../components/schedule/GanttChart'
import ScheduleListView from '../components/schedule/ScheduleListView'
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

// 測試中的排程（不受預設狀態篩選影響），分屬兩位不同工程師，
// 用來驗證「清除篩選」有沒有保留 showAllUnits（我的排程／全部）。
function makeTesting(id: string, projectName: string, testEngineer: string): Schedule {
  return {
    id, category: 'NPI', projectName, taskDescription: '',
    testUnit: 'SIT-HW', testEngineer, timeResource: 1,
    startDate: todayYmd(), endDate: todayYmd(),
    requiredPersonnel: '', testReport: '',
    isCompleted: false, isDelayed: false, isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
  }
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

  it('ScheduleListView 單獨 render：清除篩選呼叫傳入的 onClearFilters', async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleListView schedules={[]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} onClearFilters={onClearFilters} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('ScheduleListView 單獨 render：沒有 onClearFilters 時不顯示清除篩選按鈕', () => {
    render(
      <ScheduleListView schedules={[]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
  })

  it('ScheduleListView 有資料：照常顯示表格，沒有狀態區塊', () => {
    render(
      <ScheduleListView schedules={[completed]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} onClearFilters={vi.fn()} />,
    )
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('清除篩選保留目前的「我的排程／全部」', () => {
  it('user、showAllUnits 為「全部」時輸入沒有結果的關鍵字：清除篩選後仍是「全部」，兩人的排程都出現', async () => {
    useScheduleStore.setState({
      schedules: [
        makeTesting('mine', 'PDN-260010', 'Rock_Cai'),
        makeTesting('other', 'PDN-260020', 'Ivy_Lin'),
      ],
    })
    useAuthStore.setState({ role: 'user', linkedEngineer: 'Rock_Cai', canViewVtmsProgress: false })
    const { user } = renderGantt()

    // 預設只看自己的排程；切到「全部」才看得到兩筆
    await user.click(screen.getByRole('radio', { name: '全部' }))
    expect(screen.getByTitle('PDN-260010')).toBeInTheDocument()
    expect(screen.getByTitle('PDN-260020')).toBeInTheDocument()

    // 輸入一個兩筆都不會命中的關鍵字
    await user.type(screen.getByLabelText('搜尋排程'), 'ZZZ-NO-MATCH-ZZZ')
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    // 關鍵字清掉了；若 showAllUnits 被誤重置為 false，這裡只會剩下 mine 那筆
    expect(screen.getByTitle('PDN-260010')).toBeInTheDocument()
    expect(screen.getByTitle('PDN-260020')).toBeInTheDocument()
    expect((screen.getByLabelText('搜尋排程') as HTMLInputElement).value).toBe('')
    // 分段控制仍停留在「全部」
    expect(screen.getByRole('radio', { name: '全部' })).toHaveAttribute('aria-checked', 'true')
  })

  it('user、名下沒有排程、篩選已等於清除目標（EMPTY_FILTER + showAllUnits: false）：不顯示清除篩選按鈕', async () => {
    useScheduleStore.setState({
      schedules: [makeTesting('other', 'PDN-260020', 'Ivy_Lin')],
    })
    useAuthStore.setState({ role: 'user', linkedEngineer: 'Rock_Cai', canViewVtmsProgress: false })
    const { user } = renderGantt()

    // 一進來就是 0 筆（名下沒有排程，showAllUnits 預設 false）
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    // 用條件列本身的「清除全部」把篩選推到 EMPTY_FILTER（showAllUnits 仍是 false），
    // 此時「清除篩選」按下去不會有任何改變，應該整顆按鈕都不見
    await user.click(screen.getByRole('button', { name: '清除全部' }))

    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
  })
})
