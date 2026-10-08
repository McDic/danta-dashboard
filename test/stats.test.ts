import { describe, expect, it } from 'vitest'
import type { DailyStat } from '../shared/types.ts'
import { baselineDate, byMonth, filterRange, summarize, withCumulative } from '../src/stats.ts'

const day = (date: string, netPnl: number): DailyStat => ({ date, netPnl, fee: 10, grossPnl: netPnl + 10, turnover: 1000, exitTurnover: 500, instruments: 2 })

describe('stats', () => {
  const days = [day('2025-12-30', 100), day('2026-01-02', -150), day('2026-01-05', 30), day('2026-02-03', 200)]

  it('computes cumulative PnL and drawdown from the running peak', () => {
    expect(withCumulative(days).map((p) => [p.cumulative, p.drawdown])).toEqual([
      [100, 0],
      [-50, -150],
      [-20, -120],
      [180, 0],
    ])
  })

  it('summarizes', () => {
    const s = summarize(withCumulative(days))
    expect(s).toMatchObject({ tradingDays: 4, winDays: 3, netPnl: 180, maxDrawdown: -150, instrumentDays: 8 })
    expect(s.best?.date).toBe('2026-02-03')
    expect(s.worst?.date).toBe('2026-01-02')
  })

  it('treats an early loss as drawdown from zero', () => {
    expect(withCumulative([day('2026-01-02', -50)])[0]?.drawdown).toBe(-50)
  })

  it('groups by month', () => {
    expect(byMonth(days).map((m) => [m.month, m.tradingDays, m.netPnl])).toEqual([
      ['2025-12', 1, 100],
      ['2026-01', 2, -120],
      ['2026-02', 1, 200],
    ])
  })

  it('filters ranges relative to the last trading day', () => {
    expect(filterRange(days, '1m').map((d) => d.date)).toEqual(['2026-01-05', '2026-02-03'])
    expect(filterRange(days, '3m')).toHaveLength(4)
    expect(filterRange(days, 'ytd')).toHaveLength(3)
    expect(filterRange(days, 'all')).toHaveLength(4)
  })

  it('uses the previous trading day as the baseline, else the previous weekday', () => {
    expect(baselineDate(days, '2026-01-05')).toBe('2026-01-02')
    expect(baselineDate(days, '2025-12-30')).toBe('2025-12-29') // Tuesday → Monday
    expect(baselineDate([day('2026-09-14', 1)], '2026-09-14')).toBe('2026-09-11') // Monday → Friday
  })
})
