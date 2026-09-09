// src/components/settings/PeopleManager.tsx
//
// 「測試人員」與「帳號管理」合併後的分頁。一人一列，帳號是人員的附屬欄位。
// 資料層不變：名冊仍走 optionsStore → PUT /api/options，帳號仍走 /api/users。
// 對應邏輯在 lib/peopleRows.ts（可測），這裡只渲染與呼叫。
//
// 沿用兩個既有決定：改名只動 label（value 是排程存的識別碼）；啟用不確認、
// 停用與永久刪除用 DeleteConfirmDialog。
import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { AlertTriangle, UserPlus } from 'lucide-react'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { api } from '../../lib/api'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveEngineerColor } from '../../lib/colors'
import { buildPeopleView, type SafeUser, type PersonRow } from '../../lib/peopleRows'

type AccountRole = 'admin' | 'user'

/** 建立帳號的來源：從人員列（角色與對應人員鎖定）或從管理帳號區塊 */
type CreateTarget = { kind: 'admin' } | { kind: 'engineer'; engineerValue: string }

interface CreateForm {
  username: string
  displayName: string
  password: string
  role: AccountRole
  allowedUnits: string[]
  linkedEngineer: string
}

interface EditForm {
  displayName: string
  password: string
  allowedUnits: string[]
  linkedEngineer: string
  canLinkVtms: boolean
  canViewVtmsProgress: boolean
}

const EMPTY_CREATE: CreateForm = { username: '', displayName: '', password: '', role: 'admin', allowedUnits: [], linkedEngineer: '' }
const EMPTY_EDIT: EditForm = { displayName: '', password: '', allowedUnits: [], linkedEngineer: '', canLinkVtms: false, canViewVtmsProgress: false }

const INPUT = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ── 小元件（放在模組層級，避免每次 render 重新定義造成 remount）──────────

function UnitSelector({ allUnits, selected, onChange }: { allUnits: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const isAll = selected.length === 0
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">
        管轄單位<span className="ml-1 text-gray-400">（不選 = 全部可存取）</span>
      </label>
      <div className="border border-gray-300 rounded p-2 bg-white space-y-1 max-h-36 overflow-y-auto">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
          <input type="checkbox" checked={isAll} onChange={() => onChange([])} className="w-3.5 h-3.5 accent-blue-600" />
          <span className="text-xs font-medium text-gray-700">全部單位（不限制）</span>
        </label>
        <div className="border-t border-gray-100 my-1" />
        {allUnits.map(unit => (
          <label key={unit} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
            <input type="checkbox" checked={selected.includes(unit)}
              onChange={() => {
                if (isAll) onChange(allUnits.filter(u => u !== unit))
                else onChange(selected.includes(unit) ? selected.filter(u => u !== unit) : [...selected, unit])
              }}
              className="w-3.5 h-3.5 accent-blue-600" />
            <span className="text-xs text-gray-700">{unit}</span>
          </label>
        ))}
      </div>
      {!isAll && <p className="text-xs text-blue-600 mt-1">已選：{selected.join('、')}</p>}
    </div>
  )
}

function EngineerSelector({ allEngineers, value, onChange }: { allEngineers: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">對應測試人員 <span className="text-red-500">*</span></label>
      <select value={value} onChange={e => onChange(e.target.value)} className={INPUT}>
        <option value="">— 請選擇 —</option>
        {allEngineers.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
    </div>
  )
}

function VtmsPermissions({ value, onChange }: { value: Pick<EditForm, 'canLinkVtms' | 'canViewVtmsProgress'>; onChange: (v: Pick<EditForm, 'canLinkVtms' | 'canViewVtmsProgress'>) => void }) {
  return (
    <div>
      <p className="text-xs text-gray-600 mb-1">VTMS 整合權限</p>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={value.canLinkVtms}
          onChange={e => onChange({ ...value, canLinkVtms: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
        可連結排程至 VTMS 測試計畫
      </label>
      <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
        <input type="checkbox" checked={value.canViewVtmsProgress}
          onChange={e => onChange({ ...value, canViewVtmsProgress: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
        可檢視 VTMS 測試進度統計
      </label>
    </div>
  )
}

function RoleBadge({ role }: { role: SafeUser['role'] }) {
  const cls = role === 'super_admin' ? 'bg-purple-100 text-purple-700'
    : role === 'user' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
  const text = role === 'super_admin' ? 'Super Admin' : role === 'user' ? 'User' : 'Admin'
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{text}</span>
}

// ── 主元件 ───────────────────────────────────────────────────────────────

export function PeopleManager() {
  const { options, addEngineer, updateEngineer, toggleEngineer, removeEngineer, setEngineerColor } = useOptionsStore()

  // ── 帳號 ──
  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE)
  const [editTarget, setEditTarget] = useState<SafeUser | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT)
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; confirmLabel: string; danger: boolean; run: () => Promise<void>
  } | null>(null)

  // ── 名冊（沿用 EngineerManager 的狀態與錯誤分桶）──
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  const [draftColors, setDraftColors] = useState<Record<string, string>>({})
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})

  const view = useMemo(() => buildPeopleView(options.testUnits, users), [options.testUnits, users])

  const allUnits = useMemo(
    () => options.testUnits.filter(u => u.isActive).map(u => u.label).sort(),
    [options.testUnits],
  )
  const allEngineers = useMemo(
    () => options.testUnits.filter(u => u.isActive)
      .flatMap(u => u.engineers.filter(e => e.isActive).map(e => e.value)).sort(),
    [options.testUnits],
  )

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 3000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  const loadUsers = async () => {
    try { setUsers(await api.getUsers()) }
    catch { showMsg('載入帳號列表失敗', true) }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadUsers() }, [])

  // ── 帳號操作 ──

  const openCreate = (target: CreateTarget) => {
    setEditTarget(null)
    setCreateTarget(target)
    setCreateForm(target.kind === 'engineer'
      ? { ...EMPTY_CREATE, role: 'user', linkedEngineer: target.engineerValue }
      : EMPTY_CREATE)
  }

  const handleCreate = async () => {
    if (!createForm.username.trim() || !createForm.password) { showMsg('帳號與密碼為必填', true); return }
    if (createForm.password.length < 8) { showMsg('密碼長度至少需要 8 個字元', true); return }
    if (createForm.role === 'user' && !createForm.linkedEngineer) { showMsg('User 角色必須選擇對應測試人員', true); return }
    try {
      await api.createUser({
        username: createForm.username.trim(),
        displayName: createForm.displayName.trim() || undefined,
        password: createForm.password,
        role: createForm.role,
        allowedUnits: createForm.role === 'admin' ? createForm.allowedUnits : [],
        linkedEngineer: createForm.role === 'user' ? createForm.linkedEngineer : '',
      })
      showMsg(`帳號 ${createForm.username} 已新增`)
      setCreateTarget(null)
      setCreateForm(EMPTY_CREATE)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '新增失敗', true)
    }
  }

  const openEdit = (user: SafeUser) => {
    setCreateTarget(null)
    setEditTarget(user)
    setEditForm({
      displayName: user.displayName, password: '',
      allowedUnits: user.allowedUnits ?? [], linkedEngineer: user.linkedEngineer ?? '',
      canLinkVtms: user.canLinkVtms ?? false, canViewVtmsProgress: user.canViewVtmsProgress ?? false,
    })
  }

  const handleEdit = async () => {
    if (!editTarget) return
    try {
      await api.updateUser(editTarget.id, {
        displayName: editForm.displayName.trim() || undefined,
        password: editForm.password || undefined,
        allowedUnits: editTarget.role === 'admin' ? editForm.allowedUnits : [],
        linkedEngineer: editTarget.role === 'user' ? editForm.linkedEngineer : undefined,
        canLinkVtms: editForm.canLinkVtms,
        canViewVtmsProgress: editForm.canViewVtmsProgress,
      })
      showMsg(`帳號 ${editTarget.username} 已更新`)
      setEditTarget(null)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '更新失敗', true)
    }
  }

  const handleDisable = (user: SafeUser) => setConfirmState({
    title: '停用帳號',
    message: `停用後 ${user.username} 將無法登入，但帳號資料會保留，之後可以再啟用。`,
    confirmLabel: '停用', danger: false,
    run: async () => {
      try { await api.disableUser(user.id); showMsg(`帳號 ${user.username} 已停用`); await loadUsers() }
      catch (e: unknown) { showMsg((e as Error).message || '停用失敗', true) }
    },
  })

  const handleEnable = async (user: SafeUser) => {
    try { await api.enableUser(user.id); showMsg(`帳號 ${user.username} 已啟用`); await loadUsers() }
    catch (e: unknown) { showMsg((e as Error).message || '啟用失敗', true) }
  }

  const handleDeletePermanent = (user: SafeUser) => setConfirmState({
    title: '永久刪除帳號',
    message: `即將永久刪除 ${user.username}（${user.displayName || '未設顯示名稱'}）。此操作無法復原，該帳號的設定與關聯都會一併消失。`,
    confirmLabel: '永久刪除', danger: true,
    run: async () => {
      try { await api.deleteUserPermanent(user.id); showMsg(`帳號 ${user.username} 已永久刪除`); await loadUsers() }
      catch (e: unknown) { showMsg((e as Error).message || '刪除失敗', true) }
    },
  })

  // ── 名冊操作（與 EngineerManager 相同：await 後 set，失敗顯示在該列）──

  const clearDraftColor = (id: string) =>
    setDraftColors(d => { if (!(id in d)) return d; const n = { ...d }; delete n[id]; return n })
  const clearErr = (setter: typeof setActionErrors, id: string) =>
    setter(d => { const n = { ...d }; delete n[id]; return n })
  const msgOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

  const handleRemove = async (unitId: string, engId: string) => {
    clearErr(setDeleteErrors, engId)
    try { await removeEngineer(unitId, engId) }
    catch (err) { setDeleteErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleToggle = async (unitId: string, engId: string, isActive: boolean) => {
    clearErr(setActionErrors, engId)
    try { await toggleEngineer(unitId, engId, isActive) }
    catch (err) { setActionErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleRename = async (unitId: string, engId: string, name: string) => {
    clearErr(setActionErrors, engId)
    try { await updateEngineer(unitId, engId, name); clearErr(setEditKeys, engId) }
    catch (err) { setActionErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleSetColor = async (unitId: string, engId: string, color: string | null) => {
    clearErr(setActionErrors, engId)
    try { await setEngineerColor(unitId, engId, color) }
    catch (err) { setActionErrors(d => ({ ...d, [engId]: msgOf(err) })) }
  }
  const handleAdd = async (unitId: string) => {
    const v = (newNames[unitId] ?? '').trim()
    if (!v) return
    clearErr(setAddErrors, unitId)
    try { await addEngineer(unitId, v); setNewNames(n => ({ ...n, [unitId]: '' })) }
    catch (err) { setAddErrors(d => ({ ...d, [unitId]: msgOf(err) })) }
  }

  // ── 渲染片段 ──

  const accountActions = (user: SafeUser) => (
    <div className="flex gap-1.5 flex-shrink-0">
      {user.isActive ? (
        <>
          <button type="button" onClick={() => openEdit(user)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">編輯</button>
          <button type="button" onClick={() => handleDisable(user)} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">停用</button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => handleEnable(user)} className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">啟用</button>
          <button type="button" onClick={() => handleDeletePermanent(user)} className="flex items-center gap-1 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
            <AlertTriangle size={12} />永久刪除
          </button>
        </>
      )}
    </div>
  )

  const createFormPanel = () => {
    if (!createTarget) return null
    const locked = createTarget.kind === 'engineer'
    return (
      <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <h4 className="text-sm font-medium text-blue-800 mb-3">
          {locked ? `為 ${createTarget.engineerValue} 建立帳號` : '新增管理帳號'}
        </h4>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">帳號（username）<span className="text-red-500">*</span></label>
            <input type="text" value={createForm.username} placeholder="4~20 字元，英數字"
              onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">顯示名稱（選填）</label>
            <input type="text" value={createForm.displayName} placeholder="顯示用名稱"
              onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">角色</label>
            {locked ? (
              <p className="text-sm text-gray-700 px-2 py-1.5 bg-white border border-gray-200 rounded">User（測試人員）・對應 {createTarget.engineerValue}</p>
            ) : (
              <select value={createForm.role}
                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as AccountRole, allowedUnits: [], linkedEngineer: '' }))}
                className={INPUT}>
                <option value="admin">Admin（管理員）</option>
                <option value="user">User（測試人員）</option>
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">密碼<span className="text-red-500">*</span>（至少 8 個字元）</label>
            <input type="password" value={createForm.password}
              onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} className={INPUT} />
          </div>
          {!locked && createForm.role === 'admin' && (
            <UnitSelector allUnits={allUnits} selected={createForm.allowedUnits}
              onChange={v => setCreateForm(f => ({ ...f, allowedUnits: v }))} />
          )}
          {!locked && createForm.role === 'user' && (
            <EngineerSelector allEngineers={allEngineers} value={createForm.linkedEngineer}
              onChange={v => setCreateForm(f => ({ ...f, linkedEngineer: v }))} />
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={handleCreate} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">確認新增</button>
          <button type="button" onClick={() => setCreateTarget(null)} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">取消</button>
        </div>
      </div>
    )
  }

  const editFormPanel = (user: SafeUser) => (
    <div className="p-3 border border-orange-200 rounded-lg bg-orange-50">
      <p className="text-xs font-medium text-orange-800 mb-2">編輯帳號：{user.username}</p>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">顯示名稱</label>
          <input type="text" value={editForm.displayName} placeholder={user.displayName}
            onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} className={INPUT} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">新密碼（留空表示不修改）</label>
          <input type="password" value={editForm.password} placeholder="至少 8 個字元"
            onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} className={INPUT} />
        </div>
        {user.role === 'admin' && (
          <UnitSelector allUnits={allUnits} selected={editForm.allowedUnits}
            onChange={v => setEditForm(f => ({ ...f, allowedUnits: v }))} />
        )}
        {user.role === 'user' && (
          <EngineerSelector allEngineers={allEngineers} value={editForm.linkedEngineer}
            onChange={v => setEditForm(f => ({ ...f, linkedEngineer: v }))} />
        )}
        <VtmsPermissions value={editForm} onChange={v => setEditForm(f => ({ ...f, ...v }))} />
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={handleEdit} className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600">確認更新</button>
        <button type="button" onClick={() => setEditTarget(null)} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">取消</button>
      </div>
    </div>
  )

  /** 人員列右側的帳號欄 */
  const accountCell = (row: PersonRow) => {
    const { engineer, account } = row
    if (!account) {
      return (
        <button type="button" onClick={() => openCreate({ kind: 'engineer', engineerValue: engineer.value })}
          className="flex items-center gap-1 text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-500 hover:bg-gray-50 hover:text-gray-700">
          <UserPlus size={12} />建立帳號
        </button>
      )
    }
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-xs text-gray-700 truncate">{account.username}</span>
            <RoleBadge role={account.role} />
            {!account.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">已停用</span>}
          </div>
          {account.lastLoginAt && (
            <div className="text-xs text-gray-400">上次登入 {new Date(account.lastLoginAt).toLocaleDateString('zh-TW')}</div>
          )}
        </div>
        {accountActions(account)}
      </div>
    )
  }

  const engineerRow = (unitId: string, unitValue: string, row: PersonRow) => {
    const eng = row.engineer
    const editing = editKeys[eng.id] !== undefined
    return (
      <div key={eng.id} className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <input className="border rounded px-2 py-0.5 text-sm flex-1" value={editKeys[eng.id]}
                onChange={e => setEditKeys(k => ({ ...k, [eng.id]: e.target.value }))} />
              <button type="button" onClick={() => handleRename(unitId, eng.id, editKeys[eng.id].trim())}
                className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded">確認</button>
              <button type="button" onClick={() => clearErr(setEditKeys, eng.id)}
                className="text-xs px-2 py-0.5 border rounded">取消</button>
            </>
          ) : (
            <>
              <input type="color" className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
                title="自訂人員色（甘特圖 bar 內裡與左欄徽章）"
                value={draftColors[eng.id] ?? eng.color ?? resolveEngineerColor(eng.value, unitValue, options)}
                onChange={e => setDraftColors(d => ({ ...d, [eng.id]: e.target.value }))}
                onBlur={() => {
                  const draft = draftColors[eng.id]
                  if (draft === undefined) return
                  const base = eng.color ?? resolveEngineerColor(eng.value, unitValue, options)
                  if (draft.toLowerCase() !== base.toLowerCase()) void handleSetColor(unitId, eng.id, draft)
                  clearDraftColor(eng.id)
                }} />
              {eng.color && (
                <button type="button" onMouseDown={() => clearDraftColor(eng.id)}
                  onClick={() => { void handleSetColor(unitId, eng.id, null); clearDraftColor(eng.id) }}
                  className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50 text-gray-500">還原</button>
              )}
              <span className={`flex-1 text-sm ${!eng.isActive ? 'line-through text-gray-400' : ''}`}>{eng.label}</span>
              <button type="button" onClick={() => setEditKeys(k => ({ ...k, [eng.id]: eng.label }))}
                className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50">編輯</button>
              <button type="button" onClick={() => handleToggle(unitId, eng.id, !eng.isActive)}
                className={`text-xs px-2 py-0.5 rounded ${eng.isActive ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                {eng.isActive ? '停用' : '啟用'}
              </button>
              <button type="button" onClick={() => handleRemove(unitId, eng.id)}
                className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">刪除</button>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              {accountCell(row)}
            </>
          )}
        </div>
        {deleteErrors[eng.id] && <p className="text-xs text-red-500 pl-8">{deleteErrors[eng.id]}</p>}
        {actionErrors[eng.id] && <p className="text-xs text-red-500 pl-8">{actionErrors[eng.id]}</p>}
        {row.account && editTarget?.id === row.account.id && <div className="pl-8 pt-1">{editFormPanel(row.account)}</div>}
        {createTarget?.kind === 'engineer' && createTarget.engineerValue === eng.value && <div className="pl-8 pt-1">{createFormPanel()}</div>}
      </div>
    )
  }

  const adminRow = (user: SafeUser, note?: ReactNode) => (
    <div key={user.id}>
      {editTarget?.id === user.id ? editFormPanel(user) : (
        <div className="flex items-center gap-3 py-2 px-3 border rounded-lg bg-white">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800">{user.displayName}</span>
              <RoleBadge role={user.role} />
              {!user.isActive && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">已停用</span>}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              帳號：{user.username}
              {user.lastLoginAt && ` ・ 上次登入：${new Date(user.lastLoginAt).toLocaleDateString('zh-TW')}`}
            </div>
            {user.role === 'admin' && (
              <div className="text-xs text-gray-500 mt-0.5">
                管轄單位：{!user.allowedUnits || user.allowedUnits.length === 0
                  ? <span className="text-green-600">全部</span>
                  : <span className="text-blue-600">{user.allowedUnits.join('、')}</span>}
              </div>
            )}
            {note}
          </div>
          {user.role !== 'super_admin' && accountActions(user)}
        </div>
      )}
    </div>
  )

  if (loading) return <p className="text-sm text-gray-400">載入中...</p>

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-1">人員</h3>
      <p className="text-xs text-gray-400 mb-3">
        名冊依測試單位分組；右側為該人員的登入帳號。人員色預設由所屬單位色衍生，按「還原」回到預設。
      </p>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5 mb-3">{error}</p>}
      {success && <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-1.5 mb-3">{success}</p>}

      {/* ── 上半：依單位分組的人員 ── */}
      <div className="space-y-6">
        {view.units.map(unit => (
          <div key={unit.unitId} className="border rounded p-3">
            <p className="font-medium text-sm text-gray-600 mb-2">{unit.unitLabel}</p>
            <div className="space-y-1 mb-2">
              {unit.rows.map(row => engineerRow(unit.unitId, unit.unitValue, row))}
            </div>
            <div className="flex gap-2">
              <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名"
                value={newNames[unit.unitId] ?? ''}
                onChange={e => setNewNames(n => ({ ...n, [unit.unitId]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void handleAdd(unit.unitId) }} />
              <button type="button" onClick={() => handleAdd(unit.unitId)}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
            </div>
            {addErrors[unit.unitId] && <p className="text-xs text-red-500 mt-1">{addErrors[unit.unitId]}</p>}
          </div>
        ))}
      </div>

      {/* ── 下半：管理帳號 ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-700">管理帳號</h4>
          <button type="button" onClick={() => openCreate({ kind: 'admin' })}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">＋ 新增管理帳號</button>
        </div>
        {createTarget?.kind === 'admin' && createFormPanel()}
        <div className="space-y-2">
          {view.adminAccounts.map(u => adminRow(u))}
        </div>
      </div>

      {/* ── 未對應人員的帳號：不能讓它們消失 ── */}
      {view.orphanAccounts.length > 0 && (
        <div className="mt-8">
          <h4 className="font-semibold text-gray-700 mb-1">未對應人員的帳號</h4>
          <p className="text-xs text-gray-400 mb-3">這些 User 帳號指到的測試人員不存在，或該人員已被另一個帳號對應。請編輯重選對應人員，或停用。</p>
          <div className="space-y-2">
            {view.orphanAccounts.map(({ user, reason }) => adminRow(user, (
              <div className="text-xs text-red-500 mt-0.5">
                {reason === 'duplicate'
                  ? `重複對應：${user.linkedEngineer} 已有另一個帳號`
                  : `對應人員不存在：${user.linkedEngineer || '未設定'}`}
              </div>
            )))}
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger ?? true}
        onConfirm={() => { const s = confirmState; setConfirmState(null); void s?.run() }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}
