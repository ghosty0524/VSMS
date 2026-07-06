// server/src/middleware/validateSchedule.ts
import type { Request, Response, NextFunction } from 'express'

const LIMITS = {
  PROJECT_NAME: 100,
  TASK_DESCRIPTION: 500,
  REQUIRED_PERSONNEL: 200,
  TEST_REPORT: 500,
  DELAY_REASON: 5000,
} as const

const DATE_REGEX = /^\d{4}\/\d{2}\/\d{2}$/

/** True when the string is YYYY/MM/DD and an actual calendar date. */
function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false
  const [y, m, d] = value.split('/').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/**
 * Validates a single schedule payload. When requireCore is false (flag-only /
 * partial updates), required-field checks are skipped but length limits and
 * format checks still apply to every field that IS present.
 */
export function collectScheduleErrors(body: Record<string, unknown>, requireCore: boolean): Record<string, string> {
  const errors: Record<string, string> = {}

  // ── Length/format limits — always enforced when the field is present ──────
  if (typeof body.projectName === 'string' && body.projectName.length > LIMITS.PROJECT_NAME) {
    errors.projectName = `專案名稱不可超過 ${LIMITS.PROJECT_NAME} 字`
  }
  if (typeof body.taskDescription === 'string' && body.taskDescription.length > LIMITS.TASK_DESCRIPTION) {
    errors.taskDescription = `任務描述不可超過 ${LIMITS.TASK_DESCRIPTION} 字`
  }
  if (typeof body.requiredPersonnel === 'string' && body.requiredPersonnel.length > LIMITS.REQUIRED_PERSONNEL) {
    errors.requiredPersonnel = `所需人員不可超過 ${LIMITS.REQUIRED_PERSONNEL} 字`
  }
  if (typeof body.testReport === 'string' && body.testReport.length > LIMITS.TEST_REPORT) {
    errors.testReport = `測試報告不可超過 ${LIMITS.TEST_REPORT} 字`
  }
  if (body.isDelayed === true) {
    if (!body.delayReason || typeof body.delayReason !== 'string' || body.delayReason.trim() === '') {
      errors.delayReason = '延遲原因為必填'
    } else if (body.delayReason.length > LIMITS.DELAY_REASON) {
      errors.delayReason = `延遲原因不可超過 ${LIMITS.DELAY_REASON} 字`
    }
  }

  if (!requireCore) return errors

  // ── Required-field checks — full create/update payloads only ──────────────
  if (!body.projectName || typeof body.projectName !== 'string' || body.projectName.trim() === '') {
    errors.projectName = errors.projectName ?? '專案名稱為必填'
  }
  if (!body.testUnit || typeof body.testUnit !== 'string' || body.testUnit.trim() === '') {
    errors.testUnit = '測試單位為必填'
  }
  if (!body.testEngineer || typeof body.testEngineer !== 'string' || body.testEngineer.trim() === '') {
    errors.testEngineer = '測試人員為必填'
  }
  if (body.timeResource === undefined || body.timeResource === null) {
    errors.timeResource = '時間資源為必填'
  } else if (!Number.isInteger(body.timeResource) || (body.timeResource as number) <= 0) {
    errors.timeResource = '時間資源須為正整數'
  }
  if (!body.startDate || typeof body.startDate !== 'string' || !isValidDate(body.startDate)) {
    errors.startDate = '開始日期格式須為 YYYY/MM/DD 且為有效日期'
  }
  if (!body.endDate || typeof body.endDate !== 'string' || !isValidDate(body.endDate)) {
    errors.endDate = '結束日期格式須為 YYYY/MM/DD 且為有效日期'
  } else if (
    typeof body.startDate === 'string' &&
    isValidDate(body.startDate) &&
    body.endDate < body.startDate
  ) {
    errors.endDate = '結束日期不可早於開始日期'
  }

  return errors
}

/**
 * Validates all Schedule write operations (POST & PUT).
 * Returns HTTP 422 with { errors: Record<string, string> } on failure.
 * Applies backend enforcement equivalent to the frontend FIELD_LIMITS.
 */
export function validateSchedule(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown>

  // Flag/device-only updates skip required-field validation, but limits on
  // whatever fields ARE present (testReport, delayReason, ...) still apply.
  const coreFields = ['projectName', 'taskDescription', 'testUnit', 'testEngineer',
    'timeResource', 'startDate', 'endDate', 'requiredPersonnel', 'category']
  const requireCore = Object.keys(body).some(k => coreFields.includes(k))

  const errors = collectScheduleErrors(body, requireCore)
  if (Object.keys(errors).length > 0) {
    res.status(422).json({ errors })
    return
  }

  next()
}
