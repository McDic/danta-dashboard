import type { DashboardData } from '../shared/types.ts'
import { calendarOption, echarts, pnlOption, readTheme, turnoverOption } from './charts.ts'
import { bpText, krw, krwCompact, percent } from './format.ts'
import { baselineDate, bp, byMonth, filterRange, summarize, withCumulative, type DayPoint, type MonthStat, type RangeKey } from './stats.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const charts = {
  pnl: echarts.init($('chart-pnl')),
  turnover: echarts.init($('chart-turnover')),
  calendar: echarts.init($('chart-calendar')),
}

let data: DashboardData = { generatedAt: '', days: [] }
let range: RangeKey = 'all'

function signClass(n: number): string {
  return n > 0 ? 'profit' : n < 0 ? 'loss' : ''
}

function render(): void {
  const points = withCumulative(filterRange(data.days, range))
  const s = summarize(points)
  const theme = readTheme()

  const hero = $('hero-value')
  hero.textContent = krw(s.netPnl, true)
  hero.className = `hero-value ${signClass(s.netPnl)}`
  $('hero-sub').textContent = points.length
    ? `${points[0]!.date} ~ ${points.at(-1)!.date} · ${s.tradingDays}거래일 · 수수료 차감 전 ${krw(s.grossPnl, true)}`
    : '데이터 없음'

  const tiles: [string, string, string, number?][] = [
    ['수익일', percent(s.winDays, s.tradingDays), `${s.winDays} / ${s.tradingDays}일`],
    ['거래 종목 수', `${s.instrumentDays}`, `일별 고유 종목 합 · 일평균 ${s.tradingDays ? (s.instrumentDays / s.tradingDays).toFixed(1) : '0'}`],
    ['총 수수료', krw(s.fee), `거래대금의 ${bpText(bp(s.fee, s.turnover))}`],
    ['거래대금 (왕복)', krwCompact(s.turnover), `청산 기준 ${krwCompact(s.exitTurnover)}`],
    ['순손익 / 거래대금', bpText(bp(s.netPnl, s.turnover)), '왕복 거래대금 대비', s.netPnl],
    ['최대 낙폭', krw(s.maxDrawdown), '누적 순손익 고점 대비', s.maxDrawdown],
    ['최고의 날', s.best ? krw(s.best.netPnl, true) : '–', s.best?.date ?? '', s.best?.netPnl],
    ['최악의 날', s.worst ? krw(s.worst.netPnl, true) : '–', s.worst?.date ?? '', s.worst?.netPnl],
  ]
  $('tiles').replaceChildren(
    ...tiles.map(([label, value, sub, sign]) => {
      const el = document.createElement('div')
      el.className = 'tile'
      el.innerHTML = `<p class="label"></p><p class="value"></p><p class="sub"></p>`
      el.children[0]!.textContent = label
      el.children[1]!.textContent = value
      el.children[1]!.className = `value ${sign === undefined ? '' : signClass(sign)}`
      el.children[2]!.textContent = sub
      return el
    }),
  )

  if (points.length) {
    const baseline = baselineDate(data.days, points[0]!.date)
    charts.pnl.setOption(pnlOption(theme, points, baseline), true)
    charts.turnover.setOption(turnoverOption(theme, points, baseline), true)
  } else {
    charts.pnl.clear()
    charts.turnover.clear()
  }
  const calendar = calendarOption(theme, points, $('chart-calendar').clientWidth)
  $('chart-calendar').style.height = `${calendar.height}px`
  charts.calendar.resize()
  charts.calendar.setOption(calendar.option, true)

  renderTable($('table-month'), MONTH_COLUMNS, byMonth(points).reverse())
  dayRows = points
  renderDayTable()
}

/** A table column: display text, optional profit/loss coloring, and the value to sort by. */
interface Column<T> {
  label: string
  text: (row: T) => string
  sign?: (row: T) => number
  sort?: (row: T) => number | string
}

const MONTH_COLUMNS: Column<MonthStat>[] = [
  { label: '월', text: (m) => m.month },
  { label: '거래일', text: (m) => `${m.tradingDays}` },
  { label: '수익일', text: (m) => `${m.winDays}` },
  { label: '순손익', text: (m) => krw(m.netPnl, true), sign: (m) => m.netPnl },
  { label: '수수료', text: (m) => krw(m.fee) },
  { label: '거래대금', text: (m) => krwCompact(m.turnover) },
  { label: '순손익/거래대금', text: (m) => bpText(bp(m.netPnl, m.turnover)) },
]

const DAY_COLUMNS: Column<DayPoint>[] = [
  { label: '일자', text: (p) => p.date, sort: (p) => p.date },
  { label: '순손익', text: (p) => krw(p.netPnl, true), sign: (p) => p.netPnl, sort: (p) => p.netPnl },
  { label: '수수료 차감 전', text: (p) => krw(p.grossPnl, true), sort: (p) => p.grossPnl },
  { label: '수수료', text: (p) => krw(p.fee), sort: (p) => p.fee },
  { label: '거래대금(왕복)', text: (p) => krw(p.turnover), sort: (p) => p.turnover },
  { label: '순손익/거래대금', text: (p) => bpText(bp(p.netPnl, p.turnover)), sort: (p) => bp(p.netPnl, p.turnover) },
  { label: '종목 수', text: (p) => `${p.instruments}`, sort: (p) => p.instruments },
  { label: '누적', text: (p) => krw(p.cumulative, true), sign: (p) => p.cumulative, sort: (p) => p.cumulative },
]

let dayRows: DayPoint[] = []
const daySort = { column: 0, descending: true }

function renderDayTable(): void {
  const key = DAY_COLUMNS[daySort.column]!.sort!
  const sorted = [...dayRows].sort((a, b) => {
    const [x, y] = [key(a), key(b)]
    const order = x < y ? -1 : x > y ? 1 : a.date.localeCompare(b.date)
    return daySort.descending ? -order : order
  })
  renderTable($('table-day'), DAY_COLUMNS, sorted, {
    ...daySort,
    onSort: (column) => {
      daySort.descending = column === daySort.column ? !daySort.descending : true
      daySort.column = column
      renderDayTable()
    },
  })
}

interface SortState {
  column: number
  descending: boolean
  onSort: (column: number) => void
}

function renderTable<T>(table: HTMLTableElement, columns: Column<T>[], rows: T[], sort?: SortState): void {
  const head = document.createElement('thead')
  head.insertRow().append(
    ...columns.map((c, i) => {
      const th = document.createElement('th')
      if (!sort || !c.sort) {
        th.textContent = c.label
        return th
      }
      const active = sort.column === i
      th.setAttribute('aria-sort', active ? (sort.descending ? 'descending' : 'ascending') : 'none')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'sort'
      button.textContent = `${c.label}${active ? (sort.descending ? ' ▼' : ' ▲') : ''}`
      button.addEventListener('click', () => sort.onSort(i))
      th.append(button)
      return th
    }),
  )
  const body = document.createElement('tbody')
  for (const row of rows) {
    const tr = body.insertRow()
    for (const c of columns) {
      const td = tr.insertCell()
      td.textContent = c.text(row)
      if (c.sign) td.className = signClass(c.sign(row))
    }
  }
  table.replaceChildren(head, body)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-range]')) {
  button.addEventListener('click', () => {
    range = button.dataset.range as RangeKey
    for (const b of document.querySelectorAll('[data-range]')) b.setAttribute('aria-pressed', String(b === button))
    render()
  })
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render)
// On width changes, re-render (not just resize) so the calendar recomputes its cell width.
// Height changes are ignored: render() itself changes the page height.
let lastWidth = 0
const resizeObserver = new ResizeObserver(([entry]) => {
  const width = entry?.contentRect.width ?? 0
  if (width === lastWidth) return
  lastWidth = width
  Object.values(charts).forEach((c) => c.resize())
  if (data.days.length) render()
})
resizeObserver.observe(document.querySelector('.page')!)

async function load(): Promise<void> {
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = (await res.json()) as DashboardData
    const updated = new Date(data.generatedAt)
    $('updated').textContent = `업데이트 ${updated.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })}`
    render()
  } catch (err) {
    console.error(err)
    const box = $('error')
    box.hidden = false
    box.textContent = `데이터를 불러오지 못했습니다 (${err instanceof Error ? err.message : 'unknown'}). 로컬에서는 먼저 npm run data:csv 를 실행하세요.`
  }
}

void load()
