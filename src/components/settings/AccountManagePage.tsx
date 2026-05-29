import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useAuditStore } from '../../store/auditStore'
import { api } from '../../lib/api'
import type { User } from '../../types'

type SafeUser = Omit<User, 'passwordHash'>

const AccountManagePage: React.FC = () => {
  const { role, username: currentUsername, displayName: currentDisplayName } = useAuthStore()
  const { addLog } = useAuditStore()

  const [users, setUsers] = useState<SafeUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [actionError, setActionError] = useState('')

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers()
      setUsers(data)
    } catch (err) {
      setActionError(`載入失敗：${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleEdit = (u: SafeUser) => {
    setEditingId(u.id)
    setDisplayNameInput(u.displayName || u.username)
    setNewPassword('')
    setConfirmPassword('')
    setPwError('')
    setActionError('')
  }

  const handleSave = async (u: SafeUser) => {
    if (newPassword && newPassword !== confirmPassword) {
      setPwError('兩次密碼不一致')
      return
    }
    if (newPassword && newPassword.length < 8) {
      setPwError('密碼至少需要 8 個字元')
      return
    }
    try {
      const updates: { displayName?: string; password?: string } = {
        displayName: displayNameInput,
      }
      if (newPassword) updates.password = newPassword
      await api.updateUser(u.id, updates)
      addLog({
        operator: currentDisplayName || currentUsername,
        action: 'UPDATE',
        field: `帳號(${u.username}) 顯示名稱/密碼`,
      })
      await fetchUsers()
      setEditingId(null)
    } catch (err) {
      setActionError(`儲存失敗：${String(err)}`)
    }
  }

  const handleToggleActive = async (u: SafeUser) => {
    if (u.role === 'super_admin') return
    try {
      if (u.isActive) {
        await api.disableUser(u.id)
        addLog({
          operator: currentDisplayName || currentUsername,
          action: 'UPDATE',
          field: `帳號(${u.username}) 停用`,
        })
      } else {
        await api.enableUser(u.id)
        addLog({
          operator: currentDisplayName || currentUsername,
          action: 'UPDATE',
          field: `帳號(${u.username}) 啟用`,
        })
      }
      await fetchUsers()
    } catch (err) {
      setActionError(`操作失敗：${String(err)}`)
    }
  }

  if (role !== 'super_admin') {
    return <div className="p-8 text-center text-gray-500">⚠️ 此功能僅限 Super Admin 使用</div>
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">載入中…</div>
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">👥 帳號管理</h2>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="px-4 py-3 text-left">帳號</th>
              <th className="px-4 py-3 text-left">顯示名稱</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <React.Fragment key={u.id}>
                <tr className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700">{u.username}</td>
                  <td className="px-4 py-3 text-gray-800">{u.displayName || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.role === 'super_admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {u.isActive ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleEdit(u)}
                        className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100"
                      >
                        ✏️ 編輯
                      </button>
                      {u.role !== 'super_admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u)}
                          className={`px-3 py-1 text-xs rounded-lg border ${
                            u.isActive
                              ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                              : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          }`}
                        >
                          {u.isActive ? '🚫 停用' : '✅ 啟用'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* 展開編輯列 */}
                {editingId === u.id && (
                  <tr className="border-t bg-blue-50">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">顯示名稱</label>
                          <input
                            type="text"
                            value={displayNameInput}
                            onChange={(e) => setDisplayNameInput(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">新密碼（留空不修改）</label>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => { setNewPassword(e.target.value); setPwError('') }}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">確認新密碼</label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => { setConfirmPassword(e.target.value); setPwError('') }}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                          {pwError && (
                            <p className="text-red-500 text-xs mt-1">{pwError}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          type="button"
                          onClick={() => handleSave(u)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                        >
                          💾 儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm border"
                        >
                          取消
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AccountManagePage