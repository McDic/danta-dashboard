import type { DailyStat } from '../shared/types.ts'

export interface DayPoint extends DailyStat {
  /** Running net PnL from the start of the selected range */
  cumulative: number
  /** cumulative minus its running peak (0 or negative); the peak starts at 0 */
  drawdown: number
}

export interface Summary {
  tradingDays: number
  winDays: number
  netPnl: number
  grossPnl: number
  fee: number
  turnover: number
  exitTurnover: number
  /** Sum over days of distinct instruments traded that day */
  instrumentDays: number
  maxDrawdown: number
  best?: DailyStat
  worst?: DailyStat
}

export interface MonthStat {
  /** YYYY-MM */
  month: string
  tradingDays: number
  winDays: number
  netPnl: number
  fee: number
  turnover: number
}

export function withCumulative(days: readonly DailyStat[]): DayPoint[] {
  let cumulative = 0
  let peak = 0
  return days.map((d) => {
    cumulative += d.netPnl
    peak = Math.max(peak, cumulative)
    return { ...d, cumulative, drawdown: cumulative - peak }
  })
}

export function summarize(points: readonly DayPoint[]): Summary {
  const s: Summary = { tradingDays: points.length, winDays: 0, netPnl: 0, grossPnl: 0, fee: 0, turnover: 0, exitTurnover: 0, instrumentDays: 0, maxDrawdown: 0 }
  for (const p of points) {
    if (p.netPnl > 0) s.winDays++
    s.netPnl += p.netPnl
    s.grossPnl += p.grossPnl
    s.fee += p.fee
    s.turnover += p.turnover
    s.exitTurnover += p.exitTurnover
    s.instrumentDays += p.instruments
    s.maxDrawdown = Math.min(s.maxDrawdown, p.drawdown)
    if (!s.best || p.netPnl > s.best.netPnl) s.best = p
    if (!s.worst || p.netPnl < s.worst.netPnl) s.worst = p
  }
  return s
}

export function byMonth(days: readonly DailyStat[]): MonthStat[] {
  const months = Map.groupBy(days, (d) => d.date.slice(0, 7))
  return [...months.entries()].map(([month, ds]) => ({
    month,
    tradingDays: ds.length,
    winDays: ds.filter((d) => d.netPnl > 0).length,
    netPnl: ds.reduce((a, d) => a + d.netPnl, 0),
    fee: ds.reduce((a, d) => a + d.fee, 0),
    turnover: ds.reduce((a, d) => a + d.turnover, 0),
  }))
}

/** Basis points of part over whole; 0 when whole is 0. */
export function bp(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 10_000
}

/**
 * The day plotted as the zero point before the first day of a range: the previous trading day
 * if there is one, otherwise the previous weekday.
 */
export function baselineDate(allDays: readonly DailyStat[], firstInRange: string): string {
  const i = allDays.findIndex((d) => d.date === firstInRange)
  const previous = i > 0 ? allDays[i - 1] : undefined
  if (previous) return previous.date
  const date = new Date(`${firstInRange}T00:00:00Z`)
  do date.setUTCDate(date.getUTCDate() - 1)
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
  return date.toISOString().slice(0, 10)
}

export type RangeKey = '1m' | '3m' | 'ytd' | 'all'

/** Days on or after the range start, measured back from the last trading day. */
export function filterRange(days: readonly DailyStat[], range: RangeKey): DailyStat[] {
  const last = days.at(-1)
  if (!last || range === 'all') return [...days]
  const [y, m, d] = last.date.split('-').map(Number) as [number, number, number]
  const start =
    range === 'ytd' ? `${y}-01-01` : new Date(Date.UTC(y, m - 1 - (range === '1m' ? 1 : 3), d + 1)).toISOString().slice(0, 10)
  return days.filter((day) => day.date >= start)
}
