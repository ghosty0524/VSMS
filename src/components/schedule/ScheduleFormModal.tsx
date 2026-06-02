import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { useAuthStore } from '../../store/authStore'
import { ApiError } from '../../lib/api'
import { MIN_DATE, FIELD_LIMITS } from '../../constants'
import type { Schedule, ScheduleFormValues } from '../../types'

interface Props {
  isOpen: boolean
  schedule: Schedule | null
  onClose: () => void
}

const EMPTY: ScheduleFormValues = {
  category: '', projectName: '', taskDescription: '',
  testUnit: '', testEngineer: '', timeResource: '',
  startDate: null, endDate: null,
  requiredPersonnel: '', testReport: '',
  isCompleted: false, isDelayed: false, delayReason: '',
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

export function ScheduleFormModal({ isOpen, schedule, onClose }: Props) {
  const { add, update } = useScheduleStore()
  const { options } = useOptionsStore()
  const { role } = useAuthStore()
  const isUser = role === 'user'
  const [form, setForm] = useState<ScheduleFormValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof ScheduleFormValues, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    setSubmitError('')
    if (schedule) {
      setForm({
        category: schedule.category, projectName: schedule.projectName,
        taskDescription: schedule.taskDescription, testUnit: schedule.testUnit,
        testEngineer: schedule.testEngineer, timeResource: String(schedule.timeResource),
        startDate: parseDate(schedule.startDate), endDate: parseDate(schedule.endDate),
        requiredPersonnel: schedule.requiredPersonnel, testReport: schedule.testReport,
        isCompleted: schedule.isCompleted, isDelayed: schedule.isDelayed,
        delayReason: schedule.delayReason,
        device: schedule.device ?? '',
      })
    } else { setForm(EMPTY) }
    setErrors({})
  }, [schedule, isOpen])

  const activeCategories = options.categories.filter(c => c.isActive)
  const activeUnits = options.testUnits.filter(u => u.isActive)
  const activeDevices = (options.devices ?? []).filter(d => d.isActive)
  const activeEngineers = form.testUnit
    ? (activeUnits.find(u => u.value === form.testUnit)?.engineers.filter(e => e.isActive) ?? [])
    : []

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
    if (!form.projectName.trim()) e.projectName = '專案名稱為必填'
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
      delayReason: form.isDelayed ? form.delayReason.trim() : '',
      ...(isUser ? {} : { device: form.device }),
    }
    try {
      if (schedule) await update(schedule.id, data)
      else await add(data)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
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

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{schedule ? '編輯工作排程' : '新增工作排程'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {field('工作類別', 'category', (
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              disabled={isUser}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}>
              <option value="">請選擇</option>
              {activeCategories.map(c => <option key={c.id} value={c.value}>{c.label}</option>)}
            </select>
          ), true)}

          {field('專案名稱', 'projectName', (
            <input type="text" maxLength={FIELD_LIMITS.PROJECT_NAME} value={form.projectName}
              onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
              disabled={isUser}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
          ), true)}

          {field('工作內容', 'taskDescription', (
            <textarea maxLength={FIELD_LIMITS.TASK_DESCRIPTION} rows={3} value={form.taskDescription}
              onChange={e => setForm(f => ({ ...f, taskDescription: e.target.value }))}
              disabled={isUser}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
          ), true)}

          {/* 設備（只在系統中有設備時顯示） */}
          {activeDevices.length > 0 && field('設備', 'device', (
            <select
              value={form.device}
              onChange={e => setForm(f => ({ ...f, device: e.target.value }))}
              disabled={isUser}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
            >
              <option value="">（無）</option>
              {activeDevices.map(d => <option key={d.id} value={d.value}>{d.label}</option>)}
            </select>
          ))}

          <div className="grid grid-cols-2 gap-4">
            {field('測試單位', 'testUnit', (
              <select value={form.testUnit} onChange={e => setForm(f => ({ ...f, testUnit: e.target.value, testEngineer: '' }))}
                disabled={isUser}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}>
                <option value="">請選擇</option>
                {activeUnits.map(u => <option key={u.id} value={u.value}>{u.label}</option>)}
              </select>
            ), true)}
            {field('測試人員', 'testEngineer', (
              <select
                value={form.testEngineer}
                onChange={e => setForm(f => ({ ...f, testEngineer: e.target.value }))}
                disabled={!form.testUnit || isUser}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${!form.testUnit || isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
              >
                <option value="">請選擇</option>
                {activeEngineers.map(e => <option key={e.id} value={e.value}>{e.label}</option>)}
              </select>
            ), true)}
          </div>

          {field('時間資源（Day）', 'timeResource', (
            <input type="number" min="1" step="1" value={form.timeResource}
              onChange={e => setForm(f => ({ ...f, timeResource: e.target.value }))}
              disabled={isUser}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
          ), true)}

          <div className="grid grid-cols-2 gap-4">
            {field('起始日期', 'startDate', (
              <DatePicker selected={form.startDate}
                onChange={(d: Date | null) => setForm(f => ({ ...f, startDate: d }))}
                minDate={MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
                disabled={isUser}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
            ), true)}
            {field('完成日期', 'endDate', (
              <DatePicker selected={form.endDate}
                onChange={(d: Date | null) => setForm(f => ({ ...f, endDate: d }))}
                minDate={form.startDate ?? MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
                disabled={isUser}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
            ), true)}
          </div>

          {field('需求人員', 'requiredPersonnel', (
            <input type="text" maxLength={FIELD_LIMITS.REQUIRED_PERSONNEL} value={form.requiredPersonnel}
              onChange={e => setForm(f => ({ ...f, requiredPersonnel: e.target.value }))}
              disabled={isUser}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
          ), true)}

          {/* ★ 測試報告：required 改為 false（第四個參數不傳或傳 false） */}
          {field('測試報告', 'testReport', (
            <textarea maxLength={FIELD_LIMITS.TEST_REPORT} rows={2} value={form.testReport}
              onChange={e => setForm(f => ({ ...f, testReport: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          ))}

          {/* F11 Completed */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isCompleted" checked={form.isCompleted}
              onChange={e => setForm(f => ({ ...f, isCompleted: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="isCompleted" className="text-sm font-medium text-gray-700">Completed（工作已完成）</label>
          </div>

          {/* F12 Delayed */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isDelayed" checked={form.isDelayed}
              onChange={e => setForm(f => ({ ...f, isDelayed: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
            <label htmlFor="isDelayed" className="text-sm font-medium text-gray-700">Delayed（工作已延遲）</label>
          </div>

          {/* F13 延遲原因 */}
          {form.isDelayed && field('延遲原因', 'delayReason', (
            <textarea maxLength={FIELD_LIMITS.DELAY_REASON} rows={2} value={form.delayReason}
              onChange={e => setForm(f => ({ ...f, delayReason: e.target.value }))}
              placeholder="請說明延遲原因…"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          ), true)}
        </div>
        <div className="flex items-center justify-between gap-2 p-4 border-t">
          {submitError
            ? <p className="text-sm text-red-600 flex-1">{submitError}</p>
            : <span />
          }
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
            <button type="button" onClick={handleSave} disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {submitting ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}