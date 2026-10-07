import { buildDashboard, resolveCustomPeriod } from '../../domain/dashboard'
import type { BranchSignals } from '../../domain/commandCenter'
import { buildDailyFactPack, buildWeeklyFactPack, resolveNarrative, type BranchRef, type DailyFactPack, type ResolvedNarrative, type WeeklyFactPack } from '../../domain/managerReport'
import { fetchDashboardRaws, getCommandCenterSignals, getManagerReportInputs } from '../../services/data'
import { addDaysIso, istanbulDate } from '../../utils/dates'

/**
 * Report loaders. The number of backend requests is CONSTANT in the number of branches:
 *   daily  today : 3 (dashboard inputs, command-center signals, report inputs)   daily  past date : 2 (dashboard inputs, report inputs)
 *   weekly current week : 2 (report inputs, command-center signals)               weekly past week : 1 (report inputs)
 * The analytics snapshots are READ, never regenerated, so opening a report never triggers an analytics rebuild. No AI is called: the
 * narrative is the deterministic renderer's (the Fact Pack is the contract an AI would later consume).
 */

export interface LoadedReport<P> {
  pack: P
  narrative: ResolvedNarrative
}

export async function loadDailyReport(branches: readonly BranchRef[], businessDate: string, now: Date = new Date()): Promise<LoadedReport<DailyFactPack>> {
  const ids = branches.map((b) => b.id)
  const isToday = businessDate === istanbulDate(now)
  const period = resolveCustomPeriod(businessDate, businessDate)
  const [raws, signals, report] = await Promise.all([
    fetchDashboardRaws(branches, period),
    isToday ? getCommandCenterSignals(ids).catch((): Record<string, BranchSignals | null> | null => null) : Promise.resolve(null),
    getManagerReportInputs(ids, 'daily', businessDate),
  ])
  const { organization, branches: rows } = buildDashboard(period, raws)
  const pack = buildDailyFactPack({ businessDate, now, branches: [...branches], rows, organization, signals, report })
  return { pack, narrative: resolveNarrative(pack) }
}

export async function loadWeeklyReport(branches: readonly BranchRef[], weekStart: string, now: Date = new Date()): Promise<LoadedReport<WeeklyFactPack>> {
  const ids = branches.map((b) => b.id)
  const today = istanbulDate(now)
  const containsToday = weekStart <= today && today <= addDaysIso(weekStart, 6)
  const [report, signals] = await Promise.all([
    getManagerReportInputs(ids, 'weekly', weekStart),
    containsToday ? getCommandCenterSignals(ids).catch((): Record<string, BranchSignals | null> | null => null) : Promise.resolve(null),
  ])
  const pack = buildWeeklyFactPack({ weekStart, now, branches: [...branches], report, signals })
  return { pack, narrative: resolveNarrative(pack) }
}
