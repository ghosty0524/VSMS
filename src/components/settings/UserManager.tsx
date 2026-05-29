import { useState, useEffect, useMemo } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { useOptionsStore } from '../../store/optionsStore'
import type { User } from '../../types'

type SafeUser = Omit<User, 'passwordHash'>

export function UserManager() {
  const { displayName: currentDisplayName, username: currentUsername } = useAuthStore()
  const { addLog } = useAuditStore()
  const { options } = useOptionsStore()
  const operatorName = currentDisplayName || currentUsername || 'unknown'

  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editTarget, setEditTarget] = useState<SafeUser | null>(null)
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    role: 'admin' as 'admin' | 'user',
    allowedUnits: [] as string[],
    linkedEngineer: '',
  })
  const [editForm, setEditForm] = useState({
    displayName: '',
    password: '',
    role: 'admin' as 'admin' | 'user',
    allowedUnits: [] as string[],
    linkedEngineer: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const allUnits = useMemo(
    () => options.testUnits.filter(u => u.isActive).map(u => u.label).sort(),
    [options.testUnits]
  )

  const allEngineers = useMemo(
    () => options.testUnits
      .filter(u => u.isActive)
      .flatMap(u => (u.engineers as Array<{value: string; isActive: boolean}>)
        .filter(e => e.isActive)
        .map(e => e.value))
      .sort(),
    [options.testUnits]
  )

  const loadUsers = async () => {
    try {
      const data = await api.getUsers()
      setUsers(data)
    } catch {
      showMsg('載入帳號列表失敗', true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 3000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  const toggleUnit = (unit: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(unit)) {
      setter(current.filter(u => u !== unit))
    } else {
      setter([...current, unit])
    }
  }

  const handleAdd = async () => {
    if (!form.username.trim() || !form.password) { showMsg('帳號與密碼為必填', true); return }
    if (form.password.length < 8) { showMsg('密碼長度至少需要 8 個字元', true); return }
    if (form.role === 'user' && !form.linkedEngineer) { showMsg('User 角色必須選擇對應測試人員', true); return }
    try {
      await api.createUser({
        username: form.username.trim(),
        displayName: form.displayName.trim() || undefined,
        password: form.password,
        role: form.role,
        allowedUnits: form.role === 'admin' ? form.allowedUnits : [],
        linkedEngineer: form.role === 'user' ? form.linkedEngineer : '',
      })
      addLog({ operator: operatorName, action: 'CREATE', field: `新增帳號(${form.username.trim()}) 角色:${form.role}` })
      showMsg(`帳號 ${form.username} 已新增`)
      setForm({ username: '', displayName: '', password: '', role: 'admin', allowedUnits: [], linkedEngineer: '' })
      setShowAddForm(false)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '新增失敗', true)
    }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    try {
      await api.updateUser(editTarget.id, {
        displayName: editForm.displayName.trim() || undefined,
        password: editForm.password || undefined,
        allowedUnits: editTarget.role === 'admin' ? editForm.allowedUnits : [],
        linkedEngineer: editTarget.role === 'user' ? editForm.linkedEngineer : undefined,
      })
      addLog({ operator: operatorName, action: 'UPDATE', field: `帳號(${editTarget.username}) 更新` })
      showMsg(`帳號 ${editTarget.username} 已更新`)
      setEditTarget(null)
      setEditForm({ displayName: '', password: '', role: 'admin', allowedUnits: [], linkedEngineer: '' })
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '更新失敗', true)
    }
  }

  const handleDisable = async (user: SafeUser) => {
    if (!confirm(`確定要停用帳號 ${user.username}？`)) return
    try {
      await api.disableUser(user.id)
      addLog({ operator: operatorName, action: 'UPDATE', field: `帳號(${user.username}) 停用` })
      showMsg(`帳號 ${user.username} 已停用`)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '停用失敗', true)
    }
  }

  const handleEnable = async (user: SafeUser) => {
    if (!confirm(`確定要啟用帳號 ${user.username}？`)) return
    try {
      await api.enableUser(user.id)
      addLog({ operator: operatorName, action: 'UPDATE', field: `帳號(${user.username}) 啟用` })
      showMsg(`帳號 ${user.username} 已啟用`)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '啟用失敗', true)
    }
  }

  const handleDeletePermanent = async (user: SafeUser) => {
    if (!confirm(`⚠️ 確定要永久刪除帳號 ${user.username}？\n此操作無法復原！`)) return
    try {
      await api.deleteUserPermanent(user.id)
      addLog({ operator: operatorName, action: 'DELETE', field: `帳號(${user.username}) 永久刪除` })
      showMsg(`帳號 ${user.username} 已永久刪除`)
      await loadUsers()
    } catch (e: unknown) {
      showMsg((e as Error).message || '刪除失敗', true)
    }
  }

  const UnitSelector = ({
    selected,
    onChange,
  }: {
    selected: string[]
    onChange: (v: string[]) => void
  }) => {
    const isAll = selected.length === 0
    return (
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          管轄單位
          <span className="ml-1 text-gray-400">（不選 = 全部可存取）</span>
        </label>
        <div className="border border-gray-300 rounded p-2 bg-white space-y-1 max-h-36 overflow-y-auto">
          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
            <input
              type="checkbox"
              checked={isAll}
              onChange={() => onChange([])}
              className="w-3.5 h-3.5 accent-blue-600"
            />
            <span className="text-xs font-medium text-gray-700">全部單位（不限制）</span>
          </label>
          <div className="border-t border-gray-100 my-1" />
          {allUnits.map(unit => (
            <label key={unit} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
              <input
                type="checkbox"
                checked={selected.includes(unit)}
                onChange={() => {
                  if (isAll) {
                    onChange(allUnits.filter(u => u !== unit))
                  } else {
                    toggleUnit(unit, selected, onChange)
                  }
                }}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              <span className="text-xs text-gray-700">{unit}</span>
            </label>
          ))}
        </div>
        {!isAll && (
          <p className="text-xs text-blue-600 mt-1">
            已選：{selected.join('、')}
          </p>
        )}
      </div>
    )
  }

  const RoleSelector = ({
    value,
    onChange,
  }: {
    value: 'admin' | 'user'
    onChange: (v: 'admin' | 'user') => void
  }) => (
    <div>
      <label className="block text-xs text-gray-600 mb-1">角色</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as 'admin' | 'user')}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="admin">Admin（管理員）</option>
        <option value="user">User（測試人員）</option>
      </select>
    </div>
  )

  const EngineerSelector = ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <div>
      <label className="block text-xs text-gray-600 mb-1">
        對應測試人員 <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— 請選擇 —</option>
        {allEngineers.map(e => (
          <option key={e} value={e}>{e}</option>
        ))}
      </select>
    </div>
  )

  if (loading) return <p className="text-sm text-gray-400">載入中...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">帳號管理</h3>
        <button type="button" onClick={() => setShowAddForm((o) => !o)}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
          ＋ 新增管理帳號
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5 mb-3">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-1.5 mb-3">{success}</p>
      )}

      {showAddForm && (
        <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
          <h4 className="text-sm font-medium text-blue-800 mb-3">新增 Admin 帳號</h4>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                帳號（username）<span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="4~20 字元，英數字"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">顯示名稱（選填）</label>
              <input type="text" value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="顯示用名稱"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <RoleSelector
              value={form.role}
              onChange={(v) => setForm(f => ({ ...f, role: v, allowedUnits: [], linkedEngineer: '' }))}
            />
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                密碼<span className="text-red-500">*</span>（至少 8 個字元）
              </label>
              <input type="password" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {form.role === 'admin' && (
              <UnitSelector
                selected={form.allowedUnits}
                onChange={(v) => setForm(f => ({ ...f, allowedUnits: v }))}
              />
            )}
            {form.role === 'user' && (
              <EngineerSelector
                value={form.linkedEngineer}
                onChange={(v) => setForm(f => ({ ...f, linkedEngineer: v }))}
              />
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={handleAdd}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              確認新增
            </button>
            <button type="button" onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id}>
            {editTarget?.id === user.id ? (
              <div className="p-3 border border-orange-200 rounded-lg bg-orange-50">
                <p className="text-xs font-medium text-orange-800 mb-2">編輯帳號：{user.username}</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">顯示名稱</label>
                    <input type="text" value={editForm.displayName}
                      onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                      placeholder={user.displayName}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">新密碼（留空表示不修改）</label>
                    <input type="password" value={editForm.password}
                      onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="至少 8 個字元"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  {editTarget?.role === 'admin' && (
                    <UnitSelector
                      selected={editForm.allowedUnits}
                      onChange={(v) => setEditForm(f => ({ ...f, allowedUnits: v }))}
                    />
                  )}
                  {editTarget?.role === 'user' && (
                    <EngineerSelector
                      value={editForm.linkedEngineer}
                      onChange={(v) => setEditForm(f => ({ ...f, linkedEngineer: v }))}
                    />
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={handleEdit}
                    className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600">
                    確認更新
                  </button>
                  <button type="button" onClick={() => setEditTarget(null)}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2 px-3 border rounded-lg bg-white">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{user.displayName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      user.role === 'super_admin'
                        ? 'bg-purple-100 text-purple-700'
                        : user.role === 'user'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {user.role === 'super_admin' ? 'Super Admin' : user.role === 'user' ? 'User' : 'Admin'}
                    </span>
                    {!user.isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">已停用</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    帳號：{user.username}
                    {user.lastLoginAt && ` ・ 上次登入：${new Date(user.lastLoginAt).toLocaleDateString('zh-TW')}`}
                  </div>
                  {user.role !== 'super_admin' && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      管轄單位：
                      {!user.allowedUnits || user.allowedUnits.length === 0
                        ? <span className="text-green-600">全部</span>
                        : <span className="text-blue-600">{user.allowedUnits.join('、')}</span>
                      }
                    </div>
                  )}
                  {user.role === 'user' && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      對應人員：
                      {user.linkedEngineer
                        ? <span className="text-green-600">{user.linkedEngineer}</span>
                        : <span className="text-red-400">未設定</span>
                      }
                    </div>
                  )}
                </div>

                {user.role !== 'super_admin' && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {user.isActive ? (
                      <>
                        <button type="button"
                          onClick={() => {
                            setEditTarget(user)
                            setEditForm({
                              displayName: user.displayName,
                              password: '',
                              role: user.role as 'admin' | 'user',
                              allowedUnits: user.allowedUnits ?? [],
                              linkedEngineer: user.linkedEngineer ?? '',
                            })
                          }}
                          className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                          編輯
                        </button>
                        <button type="button" onClick={() => handleDisable(user)}
                          className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">
                          停用
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => handleEnable(user)}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                          啟用
                        </button>
                        <button type="button" onClick={() => handleDeletePermanent(user)}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                          ⚠️ 永久刪除
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
