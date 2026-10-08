import { SafeError } from './errors.ts'
import { resolveProduct } from './products.ts'

/** One row of 실현손익 내역, validated. Never published as-is: see aggregate.ts. */
export interface Exit {
  date: string
  code: string
  /** 매수 exit closes a short position, 매도 exit closes a long one */
  side: 'buy' | 'sell'
  quantity: number
  entryPrice: number
  exitPrice: number
  multiplier: number
  netPnl: number
  fee: number
}

const COLUMNS = {
  date: '일자',
  code: '종목코드',
  name: '종목명',
  side: 'Exit 방향',
  quantity: '매매 체결량',
  entryPrice: '평균 매매단가',
  exitPrice: '청산가격',
  netPnl: '실현손익',
  fee: '수수료',
} as const

type Column = keyof typeof COLUMNS

const HEADER_SEARCH_ROWS = 20
const MAX_REPORTED_ERRORS = 20
/**
 * The sheet shows the average entry price rounded to 0.1 (stocks) or 0.01 (USD), so the
 * recomputed PnL can be off by up to half a display step per unit. 0.05 × units covers both
 * while a wrong multiplier is off by orders of magnitude.
 */
const RECONCILE_TOLERANCE_PER_UNIT = 0.05
const RECONCILE_TOLERANCE_FIXED = 10

/**
 * Parses sheet rows (from the Sheets API or a CSV export) into validated exits.
 * Throws a SafeError listing every problem by row number and column name only.
 */
export function parseExits(rows: readonly (readonly unknown[])[]): Exit[] {
  const headerIndex = rows.slice(0, HEADER_SEARCH_ROWS).findIndex((r) => r.map(text).includes(COLUMNS.date))
  if (headerIndex < 0) throw new SafeError(`Header row with "${COLUMNS.date}" not found in the first ${HEADER_SEARCH_ROWS} rows`)

  const header = rows[headerIndex]!.map(text)
  const index = {} as Record<Column, number>
  for (const [key, label] of Object.entries(COLUMNS) as [Column, string][]) {
    const i = header.indexOf(label)
    if (i < 0) throw new SafeError(`Missing column "${label}"`)
    index[key] = i
  }

  const exits: Exit[] = []
  const errors: string[] = []

  rows.slice(headerIndex + 1).forEach((row, i) => {
    const dataRow = i + 1
    if (row.every((cell) => text(cell) === '')) return

    const fail = (column: Column, problem: string) => errors.push(`data row ${dataRow}, "${COLUMNS[column]}": ${problem}`)
    const cell = (column: Column) => row[index[column]]

    const date = parseDate(cell('date'))
    if (!date) fail('date', 'not a date')

    const code = text(cell('code'))
    const product = resolveProduct(code, text(cell('name')))
    if (!product) fail('code', 'unknown product; add it to pipeline/products.ts')

    const sideText = text(cell('side'))
    const side = sideText === '매수' ? 'buy' : sideText === '매도' ? 'sell' : undefined
    if (!side) fail('side', 'expected 매수 or 매도')

    const quantity = parseNumber(cell('quantity'))
    if (quantity === undefined || !Number.isInteger(quantity) || quantity <= 0) fail('quantity', 'expected a positive integer')

    const entryPrice = parseNumber(cell('entryPrice'))
    if (entryPrice === undefined || entryPrice <= 0) fail('entryPrice', 'expected a positive number')

    const exitPrice = parseNumber(cell('exitPrice'))
    if (exitPrice === undefined || exitPrice <= 0) fail('exitPrice', 'expected a positive number')

    const netPnl = parseNumber(cell('netPnl'))
    if (netPnl === undefined) fail('netPnl', 'expected a number')

    const fee = parseNumber(cell('fee'))
    if (fee === undefined || fee < 0) fail('fee', 'expected a non-negative number')

    if (!date || !product || !side || quantity === undefined || entryPrice === undefined || exitPrice === undefined || netPnl === undefined || fee === undefined) return

    const units = quantity * product.multiplier
    const expectedGross = (side === 'sell' ? exitPrice - entryPrice : entryPrice - exitPrice) * units
    const tolerance = units * RECONCILE_TOLERANCE_PER_UNIT + RECONCILE_TOLERANCE_FIXED
    if (Math.abs(expectedGross - fee - netPnl) > tolerance) {
      fail('netPnl', `does not match (exit - entry) × qty × ${product.multiplier} - fee; wrong multiplier or a typo`)
      return
    }

    exits.push({ date, code, side, quantity, entryPrice, exitPrice, multiplier: product.multiplier, netPnl, fee })
  })

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_REPORTED_ERRORS)
    const more = errors.length > shown.length ? `\n  ...and ${errors.length - shown.length} more` : ''
    throw new SafeError(`${errors.length} invalid row(s):\n  ${shown.join('\n  ')}${more}`)
  }
  return exits
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

/** Accepts raw numbers (Sheets API UNFORMATTED_VALUE) or formatted text like "-₩1,234" / "₩123,456.70". */
export function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  const s = text(value).replace(/[₩,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined
  return Number(s)
}

/** Google Sheets day 0. */
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30)

/**
 * Accepts 2026/01/05, 2026-01-05, 2026.09.15, "2026. 1. 5", and spreadsheet date serials
 * (IMPORTRANGE can drop the date format, so the API returns e.g. 46027). Returns YYYY-MM-DD.
 */
export function parseDate(value: unknown): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 36526 || value > 73051) return undefined // 2000..2099
    return new Date(SHEETS_EPOCH_MS + value * 86_400_000).toISOString().slice(0, 10)
  }
  const m = /^(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\.?$/.exec(text(value))
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
