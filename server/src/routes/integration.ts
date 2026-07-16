import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { getTestPlanProgressBatch } from '../lib/vtmsClient.js';
import { analyzeWorkload } from '../lib/workload.js';

const router = Router();

// ── Helper ────────────────────────────────────────────────────────────────────

/** Coerce a query param value (string | string[] | undefined) to string | undefined */
function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

// Schedule dates are stored as 'YYYY/MM/DD'. Accept ISO 'YYYY-MM-DD' from
// callers (agents send ISO dates) and normalise so string comparison lines up.
function normalizeDate(value: string): string {
  return value.replace(/-/g, '/');
}

function buildWhereClause(query: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  const testUnit = qs(query.testUnit);
  if (testUnit) where.testUnit = testUnit;
  // ── work-schedule filters (#1) ──
  const testEngineer = qs(query.testEngineer);
  if (testEngineer) where.testEngineer = testEngineer;
  // ── equipment-schedule filters (#2) ──
  const device = qs(query.device);
  if (device) where.device = device;
  // projectName is free text → partial (contains) match for agent forgiveness
  const projectName = qs(query.projectName);
  if (projectName) where.projectName = { contains: projectName };
  const isCompleted = qs(query.isCompleted);
  if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
  const isDelayed = qs(query.isDelayed);
  if (isDelayed !== undefined) where.isDelayed = isDelayed === 'true';
  const dateFrom = qs(query.dateFrom);
  const dateTo = qs(query.dateTo);
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, string> = {};
    if (dateFrom) dateFilter.gte = normalizeDate(dateFrom);
    if (dateTo) dateFilter.lte = normalizeDate(dateTo);
    where.startDate = dateFilter;
  }
  return where;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /schedules — list schedules (with optional filters)
router.get('/schedules', requireApiKey, async (req, res) => {
  const schedules = await prisma.schedule.findMany({
    where: buildWhereClause(req.query),
    orderBy: { startDate: 'asc' },
  });
  res.json(schedules);
});

// GET /schedules/summary — aggregate stats by testUnit
router.get('/schedules/summary', requireApiKey, async (req, res) => {
  const schedules = await prisma.schedule.findMany();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const total = schedules.length;
  const completed = schedules.filter(s => s.isCompleted).length;
  const delayed = schedules.filter(s => !s.isCompleted && s.isDelayed).length;
  // Mutually exclusive buckets: completed / delayed / inProgress / notStarted
  const inProgress = schedules.filter(s => !s.isCompleted && !s.isDelayed && s.startDate <= today).length;
  const notStarted = schedules.filter(s => !s.isCompleted && !s.isDelayed && s.startDate > today).length;
  const byUnit: Record<string, number> = {};
  for (const s of schedules) {
    if (s.testUnit) byUnit[s.testUnit] = (byUnit[s.testUnit] ?? 0) + 1;
  }
  res.json({ total, completed, delayed, inProgress, notStarted, byUnit });
});

// GET /schedules/by-plan/:planId — find schedule linked to a VTMS plan
router.get('/schedules/by-plan/:planId', requireApiKey, async (req, res) => {
  const planId = String(req.params.planId);
  const schedule = await prisma.schedule.findFirst({
    where: { vtmsPlanId: planId },
  });
  if (!schedule) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(schedule);
});

// GET /schedules-with-progress — schedules + VTMS progress (Copilot Agent)
router.get('/schedules-with-progress', requireApiKey, async (req, res) => {
  const schedules = await prisma.schedule.findMany({
    where: buildWhereClause(req.query),
    orderBy: { startDate: 'asc' },
  });
  const planIds = [...new Set(
    schedules.map(s => s.vtmsPlanId).filter((id): id is string => !!id)
  )];
  let progressMap: Record<string, unknown> = {};
  if (planIds.length > 0) {
    try {
      progressMap = await getTestPlanProgressBatch(planIds);
    } catch {
      // VTMS unreachable — return schedules without progress rather than failing
    }
  }
  const result = schedules.map(s => ({
    ...s,
    vtmsProgress: s.vtmsPlanId ? (progressMap[s.vtmsPlanId] ?? null) : null,
  }));
  res.json(result);
});

// GET /workload-analysis — engineer workload for one month (Copilot Agent).
// The scoring algorithm lives in lib/workload.ts so the agent never computes it.
// Overtime hours come from Work IQ (outside this system) and are passed in via
// the optional `overtime` param: "Name1=8,Name2=4.5".
router.get('/workload-analysis', requireApiKey, async (req, res) => {
  const month = qs(req.query.month) ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    res.status(400).json({ error: 'month is required, format YYYY-MM' });
    return;
  }
  const year = Number(month.slice(0, 4));
  const monthStart = normalizeDate(`${month}-01`);
  const monthEnd = normalizeDate(`${month}-31`); // string compare: '31' covers every month length

  const where: Record<string, unknown> = {
    startDate: { lte: monthEnd },
    endDate: { gte: monthStart },
  };
  const testEngineer = qs(req.query.testEngineer);
  if (testEngineer) where.testEngineer = testEngineer;
  const testUnit = qs(req.query.testUnit);
  if (testUnit) where.testUnit = testUnit;
  const schedules = await prisma.schedule.findMany({ where });

  // 例假日（非週末）取自政府行事曆匯入；年度不符時僅排除週六日並註明
  const limitations: string[] = [];
  let holidays: string[] = [];
  const calendar = await prisma.calendarConfig.findUnique({ where: { id: 1 } });
  if (calendar && calendar.year === year) {
    holidays = (calendar.nonWeekendHolidays as string[]) ?? [];
  } else {
    limitations.push(`行事曆未涵蓋 ${year} 年，工作日僅排除週六日、未排除國定假日`);
  }

  // overtime=Name1=8,Name2=4.5（來源：Work IQ，由 Agent 轉入）
  let overtime: Record<string, number> | undefined;
  const overtimeRaw = qs(req.query.overtime);
  if (overtimeRaw) {
    overtime = {};
    for (const pair of overtimeRaw.split(',')) {
      const idx = pair.lastIndexOf('=');
      const name = pair.slice(0, idx).trim();
      const hours = Number(pair.slice(idx + 1));
      if (name && Number.isFinite(hours) && hours >= 0) overtime[name] = hours;
    }
  }

  const result = analyzeWorkload({
    month,
    schedules: schedules.filter(s => s.testEngineer),
    holidays,
    overtime,
  });
  res.json({ ...result, limitations });
});

// PATCH /schedules/:id/delay — called by VTMS when Delay log is saved
router.patch('/schedules/:id/delay', requireApiKey, async (req, res) => {
  const { date, content } = req.body as { date: string; content: string };
  if (!date || !content) { res.status(400).json({ error: 'date and content required' }); return; }
  const id = String(req.params.id);
  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const appendedReason = existing.delayReason
    ? `${existing.delayReason}\n[${date}] ${content}`
    : `[${date}] ${content}`;
  const updated = await prisma.schedule.update({
    where: { id },
    data: { isDelayed: true, delayReason: appendedReason, updatedAt: new Date() },
  });
  res.json(updated);
});

// PATCH /schedules/:id/vtms-plan — link or unlink a VTMS plan (called by VTMS)
router.patch('/schedules/:id/vtms-plan', requireApiKey, async (req, res) => {
  const id = String(req.params.id);
  const { vtmsPlanId } = req.body as { vtmsPlanId: string | null };
  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.schedule.update({
    where: { id },
    data: { vtmsPlanId: vtmsPlanId ?? null, updatedAt: new Date() },
  });
  res.json(updated);
});

// PATCH /schedules/:id/complete — called by VTMS when all tasks finish
router.patch('/schedules/:id/complete', requireApiKey, async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.schedule.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.schedule.update({
    where: { id },
    data: { isCompleted: true, updatedAt: new Date() },
  });
  res.json(updated);
});

export default router;
