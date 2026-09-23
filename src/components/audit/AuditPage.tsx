import React, { useState, useMemo, useEffect } from 'react';
import { ClipboardList, Download, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/dateFormat';

/**
 * 動作代碼與中文標籤。
 *
 * 審計紀錄最常被拿出來的場合是稽核，看的人不一定是開發者。畫面上顯示中文，
 * 原始代碼放進 title，兩邊都不損失。
 *
 * FLAG_SCHEDULE 原本不在篩選清單裡，但後端在 schedules.ts 有兩處會寫入
 * （設定與移除排程旗標），也就是說那些紀錄看得到卻篩不到。一併補上。
 */
const ACTION_LABELS: Record<string, string> = {
  LOGIN:            '登入',
  LOGOUT:           '登出',
  CREATE_SCHEDULE:  '新增排程',
  UPDATE_SCHEDULE:  '更新排程',
  DELETE_SCHEDULE:  '刪除排程',
  IMPORT_SCHEDULES: '匯入排程',
  FLAG_SCHEDULE:    '排程標記',
  EXPORT_DASHBOARD: '匯出 Dashboard',
  CREATE_USER:      '新增帳號',
  UPDATE_USER:      '更新帳號',
  DISABLE_USER:     '停用帳號',
  UPDATE_SETTINGS:  '變更設定',
  ORG_SYNC:         '組織同步',
};

const ACTION_TYPES = ['全部', ...Object.keys(ACTION_LABELS)];

/** 未知代碼（例如後端加了新動作但前端還沒跟上）直接顯示原文，不要顯示空白 */
function actionLabel(code: string): string {
  return ACTION_LABELS[code] ?? code;
}

/**
 * 動作的語意配色。建立與匯入是綠、會讓資料消失或帳號失效的是紅、其餘中性。
 * 改版前用的是 `includes('DELETE')` 這種字串比對，所以 DISABLE_USER
 * （停用帳號）會被歸到「其餘」而顯示成中性色。
 */
function actionTone(code: string): string {
  if (code === 'DELETE_SCHEDULE' || code === 'DISABLE_USER') return 'bg-red-100 text-red-700';
  if (code === 'CREATE_SCHEDULE' || code === 'CREATE_USER' || code === 'IMPORT_SCHEDULES')
    return 'bg-green-100 text-green-700';
  return 'bg-slate-100 text-slate-700';
}

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
    // 動作同時給中文與原始代碼：稽核的人看中文，要跟系統紀錄對照時看代碼。
    const header = '時間,操作人員,動作,動作代碼,目標,修改欄位\n';
    const rows = filtered.map((l) =>
      `"${l.timestamp}","${l.displayName || l.username}","${actionLabel(l.action)}","${l.action}","${l.target}","${l.fields?.join('; ') ?? ''}"`
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
      <div className="p-8 flex items-center justify-center gap-2 text-gray-500">
        <ShieldAlert size={16} className="flex-shrink-0" />
        此功能僅限 Super Admin 使用
      </div>
    );
  }

  if (loading) return <p className="p-8 text-center text-gray-400">載入中...</p>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <ClipboardList size={22} className="text-gray-400" />
          審計紀錄
        </h2>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 text-sm font-medium"
        >
          <Download size={15} />
          匯出 CSV
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
              <option key={t} value={t}>{t === '全部' ? '全部' : actionLabel(t)}</option>
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
                    <td className="tnum px-4 py-2 text-gray-500 whitespace-nowrap">
                      {formatDateTime(log.timestamp, { seconds: true })}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {log.displayName || log.username}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        title={log.action}
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${actionTone(log.action)}`}
                      >
                        {actionLabel(log.action)}
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
