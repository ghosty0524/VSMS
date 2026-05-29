import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuditLog {
  timestamp: string;
  operator: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PUBLISH';
  field?: string;
}

interface AuditState {
  logs: AuditLog[];
  addLog: (log: Omit<AuditLog, 'timestamp'>) => void;
  clearOldLogs: () => void;
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      logs: [],
      addLog: (log) => {
        const entry: AuditLog = {
          ...log,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        set((s) => ({ logs: [entry, ...s.logs] }));
      },
      clearOldLogs: () => {
        const cutoff = Date.now() - SIX_MONTHS_MS;
        set((s) => ({
          logs: s.logs.filter((l) => new Date(l.timestamp).getTime() > cutoff),
        }));
      },
    }),
    { name: 'vsms-audit-logs' }
  )
);