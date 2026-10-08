import type { DailyStat, DashboardData } from '../shared/types.ts'
import type { Exit } from './parse.ts'

export function buildDashboardData(exits: readonly Exit[], generatedAt: Date): DashboardData {
  const byDate = Map.groupBy(exits, (e) => e.date)
  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => aggregateDay(date, rows))
  return { generatedAt: generatedAt.toISOString(), days }
}

function aggregateDay(date: string, rows: readonly Exit[]): DailyStat {
  let netPnl = 0
  let fee = 0
  let turnover = 0
  let exitTurnover = 0
  for (const r of rows) {
    const units = r.quantity * r.multiplier
    netPnl += r.netPnl
    fee += r.fee
    turnover += (r.entryPrice + r.exitPrice) * units
    exitTurnover += r.exitPrice * units
  }


  return {
    date,
    netPnl: Math.round(netPnl),
    fee: Math.round(fee),
    grossPnl: Math.round(netPnl + fee),
    turnover: Math.round(turnover),
    exitTurnover: Math.round(exitTurnover),
    instruments: new Set(rows.map((r) => r.code)).size,
  }
}
