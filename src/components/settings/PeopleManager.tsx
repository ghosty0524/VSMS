// src/components/settings/PeopleManager.tsx
//
// 「人員」分頁：一個名字就是一個人（peopleRows.ts）。這個檔案只負責分組與
// 區塊；一列的長相在 PersonRow，一人一份表單在 PersonFormModal。
//
// 使用者要求（2026-09-10）：同功能按鈕在同一條垂直線（PersonRow 的固定 grid）、
// 停用者另外擺放且預設摺疊、顏色不要還原鈕。
import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { toast } from '../../store/toastStore'
import { useOptionsStore } from '../../store/optionsStore'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { buildPeopleModel, UNASSIGNED_LABEL, type Person, type SafeUser, type PersonGroup, type PeopleModel } from '../../lib/peopleRows'
import { deactivatePerson, activatePerson, membershipTargets } from '../../lib/peopleActions'
import { groupByDepartment, type DeptGroup, type SectionGroup } from '../../lib/orgGroups'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { ListState } from '../shared/ListState'
import { PersonRow, PEOPLE_GRID } from './PersonRow'
import { PersonFormModal } from './PersonFormModal'

/** 表單只存 name，畫面用當下的 model 現查現人，避免拿著儲存前的舊快照 */
function findPerson(model: PeopleModel, name: string): Person | null {
  for (const g of model.active) {
    const p = g.people.find(x => x.name === name)
    if (p) return p
  }
  for (const g of model.inactive) {
    const p = g.people.find(x => x.name === name)
    if (p) return p
  }
  return model.unassigned.find(x => x.name === name) ?? null
}

export function PeopleManager() {
  const { options, patchEngineers, addEngineer } = useOptionsStore()
  const { peopleInactiveOpen, setPeopleInactiveOpen } = useUIStore()
  const authProvider = useAuthStore(s => s.authProvider)
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  // 讀帳號失敗的訊息。名冊來自 options，照常畫得出來，但每個人都會像「沒有帳號」，
  // 所以除了 toast 之外還要在清單上方留一條看得到的提示。
  const [usersError, setUsersError] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; mode: 'edit' | 'create-account' } | null>(null)
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null)

  const loadUsers = async () => {
    try {
      setUsers(await api.getUsers())
      setUsersError(null)
    } catch (e) {
      toast.error('載入帳號列表失敗')
      setUsersError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }
  useEffect(() => { void loadUsers() }, [])

  const model = useMemo(() => buildPeopleModel(options.testUnits, users), [options.testUnits, users])
  const inactiveCount = model.inactive.reduce((n, g) => n + g.people.length, 0)
  const activeDepts = groupByDepartment(model.active, options.testUnits)
  /** 上方清單會畫出幾張卡片（部門卡＋未歸屬卡），給 ListState 判斷「有沒有資料」 */
  const activeCardCount = activeDepts.length + (model.unassigned.length > 0 ? 1 : 0)

  // 表單開著時人從 model 消失了（例如剛被刪除）就自動關閉；用 render 期間的
  // 判斷式而非 useEffect，理由同 PersonFormModal 開頭那段註解。
  const formPerson = form ? findPerson(model, form.name) : null
  if (form && !formPerson) setForm(null)

  const deps = { patchEngineers, disableUser: api.disableUser, enableUser: api.enableUser }

  const handleToggleActive = (p: Person, currentlyInactive: boolean) => {
    if (currentlyInactive) {
      // 啟用是可逆且無害的動作，不確認
      void activatePerson(p, deps).then(r => { if (!r.ok) toast.error(r.message); return loadUsers() })
      return
    }
    const parts = [
      p.memberships.length > 0 ? `${p.label} 會從所有單位的名冊停用（不再能被排程指派）` : '',
      p.account?.isActive ? `帳號 ${p.account.username} 會被停用（無法登入）` : '',
    ].filter(Boolean)
    setConfirm({
      title: '停用人員',
      message: `${parts.join('；')}。之後可以在「已停用」區塊啟用。`,
      run: async () => {
        const r = await deactivatePerson(p, deps)
        if (!r.ok) toast.error(r.message)
        await loadUsers()
      },
    })
  }

  const handleColorChange = async (p: Person, color: string) => {
    try { await patchEngineers(membershipTargets(p), { color }) }
    catch (e) { toast.error(`顏色更新失敗：${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleAdd = async (unitId: string) => {
    const v = (newNames[unitId] ?? '').trim()
    if (!v) return
    setAddErrors(d => { const n = { ...d }; delete n[unitId]; return n })
    if (users.some(u => u.role === 'super_admin' && u.username.toLowerCase() === v.toLowerCase())) {
      setAddErrors(d => ({ ...d, [unitId]: '此名稱是系統管理員帳號，不能加入名冊' }))
      return
    }
    try { await addEngineer(unitId, v); setNewNames(n => ({ ...n, [unitId]: '' })) }
    catch (e) { setAddErrors(d => ({ ...d, [unitId]: e instanceof Error ? e.message : String(e) })) }
  }

  const rows = (people: Person[], variant: 'active' | 'inactive') => people.map(p => (
    <PersonRow key={p.name} person={p} variant={variant} authProvider={authProvider}
      onEdit={x => setForm({ name: x.name, mode: 'edit' })}
      onToggleActive={x => handleToggleActive(x, variant === 'inactive')}
      onColorChange={handleColorChange}
      onCreateAccount={x => setForm({ name: x.name, mode: 'create-account' })} />
  ))

  const header = (
    <div className="overflow-x-auto">
      <div className={`${PEOPLE_GRID} px-3 text-xs text-gray-400 mb-1`}>
        <span /><span>姓名</span><span>單位</span><span>帳號</span><span /><span />
      </div>
    </div>
  )

  const groupCard = (g: PersonGroup, variant: 'active' | 'inactive') => (
    <div key={g.unitId ?? 'unassigned'} className="border rounded-lg p-3">
      <p className="font-medium text-sm text-gray-600 mb-2">{g.unitLabel}<span className="ml-2 text-xs text-gray-400">{g.people.length} 人</span></p>
      <div className="overflow-x-auto">
        <div className="space-y-0.5">{rows(g.people, variant)}</div>
      </div>
      {variant === 'active' && authProvider !== 'vauth' && g.unitId && (
        <div className="flex gap-2 mt-2">
          <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名（等於未來的帳號名稱）"
            value={newNames[g.unitId] ?? ''}
            onChange={e => setNewNames(n => ({ ...n, [g.unitId!]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd(g.unitId!) }} />
          <button type="button" onClick={() => handleAdd(g.unitId!)} className="px-2 py-1 text-xs bg-stone-900 text-white rounded hover:bg-stone-800">新增</button>
        </div>
      )}
      {g.unitId && addErrors[g.unitId] && <p className="text-xs text-red-500 mt-1">{addErrors[g.unitId]}</p>}
    </div>
  )

  /** 課的子區塊（部門卡片內） */
  const sectionBlock = (s: SectionGroup, variant: 'active' | 'inactive') => (
    <div key={s.unitId} className="mt-3">
      <p className="text-xs font-medium text-gray-500 mb-1">{s.unitLabel}<span className="ml-2 text-gray-400">{s.people.length} 人</span></p>
      <div className="overflow-x-auto"><div className="space-y-0.5">{rows(s.people, variant)}</div></div>
      {variant === 'active' && authProvider !== 'vauth' && (
        <div className="flex gap-2 mt-2">
          <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名（等於未來的帳號名稱）"
            value={newNames[s.unitId] ?? ''}
            onChange={e => setNewNames(n => ({ ...n, [s.unitId]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd(s.unitId) }} />
          <button type="button" onClick={() => handleAdd(s.unitId)} className="px-2 py-1 text-xs bg-stone-900 text-white rounded hover:bg-stone-800">新增</button>
        </div>
      )}
      {addErrors[s.unitId] && <p className="text-xs text-red-500 mt-1">{addErrors[s.unitId]}</p>}
    </div>
  )

  /** 部門卡片：單層部門直接沿用 groupCard；兩層部門先列部級再列各課 */
  const deptCard = (d: DeptGroup, variant: 'active' | 'inactive') => {
    if (d.isSingleLevel) {
      const s = d.sections[0]
      return groupCard({ unitId: s.unitId, unitLabel: s.unitLabel, people: s.people }, variant)
    }
    const total = d.deptLevel.length + d.sections.reduce((n, s) => n + s.people.length, 0)
    return (
      <div key={`dept-${d.department}`} className="border rounded-lg p-3">
        <p className="font-medium text-sm text-gray-600">{d.department}<span className="ml-2 text-xs text-gray-400">{total} 人</span></p>
        {d.deptLevel.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">部級<span className="ml-2 text-gray-400">跨課，{d.deptLevel.length} 人</span></p>
            <div className="overflow-x-auto"><div className="space-y-0.5">{rows(d.deptLevel, variant)}</div></div>
          </div>
        )}
        {d.sections.map(s => sectionBlock(s, variant))}
      </div>
    )
  }

  if (loading) return <p className="text-sm text-gray-400">載入中...</p>

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-1">人員</h3>
      <p className="text-xs text-gray-400 mb-3">
        {authProvider === 'vauth'
          ? '名冊、角色與單位由入口頁的組織設定管理；這裡只能改顏色。'
          : '一個名字就是一個人：名冊名稱等於登入帳號。滑過一列會出現「編輯」與「停用」。'}
      </p>

      <ListState noun="帳號" loading={loading} error={usersError} count={activeCardCount}
        onRetry={() => { void loadUsers() }}>
        {header}
        <div className="space-y-4">
          {activeDepts.map(d => deptCard(d, 'active'))}
          {model.unassigned.length > 0 && groupCard({ unitId: null, unitLabel: UNASSIGNED_LABEL, people: model.unassigned }, 'active')}
        </div>
      </ListState>

      <div className="mt-6 border-t pt-3">
        <button type="button" onClick={() => setPeopleInactiveOpen(!peopleInactiveOpen)}
          aria-expanded={peopleInactiveOpen}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800">
          {peopleInactiveOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          已停用（{inactiveCount}）
        </button>
        {peopleInactiveOpen && (
          inactiveCount === 0
            ? <p className="text-xs text-gray-400 mt-2">目前沒有停用的人員。</p>
            : (
              <div className="space-y-4 mt-3">
                {groupByDepartment(model.inactive, options.testUnits).map(d => deptCard(d, 'inactive'))}
                {model.inactive.filter(g => g.unitId === null).map(g => groupCard(g, 'inactive'))}
              </div>
            )
        )}
      </div>

      <PersonFormModal person={formPerson} mode={form?.mode ?? 'edit'}
        onClose={() => setForm(null)} onSaved={loadUsers} />

      <DeleteConfirmDialog
        isOpen={!!confirm}
        title={confirm?.title}
        message={confirm?.message ?? ''}
        confirmLabel="停用"
        danger={false}
        onConfirm={() => { const c = confirm; setConfirm(null); void c?.run() }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
