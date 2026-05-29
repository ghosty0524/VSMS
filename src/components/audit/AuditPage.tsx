import React, { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../lib/api';

const ACTION_TYPES = [
  '全部',
  'LOGIN', 'LOGOUT',
  'CREATE_SCHEDULE', 'UPDATE_SCHEDULE', 'DELETE_SCHEDULE', 'IMPORT_SCHEDULES',
  'EXPORT_DASHBOARD',
  'CREATE_USER', 'UPDATE_USER', 'DISABLE_USER',
  'UPDATE_SETTINGS',
];

interface BackendAuditLog {
  id: string
  timestamp: string
  username: string
  displayName: string
  action: string
  target: string
  fields: string[]
}

const AuditPage: React.FC = () => {
  const { role } = useAuthStore();
  const [logs, setLogs] = useState<BackendAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [operator, setOperator] = useState('');
  const [actionType, setActionType] = useState('全部');

  useEffect(() => {
    if (role !== 'super_admin') return;
    api.getAudit({}).then((data: BackendAuditLog[]) => {
      setLogs(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [role]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (startDate && log.timestamp < startDate) return false;
      if (endDate && log.timestamp > endDate + 'T23:59:59') return false;
      if (operator && !log.displayName.includes(operator) && !log.username.includes(operator)) return false;
      if (actionType !== '全部' && log.action !== actionType) return false;
      return true;
    });
  }, [logs, startDate, endDate, operator, actionType]);

  const handleExport = () => {
    const header = '時間,操作人員,動作,目標,修改欄位\n';
    const rows = filtered.map((l) =>
      `"${l.timestamp}","${l.displayName || l.username}","${l.action}","${l.target}","${l.fields?.join('; ') ?? ''}"`
    ).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (role !== 'super_admin') {
    return (
      <div className="p-8 text-center text-gray-500">
        ⚠️ 此功能僅限 Super Admin 使用
      </div>
    );
  }

  if (loading) return <p className="p-8 text-center text-gray-400">載入中...</p>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">🗂️ 審計紀錄</h2>
        <button
          type="button"
          onClick={handleExport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          ⬇️ 匯出 CSV
        </button>
      </div>

      {/* 查詢條件 */}
      <div className="bg-white rounded-xl border p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">開始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">結束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">操作人員</label>
          <input
            type="text"
            placeholder="關鍵字搜尋..."
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">動作類型</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 結果列表 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b text-sm text-gray-500">
          共 {filtered.length} 筆紀錄
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="px-4 py-2 text-left w-44">時間</th>
                <th className="px-4 py-2 text-left w-32">操作人員</th>
                <th className="px-4 py-2 text-left w-28">動作</th>
                <th className="px-4 py-2 text-left">目標 / 修改欄位</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    無符合條件的紀錄
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {log.displayName || log.username}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        log.action.includes('DELETE') ? 'bg-red-100 text-red-700' :
                        log.action.includes('CREATE') || log.action.includes('IMPORT') ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {log.target}{log.fields?.length ? ` [${log.fields.join(', ')}]` : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AuditPage;
