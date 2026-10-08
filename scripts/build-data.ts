/**
 * Fetches the exit records, validates and aggregates them per day, and writes public/data.json.
 *
 *   npm run data                 # from Google Sheets (SHEET_ID, optional SHEET_RANGE)
 *   npm run data:csv             # from ./format.csv (a CSV export of the tab)
 *
 * Runs in public CI logs: never print row contents. Only SafeError messages are shown.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { buildDashboardData } from '../pipeline/aggregate.ts'
import { parseCsv } from '../pipeline/csv.ts'
import { SafeError, safeMessage } from '../pipeline/errors.ts'
import { parseExits } from '../pipeline/parse.ts'
import { assertPublishable } from '../pipeline/publish-guard.ts'
import { fetchSheetValues } from '../pipeline/sheets.ts'

const DEFAULT_RANGE = "'실현손익 내역'!A:K"

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      csv: { type: 'string' },
      out: { type: 'string', default: 'public/data.json' },
    },
  })

  let rows: unknown[][]
  if (args.csv) {
    rows = parseCsv(readFileSync(args.csv, 'utf8'))
  } else {
    const sheetId = process.env.SHEET_ID
    if (!sheetId) throw new SafeError('SHEET_ID is not set (or pass --csv <file>)')
    rows = await fetchSheetValues(sheetId, process.env.SHEET_RANGE || DEFAULT_RANGE)
  }

  const exits = parseExits(rows)
  if (exits.length === 0) throw new SafeError('No exit records found; refusing to publish an empty dashboard')

  const data = buildDashboardData(exits, new Date())
  assertPublishable(data)

  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, JSON.stringify(data))
  console.log(`Wrote ${data.days.length} trading day(s) to ${args.out}`)
}

main().catch((err: unknown) => {
  console.error(safeMessage(err))
  if (process.env.DEBUG_UNSAFE === '1' && !process.env.CI) console.error(err)
  process.exitCode = 1
})
