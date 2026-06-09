import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { getTestPlanProgressBatch } from '../lib/vtmsClient.js';

const router = Router();

// ── Helper ────────────────────────────────────────────────────────────────────

/** Coerce a query param value (string | string[] | undefined) to string | undefined */
function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

function buildWhereClause(query: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  const testUnit = qs(query.testUnit);
  if (testUnit) where.testUnit = testUnit;
  const isCompleted = qs(query.isCompleted);
  if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
  const isDelayed = qs(query.isDelayed);
  if (isDelayed !== undefined) where.isDelayed = isDelayed === 'true';
  const dateFrom = qs(query.dateFrom);
  const dateTo = qs(query.dateTo);
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, string> = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;
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
  const total = schedules.length;
  const completed = schedules.filter(s => s.isCompleted).length;
  const delayed = schedules.filter(s => s.isDelayed).length;
  const inProgress = schedules.filter(s => !s.isCompleted && s.isDelayed === false).length;
  const notStarted = schedules.filter(s => !s.isCompleted && !s.isDelayed).length;
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
