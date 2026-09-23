import { withBase } from '../../lib/basePath';
import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { useAuthStore } from '../../store/authStore'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../store/toastStore'
import { syncVtmsLink } from '../../lib/vtmsLinkAfterSave'
import { MIN_DATE, FIELD_LIMITS } from '../../constants'
import { useEscapeKey } from '../shared/useEscapeKey'
import { SegmentedControl } from '../shared/SegmentedControl'
import type { Schedule, ScheduleFormValues, VtmsTestPlan, VtmsProjectCheck } from '../../types'

interface Props {
  isOpen: boolean
  schedule: Schedule | null
  onClose: () => void
  onSaved?: (saved: { isCompleted: boolean }) => void
}

/**
 * 從 API 錯誤取出後端 422 驗證的逐欄位錯誤(例如歷史資料的任務描述超過
 * 500 字)。非 422 或沒有欄位錯誤時回傳 null,交由既有的通用訊息處理。
 */
export function serverFieldErrors(err: unknown): Partial<Record<keyof ScheduleFormValues, string>> | null {
  if (!(err instanceof ApiError) || err.status !== 422 || !err.fieldErrors) return null
  return err.fieldErrors as Partial<Record<keyof ScheduleFormValues, string>>
}

/**
 * 需求四：表單保底顯示孤兒值。人員異動（停用／改名／刪除）可能讓既有排程
 * 的 testEngineer 找不到對應的現行人員選項，此時下拉會誤導使用者「這格
 * 沒填」。只在編輯既有排程、testEngineer 非空、且不在現行選項中時，額外
 * 插入一個標註「已停用或已刪除」的選項並讓它被選中；value 為原值，因此
 * 不動下拉直接儲存時會原樣寫回，換人與否是使用者的有意識決定。
 * 新增排程時 testEngineer 恆為空字串，isEditingExisting 為 false 時也不插入。
 */
export function buildEngineerSelectOptions<T extends { value: string; label: string }>(
  activeEngineers: T[],
  testEngineer: string,
  isEditingExisting: boolean,
): (T | { value: string; label: string })[] {
  if (!isEditingExisting || !testEngineer) return activeEngineers
  if (activeEngineers.some(e => e.value === testEngineer)) return activeEngineers
  return [...activeEngineers, { value: testEngineer, label: `${testEngineer}（已停用或已刪除）` }]
}

const EMPTY: ScheduleFormValues = {
  category: '', projectName: '', taskDescription: '',
  testUnit: '', testEngineer: '', timeResource: '',
  startDate: null, endDate: null,
  requiredPersonnel: '', testReport: '',
  isCompleted: false, isDelayed: false, isCancelled: false, delayReason: '',
  device: '',
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('/').map(Number)
  return new Date(y, m - 1, d)
}
function formatDate(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

export function ScheduleFormModal({ isOpen, schedule, onClose, onSaved }: Props) {
  useEscapeKey(isOpen, onClose)
  const { add, update, replaceInStore } = useScheduleStore()
  const { options } = useOptionsStore()
  const { role, canLinkVtms } = useAuthStore()
  const isUser = role === 'user'
  // 與後端 /vtms-project-check 的角色門檻一致（admin / super_admin），其他角色不查也不顯示
  const canCheckPdn = role === 'admin' || role === 'super_admin'
  const [form, setForm] = useState<ScheduleFormValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof ScheduleFormValues, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [vtmsPlans, setVtmsPlans] = useState<VtmsTestPlan[]>([])
  const [vtmsPlanId, setVtmsPlanId] = useState<string>('')

  // PDN 對 VTMS 的檢查結果。只提示，不影響 validate()，不擋儲存。
  const [pdnCheck, setPdnCheck] = useState<{ pdn: string; result: VtmsProjectCheck | 'loading' } | null>(null)

  const runPdnCheck = (raw: string) => {
    const pdn = raw.trim()
    if (!canCheckPdn || !pdn) { setPdnCheck(null); return }
    if (pdnCheck && pdnCheck.pdn === pdn && pdnCheck.result !== 'loading') return
    setPdnCheck(cur => (cur && cur.pdn === pdn && cur.result !== 'loading') ? cur : { pdn, result: 'loading' })
    api.checkVtmsProject(pdn)
      .catch((): VtmsProjectCheck => ({ status: 'unavailable' }))
      .then(result => setPdnCheck(cur => (cur && cur.pdn === pdn) ? { pdn, result } : cur))
  }

  useEffect(() => {
    if (!canLinkVtms) return
    const token = sessionStorage.getItem('vsms-session-token')
    const headers: Record<string, string> = {}
    if (token) headers['X-Vsms-Session'] = token
    fetch(withBase('/api/schedules/vtms-plans'), { credentials: 'include', headers })
      .then(r => r.ok ? r.json() : [])
      .then(setVtmsPlans)
      .catch(() => {})
  }, [canLinkVtms])

  useEffect(() => {
    if (!isOpen) return
    setSubmitError('')
    if (schedule) {
      setForm({
        category: schedule.category, projectName: schedule.projectName,
        taskDescription: schedule.taskDescription, testUnit: schedule.testUnit,
        testEngineer: schedule.testEngineer, timeResource: String(schedule.timeResource),
        startDate: parseDate(schedule.startDate), endDate: parseDate(schedule.endDate),
        requiredPersonnel: schedule.requiredPersonnel, testReport: schedule.testReport,
        isCompleted: schedule.isCompleted, isDelayed: schedule.isDelayed,
        isCancelled: schedule.isCancelled,
        delayReason: schedule.delayReason,
        device: schedule.device ?? '',
      })
      setVtmsPlanId(schedule.vtmsPlanId ?? '')
      runPdnCheck(schedule.projectName)
    } else {
      setForm(EMPTY)
      setVtmsPlanId('')
      setPdnCheck(null)
    }
    setErrors({})
  }, [schedule, isOpen])

  const activeCategories = options.categories.filter(c => c.isActive)
  const activeUnits = options.testUnits.filter(u => u.isActive)
  const activeDevices = (options.devices ?? []).filter(d => d.isActive)
  const activeEngineers = form.testUnit
    ? (activeUnits.find(u => u.value === form.testUnit)?.engineers.filter(e => e.isActive) ?? [])
    : []
  // ★ 需求四：孤兒值保底 —— 已停用或已刪除的人員仍要在編輯既有排程時可見
  const engineerOptions = buildEngineerSelectOptions(activeEngineers, form.testEngineer, !!schedule)

  const validate = (): boolean => {
    const e: typeof errors = {}

    if (isUser) {
      // USER can only edit testReport, isCompleted, isDelayed, delayReason
      if (form.isDelayed && !form.delayReason.trim()) e.delayReason = '請填寫延遲原因'
      setErrors(e)
      return Object.keys(e).length === 0
    }

    // admin / super_admin: full validation
    if (!form.category) e.category = '工作類別為必填'
    if (!form.projectName.trim()) e.projectName = 'PDN Number 為必填'
    if (!form.taskDescription.trim()) e.taskDescription = '工作內容為必填'
    if (!form.testUnit) e.testUnit = '測試單位為必填'
    if (!form.testEngineer) e.testEngineer = '測試人員為必填'
    const trNum = Number(form.timeResource)
    if (!form.timeResource || isNaN(trNum) || !Number.isInteger(trNum) || trNum < 1)
      e.timeResource = '時間資源須為正整數'
    if (!form.requiredPersonnel.trim()) e.requiredPersonnel = '需求人員為必填'
    if (!form.startDate) e.startDate = '起始日期為必填'
    if (!form.endDate) e.endDate = '完成日期為必填'
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      e.endDate = '完成日期不可早於起始日期'
    if (form.isDelayed && !form.delayReason.trim()) e.delayReason = '請填寫延遲原因'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSubmitting(true)
    const data = {
      category: form.category, projectName: form.projectName.trim(),
      taskDescription: form.taskDescription.trim(), testUnit: form.testUnit,
      testEngineer: form.testEngineer, timeResource: Number(form.timeResource),
      startDate: formatDate(form.startDate!), endDate: formatDate(form.endDate!),
      requiredPersonnel: form.requiredPersonnel.trim(), testReport: form.testReport.trim(),
      isCompleted: form.isCompleted, isDelayed: form.isDelayed,
      ...(isUser ? {} : { isCancelled: form.isCancelled }),
      delayReason: form.isDelayed ? form.delayReason.trim() : '',
      ...(isUser ? {} : { device: form.device }),
    }
    try {
      const saved = schedule ? await update(schedule.id, data) : await add(data)
      // 關聯只能走 PATCH /:id/vtms-link；失敗時排程已經存好，分開講。
      const link = await syncVtmsLink({
        canLinkVtms, savedId: saved.id, previous: schedule?.vtmsPlanId, next: vtmsPlanId,
        setLink: api.setVtmsLink,
      })
      if (link.status === 'linked') replaceInStore(link.schedule)
      else if (link.status === 'failed') toast.error('排程已儲存，但 VTMS 關聯失敗，請重新開啟排程再試')
      onSaved?.({ isCompleted: data.isCompleted })
      onClose()
    } catch (err) {
      const fieldErrs = serverFieldErrors(err)
      if (fieldErrs) {
        setErrors(fieldErrs)
        setSubmitError('儲存失敗：請修正欄位錯誤後再試')
      } else if (err instanceof ApiError && err.status === 403) {
        setSubmitError('您只能編輯指派給自己的排程')
      } else {
        setSubmitError('儲存失敗，請稍後再試')
      }
    } finally { setSubmitting(false) }
  }

  const field = (label: string, key: keyof ScheduleFormValues, element: React.ReactNode, required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {element}
      {errors[key] && <p className="text-red-500 text-xs mt-1">{errors[key]}</p>}
    </div>
  )

  // 唯讀摘要用的顯示字串
  const roRow = (label: string, value: string) => (
    <div className="flex gap-2 min-w-0">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium truncate" title={value}>{value || '—'}</span>
    </div>
  )

  const section = (title: string, children: React.ReactNode) => (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 tracking-wide mb-2">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )

  const inputCls = (locked: boolean) =>
    `w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
     ${locked ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200' : 'border-gray-300'}`

  const pdnHint = () => {
    if (!canCheckPdn) return null
    if (!pdnCheck) return null
    const r = pdnCheck.result
    if (r === 'loading') return <p className="text-xs text-gray-400 mt-1">查詢 VTMS 中…</p>
    if (r.status === 'found') {
      return <p className="text-xs text-green-700 mt-1">VTMS 已建立此專案（{r.planCount} 個測試計畫）</p>
    }
    if (r.status === 'not_found') {
      return (
        <p className="text-xs text-amber-700 mt-1">
          VTMS 尚未建立此專案{r.similar.length > 0 ? `。相近：${r.similar.join('、')}` : ''}
        </p>
      )
    }
    return <p className="text-xs text-gray-400 mt-1">目前無法查詢 VTMS</p>
  }

  // 生命週期：進行中／已完成／已取消 三者互斥（後端也擋 Cancelled+Completed）。
  //
  // 「延遲」刻意不放進這組選項。實際資料裡有 37 筆同時是 Completed 與 Delayed
  // （做完了，但當初有延遲）、6 筆同時是 Cancelled 與 Delayed，後端也只禁止
  // Cancelled+Completed 這一組。把延遲併進單選會讓那 43 筆在下次儲存時
  // 靜默丟掉其中一個旗標，所以它維持成獨立的勾選。
  const lifecycle: 'active' | 'completed' | 'cancelled' =
    form.isCancelled ? 'cancelled' : form.isCompleted ? 'completed' : 'active'
  const setLifecycle = (v: 'active' | 'completed' | 'cancelled') =>
    setForm(f => ({ ...f, isCompleted: v === 'completed', isCancelled: v === 'cancelled' }))

  const vtmsLocked = !!vtmsPlanId

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{schedule ? '編輯工作排程' : '新增工作排程'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-5">

          {/* 測試人員只能改「進度」那一段。改版前這裡是九個 disabled 的灰欄位，
              要捲過一整面灰色才找得到唯一能打字的地方。改成唯讀摘要卡。 */}
          {isUser ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 tracking-wide">排程內容</h3>
                <span className="text-xs text-gray-400">由管理者維護，唯讀</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {roRow('PDN', form.projectName)}
                {roRow('工作類別', form.category)}
                {roRow('測試單位', form.testUnit)}
                {roRow('測試人員', form.testEngineer)}
                {roRow('起始日期', form.startDate ? formatDate(form.startDate) : '')}
                {roRow('完成日期', form.endDate ? formatDate(form.endDate) : '')}
                {roRow('時間資源', form.timeResource ? `${form.timeResource} 天` : '')}
                {roRow('需求人員', form.requiredPersonnel)}
              </div>
              {form.taskDescription && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-sm">
                  <span className="text-gray-500">工作內容　</span>
                  <span className="text-gray-800">{form.taskDescription}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {section('案件資訊', <>
                <div className="grid sm:grid-cols-2 gap-4">
                  {field('工作類別', 'category', (
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className={inputCls(false)}>
                      <option value="">請選擇</option>
                      {activeCategories.map(c => <option key={c.id} value={c.value}>{c.label}</option>)}
                    </select>
                  ), true)}
                  {field('PDN Number', 'projectName', (
                    <>
                      <input type="text" maxLength={FIELD_LIMITS.PROJECT_NAME} value={form.projectName}
                        onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
                        onBlur={e => runPdnCheck(e.target.value)}
                        className={inputCls(false)} />
                      {pdnHint()}
                    </>
                  ), true)}
                </div>
                {field('工作內容', 'taskDescription', (
                  <textarea maxLength={FIELD_LIMITS.TASK_DESCRIPTION} rows={2} value={form.taskDescription}
                    onChange={e => setForm(f => ({ ...f, taskDescription: e.target.value }))}
                    className={inputCls(false)} />
                ), true)}
                {activeDevices.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {field('設備', 'device', (
                      <select value={form.device} onChange={e => setForm(f => ({ ...f, device: e.target.value }))}
                        className={inputCls(false)}>
                        <option value="">（無）</option>
                        {activeDevices.map(d => <option key={d.id} value={d.value}>{d.label}</option>)}
                      </select>
                    ))}
                  </div>
                )}
              </>)}

              {section('指派與工時', (
                <div className="grid sm:grid-cols-2 gap-4">
                  {field('測試單位', 'testUnit', (
                    <select value={form.testUnit}
                      onChange={e => setForm(f => ({ ...f, testUnit: e.target.value, testEngineer: '' }))}
                      className={inputCls(false)}>
                      <option value="">請選擇</option>
                      {activeUnits.map(u => <option key={u.id} value={u.value}>{u.label}</option>)}
                    </select>
                  ), true)}
                  {field('測試人員', 'testEngineer', (
                    <select value={form.testEngineer}
                      onChange={e => setForm(f => ({ ...f, testEngineer: e.target.value }))}
                      disabled={!form.testUnit}
                      className={inputCls(!form.testUnit)}>
                      <option value="">請選擇</option>
                      {/* 孤兒選項沒有 id；同名人員的 value 也可能相同，因此用 id 當 key */}
                      {engineerOptions.map(e => (
                        <option key={'id' in e ? e.id : e.value} value={e.value}>{e.label}</option>
                      ))}
                    </select>
                  ), true)}
                  {field('需求人員', 'requiredPersonnel', (
                    <input type="text" maxLength={FIELD_LIMITS.REQUIRED_PERSONNEL} value={form.requiredPersonnel}
                      onChange={e => setForm(f => ({ ...f, requiredPersonnel: e.target.value }))}
                      className={inputCls(false)} />
                  ), true)}
                  {field('時間資源（工作天）', 'timeResource', (
                    <input type="number" min="1" step="1" value={form.timeResource}
                      onChange={e => setForm(f => ({ ...f, timeResource: e.target.value }))}
                      className={inputCls(false)} />
                  ), true)}
                </div>
              ))}

              {section('期間', (
                <div className="grid sm:grid-cols-2 gap-4">
                  {field('起始日期', 'startDate', (
                    <DatePicker selected={form.startDate}
                      onChange={(d: Date | null) => setForm(f => ({ ...f, startDate: d }))}
                      minDate={MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
                      className={inputCls(false)} />
                  ), true)}
                  {field('完成日期', 'endDate', (
                    <DatePicker selected={form.endDate}
                      onChange={(d: Date | null) => setForm(f => ({ ...f, endDate: d }))}
                      minDate={form.startDate ?? MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
                      className={inputCls(false)} />
                  ), true)}
                </div>
              ))}
            </>
          )}

          {section('進度', <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1">狀態</span>
                <SegmentedControl
                  ariaLabel="排程狀態"
                  size="md"
                  value={lifecycle}
                  onChange={setLifecycle}
                  options={[
                    { value: 'active',    label: '進行中', disabled: vtmsLocked,
                      title: vtmsLocked ? '已關聯 VTMS 測試計畫，完成狀態由 VTMS 控制' : undefined },
                    { value: 'completed', label: '已完成', disabled: vtmsLocked,
                      title: vtmsLocked ? '已關聯 VTMS 測試計畫，完成狀態由 VTMS 控制' : undefined },
                    { value: 'cancelled', label: '已取消', disabled: isUser,
                      title: isUser ? '取消排程需由管理者操作' : undefined },
                  ]}
                />
              </div>

              {/* 延遲是獨立的事實，可以與「已完成」或「已取消」並存 */}
              <label className={`flex items-center gap-2 mt-5 ${vtmsLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={form.isDelayed}
                  onChange={e => setForm(f => ({ ...f, isDelayed: e.target.checked }))}
                  disabled={vtmsLocked}
                  className={`w-4 h-4 rounded border-gray-300 accent-red-600 ${vtmsLocked ? 'cursor-not-allowed opacity-50' : ''}`} />
                <span className={`text-sm font-medium ${vtmsLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                  這筆排程有延遲
                </span>
              </label>

              {vtmsLocked && (
                <span className="text-xs text-gray-500 mt-5">完成與延遲由 VTMS 控制</span>
              )}
            </div>

            {form.isDelayed && field('延遲原因', 'delayReason', (
              <textarea maxLength={FIELD_LIMITS.DELAY_REASON} rows={2} value={form.delayReason}
                onChange={e => setForm(f => ({ ...f, delayReason: e.target.value }))}
                disabled={vtmsLocked}
                placeholder="請說明延遲原因…"
                className={inputCls(vtmsLocked)} />
            ), true)}

            {field('測試報告', 'testReport', (
              <textarea maxLength={FIELD_LIMITS.TEST_REPORT} rows={2} value={form.testReport}
                onChange={e => setForm(f => ({ ...f, testReport: e.target.value }))}
                className={inputCls(false)} />
            ))}

            {canLinkVtms && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">關聯 VTMS 測試計畫</label>
                <select value={vtmsPlanId} onChange={e => setVtmsPlanId(e.target.value)}
                  className={inputCls(false)}>
                  <option value="">— 不關聯 —</option>
                  {vtmsPlans
                    .filter(p =>
                      p.id === vtmsPlanId ||
                      (p.projectName === form.projectName.trim() &&
                       form.testEngineer !== '' &&
                       (p.assignees ?? []).includes(form.testEngineer))
                    )
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.projectName} / {p.name} [{p.status}]</option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  只列出 PDN 與測試人員都吻合的計畫。關聯之後完成與延遲改由 VTMS 決定。
                </p>
              </div>
            )}
          </>)}
        </div>
        <div className="flex items-center justify-between gap-2 p-4 border-t">
          {submitError
            ? <p className="text-sm text-red-600 flex-1">{submitError}</p>
            : <span />
          }
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
            <button type="button" onClick={handleSave} disabled={submitting}
              className="px-4 py-2 text-sm bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50">
              {submitting ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}