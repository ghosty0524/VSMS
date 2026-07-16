// 維護 completedAt：isCompleted false→true 記錄當下時間、true→false 清空。
export function completedAtPatch(
  prevIsCompleted: boolean,
  nextIsCompleted: boolean | undefined,
): { completedAt: Date | null } | Record<string, never> {
  if (nextIsCompleted === undefined || nextIsCompleted === prevIsCompleted) return {}
  return { completedAt: nextIsCompleted ? new Date() : null }
}
