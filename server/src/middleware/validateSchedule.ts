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

/**
 * Validates all Schedule write operations (POST & PUT).
 * Returns HTTP 422 with { errors: Record<string, string> } on failure.
 * Applies backend enforcement equivalent to the frontend FIELD_LIMITS.
 */
export function validateSchedule(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown>
  const errors: Record<string, string> = {}

  // projectName: required, max 100
  if (!body.projectName || typeof body.projectName !== 'string' || body.projectName.trim() === '') {
    errors.projectName = '專案名稱為必填'
  } else if (body.projectName.length > LIMITS.PROJECT_NAME) {
    errors.projectName = `專案名稱不可超過 ${LIMITS.PROJECT_NAME} 字`
  }

  // taskDescription: optional, max 500
  if (typeof body.taskDescription === 'string' && body.taskDescription.length > LIMITS.TASK_DESCRIPTION) {
    errors.taskDescription = `任務描述不可超過 ${LIMITS.TASK_DESCRIPTION} 字`
  }

  // testUnit: required
  if (!body.testUnit || typeof body.testUnit !== 'string' || body.testUnit.trim() === '') {
    errors.testUnit = '測試單位為必填'
  }

  // testEngineer: required
  if (!body.testEngineer || typeof body.testEngineer !== 'string' || body.testEngineer.trim() === '') {
    errors.testEngineer = '測試人員為必填'
  }

  // timeResource: required, positive integer
  if (body.timeResource === undefined || body.timeResource === null) {
    errors.timeResource = '時間資源為必填'
  } else if (!Number.isInteger(body.timeResource) || (body.timeResource as number) <= 0) {
    errors.timeResource = '時間資源須為正整數'
  }

  // startDate: required, format YYYY/MM/DD
  if (!body.startDate || typeof body.startDate !== 'string' || !DATE_REGEX.test(body.startDate)) {
    errors.startDate = '開始日期格式須為 YYYY/MM/DD'
  }

  // endDate: required, format YYYY/MM/DD, must not be before startDate
  if (!body.endDate || typeof body.endDate !== 'string' || !DATE_REGEX.test(body.endDate)) {
    errors.endDate = '結束日期格式須為 YYYY/MM/DD'
  } else if (
    typeof body.startDate === 'string' &&
    DATE_REGEX.test(body.startDate) &&
    body.endDate < body.startDate
  ) {
    errors.endDate = '結束日期不可早於開始日期'
  }

  // requiredPersonnel: optional, max 200
  if (typeof body.requiredPersonnel === 'string' && body.requiredPersonnel.length > LIMITS.REQUIRED_PERSONNEL) {
    errors.requiredPersonnel = `所需人員不可超過 ${LIMITS.REQUIRED_PERSONNEL} 字`
  }

  // testReport: optional, max 500
  if (typeof body.testReport === 'string' && body.testReport.length > LIMITS.TEST_REPORT) {
    errors.testReport = `測試報告不可超過 ${LIMITS.TEST_REPORT} 字`
  }

  // delayReason: required when isDelayed=true, max 5000
  if (body.isDelayed === true) {
    if (!body.delayReason || typeof body.delayReason !== 'string' || body.delayReason.trim() === '') {
      errors.delayReason = '延遲原因為必填'
    } else if (body.delayReason.length > LIMITS.DELAY_REASON) {
      errors.delayReason = `延遲原因不可超過 ${LIMITS.DELAY_REASON} 字`
    }
  }

  if (Object.keys(errors).length > 0) {
    res.status(422).json({ errors })
    return
  }

  next()
}
