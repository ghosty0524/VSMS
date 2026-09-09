// server/src/lib/vtmsClient.ts
import https from 'node:https';
import http from 'node:http';

export interface VtmsTestPlan {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  assignees: string[];
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

export interface VtmsProject {
  id: string
  /** 就是 PDN Number */
  name: string
  productName: string
  planCount: number
}

const VTMS_URL = process.env.VTMS_API_URL ?? 'https://localhost:4000';
const VTMS_KEY = process.env.VTMS_API_KEY ?? '';

// Use node:https/http directly so we can disable cert verification for internal self-signed certs
function vtmsGet<T>(path: string): Promise<T> {
  const url = new URL(`${VTMS_URL}${path}`);
  const isHttps = url.protocol === 'https:';
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? '443' : '80'),
    path: url.pathname + url.search,
    method: 'GET',
    headers: { 'X-Api-Key': VTMS_KEY, 'Content-Type': 'application/json' },
    rejectUnauthorized: false,
    // Fail fast instead of hanging callers when VTMS is unreachable
    timeout: 10_000,
  };
  return new Promise((resolve, reject) => {
    const client = isHttps ? https : http;
    const req = client.request(options, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body) as T); }
          catch (e) { reject(e); }
        } else {
          reject(Object.assign(new Error(`VTMS ${res.statusCode}: ${body}`), { status: res.statusCode }));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('VTMS request timed out')));
    req.on('error', reject);
    req.end();
  });
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

export async function listProjects(): Promise<VtmsProject[]> {
  return vtmsGet<VtmsProject[]>('/api/integration/projects');
}
