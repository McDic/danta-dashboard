import { describe, expect, it } from 'vitest'
import { buildDashboardData } from '../pipeline/aggregate.ts'
import { parseExits } from '../pipeline/parse.ts'
import { assertPublishable } from '../pipeline/publish-guard.ts'
import { STOCK_SHORT_WIN, USD_LONG_LOSS, sheet } from './fixtures.ts'

const NOW = new Date('2026-01-06T00:00:00Z')

describe('buildDashboardData', () => {
  it('aggregates per day with round-trip turnover per product multiplier', () => {
    const later = [...STOCK_SHORT_WIN]
    later[0] = '2026/01/02'
    const data = buildDashboardData(parseExits(sheet(STOCK_SHORT_WIN, USD_LONG_LOSS, later)), NOW)

    expect(data.days.map((d) => d.date)).toEqual(['2026-01-02', '2026-01-05'])
    expect(data.days[1]).toEqual({
      date: '2026-01-05',
      netPnl: 29700 - 11000,
      fee: 1300,
      grossPnl: 30000 - 10000,
      // stock: (50,000 + 49,000) × 3 × 10; USD: (1,400 + 1,399) × 1 × 10,000
      turnover: 2_970_000 + 27_990_000,
      exitTurnover: 1_470_000 + 13_990_000,
      instruments: 2,
    })
  })

  it('counts distinct instruments per day, regardless of side or number of fills', () => {
    const long = [...STOCK_SHORT_WIN]
    long[3] = '매도' // closes a long in the same instrument: (49,000 − 50,000) × 30 − 300
    long[7] = '-₩30,300'
    const data = buildDashboardData(parseExits(sheet(STOCK_SHORT_WIN, STOCK_SHORT_WIN, long, USD_LONG_LOSS)), NOW)
    expect(data.days[0]?.instruments).toBe(2)
  })

  it('produces output that passes the publish guard and contains no instrument data', () => {
    const data = buildDashboardData(parseExits(sheet(STOCK_SHORT_WIN, USD_LONG_LOSS)), NOW)
    expect(() => assertPublishable(data)).not.toThrow()
    const json = JSON.stringify(data)
    expect(json).not.toMatch(/AXX6A000|A7561000|테스트종목|미국달러|50000|1400/)
  })
})

describe('assertPublishable', () => {
  const day = { date: '2026-01-05', netPnl: 1, fee: 1, grossPnl: 2, turnover: 10, exitTurnover: 5, instruments: 1 }

  it('rejects extra fields', () => {
    expect(() => assertPublishable({ generatedAt: NOW.toISOString(), days: [{ ...day, code: 'AXX6A000' } as typeof day] })).toThrow(/unexpected keys \[code\]/)
  })

  it('rejects extra root fields', () => {
    expect(() => assertPublishable({ generatedAt: NOW.toISOString(), days: [], rows: [] } as never)).toThrow(/unexpected keys/)
  })

  it('rejects non-numeric values', () => {
    expect(() => assertPublishable({ generatedAt: NOW.toISOString(), days: [{ ...day, fee: '테스트종목' as never }] })).toThrow(/finite number/)
  })
})
