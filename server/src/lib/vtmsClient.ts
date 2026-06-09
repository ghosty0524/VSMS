// server/src/lib/vtmsClient.ts
export interface VtmsTestPlan {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

export interface VtmsProgressResults {
  pass: number; fail: number; conditional_pass: number;
  blocked: number; not_tested: number; not_applicable: number;
}

export interface VtmsProgress {
  planId: string;
  planName: string;
  planStatus: string;
  totalItems: number;
  latestRunStatus: string | null;
  results: VtmsProgressResults;
  completionPct: number;
}

const VTMS_URL = process.env.VTMS_API_URL ?? 'http://localhost:4000';
const VTMS_KEY = process.env.VTMS_API_KEY ?? '';

async function vtmsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${VTMS_URL}${path}`, {
    headers: { 'X-Api-Key': VTMS_KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`VTMS ${res.status}: ${text}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export async function listTestPlans(): Promise<VtmsTestPlan[]> {
  return vtmsGet<VtmsTestPlan[]>('/api/integration/test-plans');
}

export async function getTestPlanProgress(planId: string): Promise<VtmsProgress> {
  return vtmsGet<VtmsProgress>(`/api/integration/test-plans/${planId}/progress`);
}

export async function getTestPlanProgressBatch(
  ids: string[]
): Promise<Record<string, VtmsProgress>> {
  if (ids.length === 0) return {};
  return vtmsGet<Record<string, VtmsProgress>>(
    `/api/integration/test-plans/progress-batch?ids=${ids.join(',')}`
  );
}
