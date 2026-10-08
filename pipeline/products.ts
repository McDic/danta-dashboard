/**
 * Contract multipliers per product. A wrong multiplier is caught by the PnL reconciliation
 * in parse.ts, and an unknown product fails the build, so a new product is never guessed.
 */
export interface Product {
  kind: 'stock' | 'index' | 'currency'
  /** KRW notional = price × multiplier × contracts */
  multiplier: number
}

/**
 * Keyed by the 2-character underlying id in KRX futures codes: A + underlying(2) + year(1) + month(1) + 000.
 * Only 75 is confirmed by real data so far. Check the others against the first real trade.
 */
const BY_UNDERLYING: Record<string, Product> = {
  '75': { kind: 'currency', multiplier: 10_000 }, // 미국달러선물: USD 10,000/contract, price in KRW per USD
  '01': { kind: 'index', multiplier: 250_000 }, // 코스피200선물
  '05': { kind: 'index', multiplier: 50_000 }, // 미니코스피200선물
  '06': { kind: 'index', multiplier: 10_000 }, // 코스닥150선물
}

const FUTURES_CODE = /^A[0-9A-Z]{7}$/
/** Stock futures names end with their share multiplier, e.g. "테스트종목 F 202612 (  10)". */
const STOCK_MULTIPLIER = /\(\s*(\d+)\s*\)\s*$/

export function resolveProduct(code: string, name: string): Product | undefined {
  if (!FUTURES_CODE.test(code)) return undefined
  const stock = STOCK_MULTIPLIER.exec(name)
  if (stock) return { kind: 'stock', multiplier: Number(stock[1]) }
  return BY_UNDERLYING[code.slice(1, 3)]
}
