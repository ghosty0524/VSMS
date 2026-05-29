# VSMS - Validation Schedule Management System

驗證排程管理系統，提供排程管理、甘特圖、統計分析、審計紀錄等功能。

## 系統需求

- Node.js v18 以上
- npm v9 以上
- Windows 10 / 11（或任何支援 Node.js 的環境）

## 快速啟動（開發模式）

```bash
# 安裝依賴
npm install

# 啟動開發伺服器（前端 + 後端同時啟動）
npm run dev
```

- 前端：http://localhost:5173
- 後端 API：http://localhost:3001

## 正式部署

### 1. 設定環境變數

```bash
# 複製範本
copy .env.example .env

# 編輯 .env，修改 SESSION_SECRET
```

### 2. 建置並啟動

```bash
# 方法一：使用啟動腳本（Windows）
start.bat

# 方法二：手動執行
npm run build
npm start
```

- 系統網址：http://localhost:3001

### 3. 首次登入

系統啟動後，開啟瀏覽器前往系統網址，會出現初始化畫面：

1. 輸入 Super Admin **帳號**（預設為 `admin`，可自訂）
2. 輸入 **密碼**（至少 8 字元）
3. 點擊登入完成初始化

## 資料儲存

所有資料存於 `server/data/` 目錄：

| 檔案 | 說明 |
|------|------|
| `auth.json` | 帳號資料 |
| `schedules.json` | 排程資料 |
| `options.json` | 系統設定（類別、單位、人員） |
| `notify.json` | 通知設定 |
| `audit.json` | 審計紀錄 |

> ⚠️ 請定期備份 `server/data/` 目錄

## 角色說明

| 角色 | 權限 |
|------|------|
| **Super Admin** | 全部功能，含帳號管理、審計紀錄 |
| **Admin** | 排程管理、設定管理、統計分析、匯出 |

## 技術架構

- **前端**：React 19 + TypeScript + Tailwind CSS + Zustand + Recharts
- **後端**：Express 5 + TypeScript + express-session
- **資料儲存**：JSON 檔案
- **打包工具**：Vite + vite-plugin-singlefile