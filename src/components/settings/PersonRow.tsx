// src/components/settings/PersonRow.tsx
//
// 人員頁的一列。固定欄寬的 grid，每列同一個 template，所以「編輯」永遠在同一條
// 垂直線、「停用／啟用」也是。動作區用 opacity 隱藏（佔位不變），滑過與鍵盤
// 聚焦都會顯示。色塊點了直接選色，沒有還原。
import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveEngineerColor, resolveUnitColor, readableTextColor } from '../../lib/colors'
import { roleLabel, type Person } from '../../lib/peopleRows'
import { formatDateTime } from '../../lib/dateFormat'

// 設定頁容器 768px，扣掉內距約 680px；姓名保底 140px，單位籤 `auto` 依實際籤數，帳號 190px，動作各 56px
export const PEOPLE_GRID = 'grid grid-cols-[28px_minmax(140px,1fr)_auto_190px_56px_56px] items-center gap-2 min-w-[600px]'

const ACTION_BTN = 'text-xs px-1.5 py-1 rounded border transition-colors w-full'

interface Props {
  person: Person
  variant: 'active' | 'inactive'
  /** vauth 模式下名冊、角色、單位、帳號啟用狀態都由入口頁管理，停用／啟用與建立帳號要隱藏 */
  authProvider: 'local' | 'vauth'
  onEdit: (p: Person) => void
  onToggleActive: (p: Person) => void
  onColorChange: (p: Person, color: string) => void
  onCreateAccount: (p: Person) => void
}

export function PersonRow({ person, variant, authProvider, onEdit, onToggleActive, onColorChange, onCreateAccount }: Props) {
  const { options } = useOptionsStore()
  const [draftColor, setDraftColor] = useState<string | null>(null)
  const first = person.memberships[0]
  const baseColor = first
    ? (first.engineer.color ?? resolveEngineerColor(person.name, first.unitValue, options))
    : '#94a3b8'
  const isSuperAdmin = person.account?.role === 'super_admin'
  const inactive = variant === 'inactive'

  return (
    <div className={`${PEOPLE_GRID} group px-3 py-1.5 rounded-lg hover:bg-slate-50`}>
      {/* 色塊 */}
      {first ? (
        <input
          type="color"
          aria-label={`${person.label} 的顏色`}
          className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
          value={draftColor ?? baseColor}
          onChange={e => setDraftColor(e.target.value)}
          onBlur={() => {
            if (draftColor && draftColor.toLowerCase() !== baseColor.toLowerCase()) onColorChange(person, draftColor)
            setDraftColor(null)
          }}
        />
      ) : <span className="w-6 h-6 inline-block" />}

      {/* 姓名 */}
      <div className="min-w-0">
        <span className={`text-sm truncate block ${inactive ? 'line-through text-gray-400' : 'text-gray-800'}`} title={person.name}>
          {person.label}
        </span>
        {!inactive && person.memberships.length > 0 && !person.rosterActive && (
          <span className="text-xs text-amber-600">名冊停用</span>
        )}
      </div>

      {/* 單位籤 */}
      <div className="flex flex-wrap gap-1 min-w-0">
        {person.memberships.map(m => {
          const bg = resolveUnitColor(m.unitValue, options)
          return (
            <span key={m.engineer.id} className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: bg, color: readableTextColor(bg) }}>
              {m.unitLabel}
            </span>
          )
        })}
      </div>

      {/* 帳號 */}
      <div className="min-w-0 text-xs">
        {person.account ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded font-medium ${
              !person.account.isActive ? 'bg-gray-100 text-gray-500'
                : person.account.role === 'super_admin' ? 'bg-purple-100 text-purple-700'
                : person.account.role === 'admin' ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'}`}>
              {roleLabel(person.account.role)}
            </span>
            {!person.account.isActive && <span className="text-red-500">已停用</span>}
            {person.account.lastLoginAt && (
              <span className="text-gray-400">上次登入 {formatDateTime(person.account.lastLoginAt).slice(0, 10)}</span>
            )}
          </div>
        ) : authProvider !== 'vauth' ? (
          <button type="button" onClick={() => onCreateAccount(person)}
            className="flex items-center gap-1 px-2 py-1 border border-dashed border-gray-300 rounded text-gray-500 hover:bg-white hover:text-gray-700">
            <UserPlus size={12} />新增帳號
          </button>
        ) : null}
      </div>

      {/* 動作：佔位不變，滑過或聚焦才顯示。super_admin 名冊列仍可編輯（可能是後端要求的 linkedEngineer），
          但停用／啟用一律走 super_admin 帳號自己的流程，這裡不提供。 */}
      {(person.memberships.length > 0 || !isSuperAdmin) ? (
        <button type="button" onClick={() => onEdit(person)}
          className={`${ACTION_BTN} border-gray-300 hover:bg-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100`}>
          編輯
        </button>
      ) : <span />}
      {!isSuperAdmin && authProvider !== 'vauth' ? (
        <button type="button" onClick={() => onToggleActive(person)}
          className={`${ACTION_BTN} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 ${
            inactive ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                     : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}>
          {inactive ? '啟用' : '停用'}
        </button>
      ) : <span />}
    </div>
  )
}
