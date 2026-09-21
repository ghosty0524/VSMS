// server/src/lib/orgSync/state.ts
// 記憶體版本守衛：擋掉比已套用版本舊的快照（不擋 dryRun）。單行程假設，重啟後歸零。
export const orgSyncState = { lastAppliedVersion: 0 }
