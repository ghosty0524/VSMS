// src/components/settings/PersonFormModal.tsx
//
// 一個人一份表單：上半是名冊（姓名 label、顏色、單位歸屬、名冊啟用），下半是
// 帳號（建立或編輯）。置中視窗，不再在列內展開推擠。人員段與帳號段分別呼叫
// 既有 API，沒有交易；任一段失敗把訊息顯示在那一段。
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import { useOptionsStore } from '../../store/optionsStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { resolveEngineerColor } from '../../lib/colors'
import { roleLabel, type Person } from '../../lib/peopleRows'
import { useAuthStore } from '../../store/authStore'
import { membershipTargets, referencedUnits } from '../../lib/peopleActions'
import { groupUnitLabelsByDepartment, deptCheckState, toggleDepartment, toggleUnit } from '../../lib/allowedUnitsExpand'
import { useEscapeKey } from '../shared/useEscapeKey'
import { SegmentedControl } from '../shared/SegmentedControl'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'

type NewRole = 'user' | 'admin'
const INPUT = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface Props {
  person: Person | null
  mode: 'edit' | 'create-account'
  onClose: () => void
  onSaved: () => Promise<void>
}

export function PersonFormModal({ person, mode, onClose, onSaved }: Props) {
  const isOpen = person !== null
  useEscapeKey(isOpen, onClose)
  const { options, patchEngineers, setPersonUnits } = useOptionsStore()
  const activeUnits = options.testUnits.filter(u => u.isActive)
  const deptUnits = groupUnitLabelsByDepartment(options.testUnits)

  // ── 人員段 ──
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#94a3b8')
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [rosterActive, setRosterActive] = useState(true)
  const [rosterError, setRosterError] = useState('')
  // 使用者已看過「單位仍有排程指到此人」的警告並按了第二次「儲存」
  const [confirmedUnitDrop, setConfirmedUnitDrop] = useState(false)

  // ── 帳號段 ──
  const [newRole, setNewRole] = useState<NewRole>('user')
  /** 既有帳號的角色（admin ↔ user 可切換；super_admin 唯讀，不經這個 state） */
  const [editRole, setEditRole] = useState<NewRole>('user')
  const [password, setPassword] = useState('')
  const authProvider = useAuthStore(s => s.authProvider)
  const [allowedUnits, setAllowedUnits] = useState<string[]>([])
  const [canLinkVtms, setCanLinkVtms] = useState(false)
  const [canViewVtmsProgress, setCanViewVtmsProgress] = useState(false)
  const [accountActive, setAccountActive] = useState(true)
  const [accountError, setAccountError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null)

  // 换人時重置整份表單。用 render 期間比對＋setState 而非 useEffect：這是
  // React 官方認可的「依 prop 調整 state」寫法，react-hooks/set-state-in-effect
  // 只抓 effect 內的 setState，這裡不觸發。
  // 重置只在開啟或換人時做；部分成功後 onSaved 會換掉 person/options 的參考，
  // 若跟著重置會洗掉剛顯示的錯誤訊息。
  const [syncedName, setSyncedName] = useState<string | null>(null)
  if (person && person.name !== syncedName) {
    const first = person.memberships[0]
    setLabel(person.label)
    setColor(first ? (first.engineer.color ?? resolveEngineerColor(person.name, first.unitValue, options)) : '#94a3b8')
    setUnitIds(person.memberships.map(m => m.unitId))
    setRosterActive(person.rosterActive)
    setRosterError('')
    setConfirmedUnitDrop(false)
    const a = person.account
    setNewRole('user')
    setEditRole(a?.role === 'admin' ? 'admin' : 'user')
    setPassword('')
    setAllowedUnits(a?.allowedUnits ?? person.memberships.map(m => m.unitLabel))
    setCanLinkVtms(a?.canLinkVtms ?? false)
    setCanViewVtmsProgress(a?.canViewVtmsProgress ?? false)
    setAccountActive(a?.isActive ?? true)
    setAccountError('')
    setSyncedName(person.name)
  } else if (!person && syncedName !== null) {
    setSyncedName(null)
  }

  if (!person) return null
  const hasRoster = person.memberships.length > 0
  const account = person.account
  const isSuperAdminAccount = account?.role === 'super_admin'

  const saveRoster = async (): Promise<boolean> => {
    if (!hasRoster) return true
    setRosterError('')
    try {
      const patch: { label?: string; color?: string; isActive?: boolean } = {}
      if (label.trim() && label.trim() !== person.label) patch.label = label.trim()
      const first = person.memberships[0]
      const base = first.engineer.color ?? resolveEngineerColor(person.name, first.unitValue, options)
      if (color.toLowerCase() !== base.toLowerCase()) patch.color = color
      if (rosterActive !== person.rosterActive) patch.isActive = rosterActive
      if (Object.keys(patch).length > 0) await patchEngineers(membershipTargets(person), patch)

      // 伺服器的引用檢查是跨單位的（同一個 value 在任一單位有排程就擋），
      // 沒辦法分辨「這次要取消的單位」是不是那個仍被引用的單位，所以在這裡先擋一次。
      const removedUnitValues = person.memberships
        .filter(m => !unitIds.includes(m.unitId))
        .map(m => m.unitValue)
      if (removedUnitValues.length > 0 && !confirmedUnitDrop) {
        const refs = referencedUnits(person, removedUnitValues, useScheduleStore.getState().schedules)
        if (refs.length > 0) {
          setRosterError(
            refs.map(r => `${r.unitValue} 仍有 ${r.count} 筆排程指到此人，取消後該單位無法再指派他`).join('；')
            + '；再按一次「儲存」確認',
          )
          setConfirmedUnitDrop(true)
          return false
        }
      }
      await setPersonUnits(person.name, unitIds)
      return true
    } catch (e) {
      setRosterError(msgOf(e))
      return false
    }
  }

  const saveAccount = async (): Promise<boolean> => {
    setAccountError('')
    if (isSuperAdminAccount) return true   // 系統管理員帳號段是唯讀，不呼叫任何 API
    try {
      if (!account) {
        if (mode !== 'create-account' && !password) return true   // 編輯模式下沒填密碼 = 不建帳號
        if (password.length < 8) { setAccountError('密碼長度至少需要 8 個字元'); return false }
        await api.createUser({
          username: person.name,
          displayName: label.trim() || person.name,
          password,
          role: newRole,
          allowedUnits: newRole === 'admin' ? allowedUnits : [],
          linkedEngineer: newRole === 'user' ? person.name : '',
        })
        return true
      }
      if (authProvider === 'vauth') {
        // 單一登入模式下角色、管轄單位、對應人員、啟用狀態由入口頁的組織設定管理，
        // 後端會對這些欄位回 409 ORG_MANAGED；這裡只送 VTMS 連結權限。
        await api.updateUser(account.id, { canLinkVtms, canViewVtmsProgress })
        return true
      }
      if (password && password.length < 8) { setAccountError('新密碼長度至少需要 8 個字元'); return false }
      const displayNamePatch = hasRoster
        ? (label.trim() && label.trim() !== person.label ? { displayName: label.trim() } : {})
        : (label.trim() && label.trim() !== account.displayName ? { displayName: label.trim() } : {})
      // 角色可在 admin ↔ user 之間切換；後端會依新角色清掉另一邊的欄位，
      // 這裡只送「切換後」那個角色需要的欄位。
      const roleChanged = editRole !== account.role
      await api.updateUser(account.id, {
        password: password || undefined,
        ...(roleChanged ? { role: editRole } : {}),
        allowedUnits: editRole === 'admin' ? allowedUnits : [],
        linkedEngineer: editRole === 'user' ? person.name : undefined,
        canLinkVtms, canViewVtmsProgress,
        ...(accountActive !== account.isActive ? { isActive: accountActive } : {}),
        ...displayNamePatch,
      })
      return true
    } catch (e) {
      setAccountError(msgOf(e))
      return false
    }
  }

  const handleSave = async () => {
    setSubmitting(true)
    try {
      const a = await saveRoster()
      const b = await saveAccount()
      if (a && b) { await onSaved(); onClose() }
      else await onSaved()   // 部分成功也要刷新畫面，錯誤留在對應段
    } finally { setSubmitting(false) }
  }

  const removeFromRoster = () => setConfirm({
    title: '刪除人員',
    message: `將 ${person.label} 從所有單位的名冊移除。若任何單位仍有排程指到此人，後端會整筆擋下，名冊不會有任何變動。帳號不受影響。`,
    confirmLabel: '刪除人員',
    run: async () => {
      try { await setPersonUnits(person.name, []); await onSaved(); onClose() }
      catch (e) { setRosterError(msgOf(e)) }
    },
  })

  const deleteAccountPermanently = () => account && setConfirm({
    title: '永久刪除帳號',
    message: `即將永久刪除帳號 ${account.username}。此操作無法復原。名冊列不受影響。`,
    confirmLabel: '永久刪除',
    run: async () => {
      try { await api.deleteUserPermanent(account.id); await onSaved(); onClose() }
      catch (e) { setAccountError(msgOf(e)) }
    },
  })

  const toggleIn = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v]
  const section = (title: string, children: React.ReactNode) => (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 tracking-wide mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
  const showAllowedUnits = account ? (!isSuperAdminAccount && editRole === 'admin') : newRole === 'admin'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{person.label}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="關閉">✕</button>
        </div>

        <div className="p-4 space-y-5">
          {hasRoster && section('名冊', <>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              {/* 單一登入模式下名稱與帳號綁定（顯示名稱＝帳號名），不再提供改名；名冊 label 維持等於識別碼。 */}
              {authProvider !== 'vauth' ? (
              <div>
                <label className="block text-xs text-gray-600 mb-1">顯示名稱（識別碼 {person.name} 不變）</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} className={INPUT} />
              </div>
              ) : (
              <div className="text-sm text-gray-700 self-center">{person.name}</div>
              )}
              <div>
                <label className="block text-xs text-gray-600 mb-1">顏色</label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5" />
              </div>
            </div>
            {authProvider !== 'vauth' ? (
            <div>
              <label className="block text-xs text-gray-600 mb-1">所屬單位</label>
              <div className="flex flex-wrap gap-2">
                {activeUnits.map(u => (
                  <label key={u.id} className={`text-xs px-2 py-1 rounded border cursor-pointer ${unitIds.includes(u.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}>
                    <input type="checkbox" className="sr-only" checked={unitIds.includes(u.id)} onChange={() => setUnitIds(l => toggleIn(l, u.id))} />
                    {u.label}
                  </label>
                ))}
              </div>
            </div>
            ) : (
            <div>
              <label className="block text-xs text-gray-600 mb-1">單位</label>
              <p className="text-sm text-gray-700">{person.memberships.map(m => m.unitLabel).join('、')}</p>
            </div>
            )}
            {authProvider !== 'vauth' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rosterActive} onChange={e => setRosterActive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
              名冊啟用（可被排程指派）
            </label>
            )}
            {rosterError && <p className="text-xs text-red-600">{rosterError}</p>}
          </>)}

          {section(account ? '帳號' : '新增帳號', <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">帳號</label>
                <p className="text-sm px-2 py-1.5 bg-gray-50 border border-gray-200 rounded">{person.name}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">角色</label>
                {account && (isSuperAdminAccount || authProvider === 'vauth') ? (
                  <p className="text-sm px-2 py-1.5 bg-gray-50 border border-gray-200 rounded">{roleLabel(account.role)}</p>
                ) : account ? (
                  <SegmentedControl<NewRole>
                    options={[{ value: 'user', label: '測試人員' }, { value: 'admin', label: '部級主管' }]}
                    value={editRole}
                    onChange={v => {
                      setEditRole(v)
                      // 升為部級主管時，管轄單位預設帶入他自己的單位（與建立帳號時一致）
                      if (v === 'admin' && allowedUnits.length === 0) setAllowedUnits(person.memberships.map(m => m.unitLabel))
                    }}
                    size="md" ariaLabel="角色" />
                ) : authProvider !== 'vauth' ? (
                  <SegmentedControl<NewRole>
                    options={[{ value: 'user', label: '測試人員' }, { value: 'admin', label: '部級主管' }]}
                    value={newRole} onChange={setNewRole} size="md" ariaLabel="角色" />
                ) : null}
              </div>
            </div>
            {isSuperAdminAccount ? (
              <p className="text-xs text-gray-400">系統管理員帳號的密碼、管轄單位與啟用狀態請在其他地方管理，這裡唯讀。</p>
            ) : (
              <>
                {!hasRoster && account && authProvider !== 'vauth' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">顯示名稱</label>
                    <input type="text" value={label} onChange={e => setLabel(e.target.value)} className={INPUT} />
                  </div>
                )}
                {authProvider === 'vauth' ? (
                  <p className="text-xs text-gray-400">帳號、密碼、角色與單位由入口頁的組織設定管理；這裡只能改顏色與 VTMS 連結權限。<a href="/" className="text-blue-600 underline ml-1">前往入口頁</a></p>
                ) : (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{account ? '新密碼（留空表示不修改）' : '密碼（至少 8 個字元）'}</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={INPUT} autoComplete="new-password" />
                </div>
                )}
                {showAllowedUnits && authProvider !== 'vauth' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">管轄單位<span className="ml-1 text-gray-400">（不選 = 全部）</span></label>
                    <div className="space-y-1.5">
                      {deptUnits.map(d => {
                        const state = deptCheckState(allowedUnits, d.unitLabels)
                        const chip = (label: string, checked: boolean, onChange: () => void, extra = '') => (
                          <label key={label} className={`text-xs px-2 py-1 rounded border cursor-pointer ${checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'} ${extra}`}>
                            <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
                            {label}
                          </label>
                        )
                        if (d.isSingleLevel) {
                          return <div key={d.department} className="flex flex-wrap gap-2">{chip(d.department, allowedUnits.includes(d.department), () => setAllowedUnits(l => toggleUnit(l, d.department)))}</div>
                        }
                        return (
                          <div key={d.department} className="flex flex-wrap items-center gap-2">
                            {chip(`${d.department}（整個部門）`, state === 'all', () => setAllowedUnits(l => toggleDepartment(l, d.unitLabels)), state === 'some' ? 'border-dashed' : '')}
                            <span className="text-gray-300">|</span>
                            {d.unitLabels.map(u => chip(u, allowedUnits.includes(u), () => setAllowedUnits(l => toggleUnit(l, u))))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {account && (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-600">VTMS 整合權限</p>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={canLinkVtms} onChange={e => setCanLinkVtms(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                        可連結排程至 VTMS 測試計畫
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={canViewVtmsProgress} onChange={e => setCanViewVtmsProgress(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                        可檢視 VTMS 測試進度統計
                      </label>
                    </div>
                    {authProvider !== 'vauth' && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={accountActive} onChange={e => setAccountActive(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                      帳號啟用（可登入）
                    </label>
                    )}
                  </>
                )}
              </>
            )}
            {accountError && <p className="text-xs text-red-600">{accountError}</p>}
          </>)}

          {authProvider !== 'vauth' && (hasRoster || (account && !account.isActive && !isSuperAdminAccount)) && (
            <div className="border-t pt-3 flex flex-wrap gap-2">
              {hasRoster && (
                <button type="button" onClick={removeFromRoster} className="text-xs px-2 py-1 border border-stone-300 text-stone-600 rounded hover:border-red-300 hover:bg-red-50 hover:text-red-700">
                  從名冊刪除此人
                </button>
              )}
              {account && !account.isActive && !isSuperAdminAccount && (
                <button type="button" onClick={deleteAccountPermanently} className="flex items-center gap-1 text-xs px-2 py-1 border border-stone-300 text-stone-600 rounded hover:border-red-300 hover:bg-red-50 hover:text-red-700">
                  <AlertTriangle size={12} />永久刪除帳號
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
          <button type="button" onClick={handleSave} disabled={submitting}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">
            {submitting ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>

      <DeleteConfirmDialog
        isOpen={!!confirm}
        title={confirm?.title}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        danger
        onConfirm={() => { const c = confirm; setConfirm(null); void c?.run() }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
