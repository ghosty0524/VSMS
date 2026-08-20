// startDate/endDate 是台灣本地的日曆日期，所以「今天」也必須是台灣日期。
// 用 UTC 日期會讓台灣時間 00:00–08:00 之間的每個比較都早一天。
export function todayTaipei(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '/')
}
