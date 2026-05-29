import React, { useState } from 'react';
import { useTeamsStore } from '../../store/teamsStore';
import { useAuditStore } from '../../store/auditStore';
import { useAuthStore } from '../../store/authStore';

const TeamsSettingsPage: React.FC = () => {
  // ✅ 修正：直接取 displayName 和 username，不透過 user 物件
  const { displayName, username } = useAuthStore()
  const { addLog } = useAuditStore();
  const {
    enabled, webhookUrl, recipients, systemLink,
    setEnabled, setWebhookUrl, setRecipients, setSystemLink,
  } = useTeamsStore();

  const [webhookInput, setWebhookInput] = useState(webhookUrl);
  const [systemLinkInput, setSystemLinkInput] = useState(systemLink);
  const [recipientInput, setRecipientInput] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');

  // ✅ 取操作人員名稱的共用函式
  const operatorName = displayName || username || 'unknown'

  const handleSaveWebhook = () => {
    setWebhookUrl(webhookInput);
    setSystemLink(systemLinkInput);
    addLog({ operator: operatorName, action: 'UPDATE', field: 'Teams Webhook/系統連結' });
  };

  const handleAddRecipient = () => {
    const trimmed = recipientInput.trim();
    if (!trimmed || recipients.includes(trimmed)) return;
    setRecipients([...recipients, trimmed]);
    setRecipientInput('');
    addLog({ operator: operatorName, action: 'UPDATE', field: '通知收件名單(新增)' });
  };

  const handleRemoveRecipient = (r: string) => {
    setRecipients(recipients.filter((x) => x !== r));
    addLog({ operator: operatorName, action: 'UPDATE', field: '通知收件名單(刪除)' });
  };

  const handleTestSend = async () => {
    if (!webhookUrl) { setTestStatus('fail'); return; }
    setTestStatus('sending');
    try {
      const res = await fetch('/api/notify/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
        credentials: 'include',
      });
      setTestStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setTestStatus('fail');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800">🔔 Teams 通知設定</h2>

      {/* 功能開關 */}
      <div className="bg-white rounded-xl border p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-700">啟用 Teams 通知</p>
          <p className="text-sm text-gray-400 mt-0.5">關閉後，所有 Teams 通知功能將停用</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEnabled(!enabled);
            addLog({ operator: operatorName, action: 'UPDATE', field: 'Teams通知開關' });
          }}
          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-8' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Webhook & 系統連結 */}
      <div className={`bg-white rounded-xl border p-5 space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="font-semibold text-gray-700">Webhook 設定</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Webhook URL</label>
          <input
            type="url"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder="https://outlook.office.com/webhook/..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">系統連結（通知附帶）</label>
          <input
            type="url"
            value={systemLinkInput}
            onChange={(e) => setSystemLinkInput(e.target.value)}
            placeholder="http://your-vsms-url"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSaveWebhook}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            💾 儲存設定
          </button>
          <button
            type="button"
            onClick={handleTestSend}
            disabled={testStatus === 'sending'}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm border"
          >
            {testStatus === 'sending' ? '傳送中...' :
             testStatus === 'ok' ? '✅ 傳送成功' :
             testStatus === 'fail' ? '❌ 傳送失敗' : '🧪 測試發送'}
          </button>
        </div>
      </div>

      {/* 收件名單 */}
      <div className={`bg-white rounded-xl border p-5 space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="font-semibold text-gray-700">收件名單</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
            placeholder="輸入 email 或 Teams 名稱..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            type="button"
            onClick={handleAddRecipient}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            ＋ 新增
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {recipients.map((r) => (
            <span key={r} className="flex items-center gap-1 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700">
              {r}
              <button
                type="button"
                onClick={() => handleRemoveRecipient(r)}
                className="ml-1 text-blue-400 hover:text-red-500 font-bold"
              >
                ×
              </button>
            </span>
          ))}
          {recipients.length === 0 && (
            <p className="text-sm text-gray-400">尚未設定收件人</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamsSettingsPage;