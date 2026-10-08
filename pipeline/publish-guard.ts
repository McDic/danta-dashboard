import type { DailyStat, DashboardData } from '../shared/types.ts'
import { SafeError } from './errors.ts'

const DAY_KEYS: readonly (keyof DailyStat)[] = ['date', 'netPnl', 'fee', 'grossPnl', 'turnover', 'exitTurnover', 'instruments']
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Last line of defence before anything is written for publishing: the output must match the
 * whitelisted shape exactly, so a future change can't leak instrument codes, names or prices.
 */
export function assertPublishable(data: DashboardData): void {
  assertKeys(data, ['generatedAt', 'days'], 'root')
  if (Number.isNaN(Date.parse(data.generatedAt))) throw new SafeError('generatedAt is not a timestamp')
  if (!Array.isArray(data.days)) throw new SafeError('days is not an array')

  data.days.forEach((day, i) => {
    assertKeys(day, DAY_KEYS, `days[${i}]`)
    if (typeof day.date !== 'string' || !DATE.test(day.date)) throw new SafeError(`days[${i}].date is not YYYY-MM-DD`)
    for (const key of DAY_KEYS) {
      if (key !== 'date' && !Number.isFinite(day[key])) throw new SafeError(`days[${i}].${key} is not a finite number`)
    }
  })
}

function assertKeys(value: object, allowed: readonly string[], where: string): void {
  const keys = Object.keys(value)
  const unexpected = keys.filter((k) => !allowed.includes(k))
  const missing = allowed.filter((k) => !keys.includes(k))
  if (unexpected.length || missing.length) {
    throw new SafeError(`${where} has unexpected keys [${unexpected.join(', ')}] or missing keys [${missing.join(', ')}]`)
  }
}
