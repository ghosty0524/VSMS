// 排程指派／改期的站內通知（VSMS 第一個站內事件）。規則在這裡，寄送走平台。
import { prisma } from './db.js'
import { deliver as platformDeliver, type DeliverInput, type DeliverResult } from './notifyClient.js'

interface Sched { id: string; projectName: string; testEngineer: string; startDate: string; endDate: string; updatedAt: Date }
interface Prev { testEngineer: string; startDate: string; endDate: string }
interface Deps { deliver?: (i: DeliverInput) => Promise<DeliverResult>; findAccount?: (engineer: string) => Promise<{ username: string } | null> }

// 平台認人靠 username，不是本機 id——pre-SSO 帳號的本機 id 跟 vauth 對不上
// （見 server/src/middleware/ssoAdopt.ts、server/src/lib/orgSync/derive.ts）。
const defaultFindAccount = async (engineer: string) => prisma.user.findFirst({ where: { linkedEngineer: engineer, isActive: true }, select: { username: true } })

export async function notifyScheduleAssigned(input: { schedule: Sched; previous?: Prev }, deps: Deps = {}): Promise<void> {
  const { schedule, previous } = input
  if (!schedule.testEngineer) return
  if (previous && previous.testEngineer === schedule.testEngineer && previous.startDate === schedule.startDate && previous.endDate === schedule.endDate) return
  try {
    const account = await (deps.findAccount ?? defaultFindAccount)(schedule.testEngineer)
    if (!account) return
    await (deps.deliver ?? platformDeliver)({
      key: `schedule_assigned:${schedule.id}:${schedule.updatedAt.toISOString()}`,
      channels: ['inapp'], recipients: [{ username: account.username }], severity: 'info',
      title: `你有一筆排程：${schedule.projectName}`, body: `${schedule.startDate} ～ ${schedule.endDate}`, linkUrl: '/vsms/',
    })
  } catch (err) {
    console.warn('[notify] schedule notice failed:', err)
  }
}
