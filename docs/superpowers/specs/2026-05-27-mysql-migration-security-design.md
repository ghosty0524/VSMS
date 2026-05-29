# VSMS MySQL 遷移 + 安全強化設計規格

**日期**：2026-05-27  
**範圍**：MySQL 遷移、delayReason 欄位上限調整、後端安全驗證層  
**技術選型**：MySQL 8.x + Prisma ORM  

---

## 1. 背景與目標

### 現況問題
1. 資料使用 JSON 檔案儲存，無法支援多使用者並發寫入、查詢效能有限
2. `delayReason` 欄位上限 500 字不足，需提升至 5000 字
3. 後端路由完全無欄位驗證，使用者可透過 F12 或直接呼叫 API 繞過前端 `maxLength` 限制

### 目標
- 將所有資料遷移至本地 MySQL 8.x，由 Prisma ORM 管理
- 自動將現有 `data/*.json` 一次性匯入 MySQL
- 新增後端 validateSchedule middleware，確保所有寫入資料合規
- `delayReason` 前後端上限同步改為 5000 字

---

## 2. 架構設計

```
前端請求 → Express Router
               ↓
   validateSchedule middleware
   （後端欄位長度 / 格式 / 必填驗證）
               ↓
   Prisma Client → MySQL 8.x
```

### 檔案變更清單

#### 新增
| 檔案 | 說明 |
|------|------|
| `prisma/schema.prisma` | Prisma 資料表定義 |
| `server/src/lib/db.ts` | Prisma Client 單例 |
| `server/src/middleware/validateSchedule.ts` | Schedule 寫入驗證 middleware |
| `scripts/migrate-json-to-mysql.ts` | 一次性 JSON → MySQL 遷移腳本 |

#### 修改
| 檔案 | 改動 |
|------|------|
| `server/src/lib/storage.ts` | 全面替換為 Prisma 操作 |
| `server/src/routes/schedules.ts` | async/await Prisma 查詢 |
| `server/src/routes/options.ts` | async/await Prisma 查詢 |
| `server/src/routes/auth.ts` | async/await Prisma 查詢 |
| `server/src/routes/users.ts` | async/await Prisma 查詢 |
| `server/src/routes/audit.ts` | async/await Prisma 查詢 |
| `server/src/routes/notify.ts` | async/await Prisma 查詢 |
| `server/src/routes/calendar.ts` | 改用 Prisma（原本寫 server/data/calendar.json）|
| `server/src/index.ts` | 移除 initDataDir()，改 Prisma connect |
| `src/constants.ts` | `DELAY_REASON: 500 → 5000` |
| `.env` / `.env.example` | 新增 `DATABASE_URL` |
| `package.json` / `server/package.json` | 新增 Prisma 依賴 |

---

## 3. Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Schedule {
  id                String   @id @default(uuid())
  category          String   @db.VarChar(100)
  projectName       String   @db.VarChar(100)
  taskDescription   String   @db.VarChar(500)
  testUnit          String   @db.VarChar(100)
  testEngineer      String   @db.VarChar(100)
  timeResource      Int
  startDate         String   @db.VarChar(10)
  endDate           String   @db.VarChar(10)
  requiredPersonnel String   @db.VarChar(200)
  testReport        String   @db.VarChar(500)
  isCompleted       Boolean  @default(false)
  isDelayed         Boolean  @default(false)
  delayReason       String   @db.VarChar(5000)
  createdBy         String   @db.VarChar(100)
  updatedBy         String   @db.VarChar(100)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("schedules")
}

model User {
  id             String    @id @default(uuid())
  username       String    @unique @db.VarChar(100)
  displayName    String    @db.VarChar(50)
  passwordHash   String    @db.VarChar(64)
  role           UserRole
  isActive       Boolean   @default(true)
  allowedUnits   Json      @default("[]")
  linkedEngineer String    @db.VarChar(100)
  createdAt      DateTime  @default(now())
  lastLoginAt    DateTime?

  @@map("users")
}

enum UserRole {
  super_admin
  admin
  user
}

model Category {
  id        String  @id @default(uuid())
  value     String  @db.VarChar(100)
  label     String  @db.VarChar(100)
  isActive  Boolean @default(true)
  sortOrder Int

  @@map("categories")
}

model TestUnit {
  id        String     @id @default(uuid())
  value     String     @db.VarChar(100)
  label     String     @db.VarChar(100)
  isActive  Boolean    @default(true)
  sortOrder Int
  engineers Engineer[]

  @@map("test_units")
}

model Engineer {
  id         String   @id @default(uuid())
  value      String   @db.VarChar(100)
  label      String   @db.VarChar(100)
  isActive   Boolean  @default(true)
  sortOrder  Int
  testUnit   TestUnit @relation(fields: [testUnitId], references: [id], onDelete: Cascade)
  testUnitId String

  @@map("engineers")
}

model RestDaysConfig {
  id            Int    @id @default(1)
  weekends      Boolean @default(true)
  specificDates Json    @default("[]")

  @@map("rest_days_config")
}

model AuditLog {
  id          String   @id @default(uuid())
  timestamp   DateTime @default(now())
  username    String   @db.VarChar(100)
  displayName String   @db.VarChar(100)
  action      String   @db.VarChar(50)
  target      String   @db.VarChar(200)
  fields      Json     @default("[]")

  @@map("audit_logs")
}

model NotifyConfig {
  id              Int         @id @default(1)
  enabled         Boolean     @default(false)
  teamsWebhookUrl String      @db.VarChar(500) @default("")
  systemUrl       String      @db.VarChar(200) @default("http://localhost:3001")
  recipients      Recipient[]

  @@map("notify_config")
}

model Recipient {
  id             String       @id @default(uuid())
  name           String       @db.VarChar(100)
  note           String       @db.VarChar(200)
  isActive       Boolean      @default(true)
  notifyConfig   NotifyConfig @relation(fields: [notifyConfigId], references: [id])
  notifyConfigId Int

  @@map("recipients")
}

model CalendarConfig {
  id                   Int      @id @default(1)
  year                 Int
  nonWeekendHolidays   Json     @default("[]")
  sourceName           String?  @db.VarChar(200)
  updatedAt            DateTime @default(now())

  @@map("calendar_config")
}
```

---

## 4. 後端驗證 Middleware

### `server/src/middleware/validateSchedule.ts`

驗證所有 Schedule 寫入操作（POST & PUT）：

```typescript
// 驗證規則（與前端 FIELD_LIMITS 同步）
const LIMITS = {
  PROJECT_NAME: 100,
  TASK_DESCRIPTION: 500,
  REQUIRED_PERSONNEL: 200,
  TEST_REPORT: 500,
  DELAY_REASON: 5000,
}

// 驗證項目：
// ✅ projectName: 必填、最長 100 字
// ✅ taskDescription: 最長 500 字
// ✅ testUnit: 必填（非空字串）
// ✅ testEngineer: 必填（非空字串）
// ✅ timeResource: 必填、正整數
// ✅ startDate / endDate: 必填、格式 YYYY/MM/DD、startDate ≤ endDate
// ✅ delayReason: isDelayed=true 時必填、最長 5000 字
// ✅ testReport: 最長 500 字
// 回傳格式：422 Unprocessable Entity + { errors: Record<string, string> }
```

---

## 5. 安全問題修復對照

| 風險 | 修復前 | 修復後 |
|------|--------|--------|
| 欄位長度繞過（F12） | ❌ 只有前端 maxLength | ✅ 後端 validateSchedule middleware |
| 日期格式注入 | ❌ 無驗證 | ✅ 正規表達式 `/^\d{4}\/\d{2}\/\d{2}$/` |
| 數值欄位注入 | ❌ timeResource 無驗證 | ✅ `Number.isInteger` 驗證 |
| Session 保護 | ✅ requireAuth | 維持現狀 |
| 密碼強度 | ✅ 8 字元最低要求 | 維持現狀 |

> **範圍外**：Rate limiting（防暴力破解）和 HTTPS 設定建議在生產環境部署時額外處理。

---

## 6. 資料遷移策略

### 遷移腳本 `scripts/migrate-json-to-mysql.ts`

執行順序：
1. 讀取 `data/options.json` → 寫入 `Category`、`TestUnit`、`Engineer`、`RestDaysConfig`
2. 讀取 `data/auth.json` → 寫入 `User`
3. 讀取 `data/schedules.json` → 寫入 `Schedule`
4. 讀取 `data/audit.json` → 寫入 `AuditLog`
5. 讀取 `data/notify.json` → 寫入 `NotifyConfig` + `Recipient`
6. 讀取 `server/data/calendar.json` → 寫入 `CalendarConfig`（若存在）

**特性**：
- 使用 `upsert`（不重複插入），可安全重複執行
- 遷移完成後 `data/*.json` 不刪除（保留備份）
- 腳本執行方式：`npx tsx scripts/migrate-json-to-mysql.ts`

---

## 7. 環境變數設定

`.env` 新增：
```
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/vsms"
```

`.env.example` 新增：
```
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/vsms"
```

---

## 8. 建置順序

1. 安裝 Prisma 依賴
2. 建立 `prisma/schema.prisma`
3. 在 MySQL 建立資料庫 `vsms`
4. 設定 `.env` 中的 `DATABASE_URL`
5. 執行 `npx prisma migrate dev --name init` 建立資料表
6. 建立 `server/src/lib/db.ts`（Prisma client 單例）
7. 重寫 `server/src/lib/storage.ts`（JSON → Prisma）
8. 更新各 route 為 async/await 模式
9. 新增 `validateSchedule.ts` middleware
10. 修改 `src/constants.ts` DELAY_REASON 上限
11. 執行遷移腳本匯入現有 JSON 資料
12. 測試所有 API 端點
