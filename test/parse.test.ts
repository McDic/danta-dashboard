import { describe, expect, it } from 'vitest'
import { SafeError } from '../pipeline/errors.ts'
import { parseDate, parseExits, parseNumber } from '../pipeline/parse.ts'
import { STOCK_SHORT_WIN, USD_LONG_LOSS, sheet } from './fixtures.ts'

describe('parseExits', () => {
  it('finds the header below title rows and parses formatted values', () => {
    const [stock, usd] = parseExits(sheet(STOCK_SHORT_WIN, USD_LONG_LOSS))
    expect(stock).toMatchObject({ date: '2026-01-05', side: 'buy', quantity: 3, entryPrice: 50000, exitPrice: 49000, multiplier: 10, netPnl: 29700, fee: 300 })
    expect(usd).toMatchObject({ side: 'sell', multiplier: 10_000, netPnl: -11000, fee: 1000 })
  })

  it('accepts raw numbers from the Sheets API', () => {
    const row = ['2026/01/05', 'AXX6A000', '테스트종목 F 202601 (  10)', '매수', 3, 50000, 49000, 29700, 0.02, 300, 0]
    expect(parseExits(sheet(row))[0]?.netPnl).toBe(29700)
  })

  it('skips blank rows', () => {
    expect(parseExits(sheet(STOCK_SHORT_WIN, ['', '', ''], []))).toHaveLength(1)
  })

  it('accepts a trailing "*" after the stock multiplier', () => {
    const row = [...STOCK_SHORT_WIN]
    row[2] = '테스트종목 F 202601 (  10)*'
    expect(parseExits(sheet(row))[0]?.multiplier).toBe(10)
  })

  it('rejects unknown products', () => {
    const row = [...STOCK_SHORT_WIN]
    row[1] = 'A9961000'
    row[2] = '알수없음 F 202601'
    expect(() => parseExits(sheet(row))).toThrow(/unknown product/)
  })

  it('rejects PnL that does not reconcile with the multiplier', () => {
    const row = [...USD_LONG_LOSS]
    row[7] = '-₩1,010' // as if the multiplier were 1,000
    expect(() => parseExits(sheet(row))).toThrow(/does not match/)
  })

  it('tolerates rounding of the displayed average price', () => {
    const row = [...STOCK_SHORT_WIN]
    row[5] = '₩50,000.05' // true average 50,000.05 shown, PnL computed from it is 29,701.5
    expect(parseExits(sheet(row))).toHaveLength(1)
  })

  it('never includes cell values in error messages', () => {
    const row = [...STOCK_SHORT_WIN]
    row[3] = 'SECRET_SIDE'
    row[1] = 'SECRET_CODE'
    try {
      parseExits(sheet(row))
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(SafeError)
      expect((err as Error).message).not.toMatch(/SECRET/)
      expect((err as Error).message).toMatch(/data row 1/)
    }
  })

  it('fails when a required column is missing', () => {
    expect(() => parseExits([['일자', '종목코드']])).toThrow(/Missing column/)
  })
})

describe('parseNumber / parseDate', () => {
  it.each([
    ['₩1,234', 1234],
    ['-₩12,345', -12345],
    ['₩123,456.70', 123456.7],
    [42, 42],
    ['abc', undefined],
    ['', undefined],
  ])('parseNumber(%j) = %j', (input, expected) => expect(parseNumber(input)).toBe(expected))

  it.each([
    ['2026/01/05', '2026-01-05'],
    ['2026-9-5', '2026-09-05'],
    ['2026. 1. 5', '2026-01-05'],
    ['2026/02/30', undefined],
    ['15/09/2026', undefined],
    [46027, '2026-01-05'],
    [46027.5, undefined],
  ])('parseDate(%j) = %j', (input, expected) => expect(parseDate(input)).toBe(expected))
})
