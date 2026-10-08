/**
 * The only data shape that is ever published. Everything here is a per-day aggregate:
 * no instrument codes, names, prices or contract counts, because those can reveal
 * which instruments were traded.
 */
export interface DailyStat {
  /** YYYY-MM-DD */
  date: string
  /** 실현손익, already net of fees */
  netPnl: number
  fee: number
  /** netPnl + fee */
  grossPnl: number
  /** Round-trip notional: (entry + exit) × qty × multiplier */
  turnover: number
  /** Exit-leg notional only: exit × qty × multiplier */
  exitTurnover: number
  /** Distinct instruments (futures codes) exited that day */
  instruments: number
}

export interface DashboardData {
  /** ISO 8601 timestamp */
  generatedAt: string
  /** Sorted ascending by date */
  days: DailyStat[]
}
