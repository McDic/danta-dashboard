import { BarChart, HeatmapChart, LineChart } from 'echarts/charts'
import { AxisPointerComponent, CalendarComponent, GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { DayPoint } from './stats.ts'
import { bp } from './stats.ts'
import { bpText, krw, krwCompact } from './format.ts'

echarts.use([BarChart, LineChart, HeatmapChart, GridComponent, TooltipComponent, AxisPointerComponent, VisualMapComponent, CalendarComponent, SVGRenderer])

type Option = echarts.EChartsCoreOption

/** Colors are read from CSS custom properties so the charts follow the light/dark tokens. */
export interface Theme {
  surface: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  grid: string
  baseline: string
  profit: string
  loss: string
  turnover: string
  fee: string
  neutral: string
  profitStrong: string
  lossStrong: string
}

export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    surface: v('--surface'),
    textPrimary: v('--text-primary'),
    textSecondary: v('--text-secondary'),
    textMuted: v('--text-muted'),
    grid: v('--grid'),
    baseline: v('--baseline'),
    profit: v('--profit'),
    loss: v('--loss'),
    turnover: v('--turnover'),
    fee: v('--fee'),
    neutral: v('--neutral'),
    profitStrong: v('--profit-strong'),
    lossStrong: v('--loss-strong'),
  }
}

const BAR_MAX_WIDTH = 24
const FONT = "system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

function signColor(t: Theme, n: number): string {
  return n >= 0 ? t.profit : t.loss
}

/**
 * Profit color above zero and loss color below it, as a vertical gradient over a shape whose
 * value extent is [min, max]. (ECharts' piecewise visualMap crashes when all values share a sign.)
 */
function zeroSplit(t: Theme, min: number, max: number) {
  if (min >= 0) return t.profit
  if (max <= 0) return t.loss
  const zero = max / (max - min)
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: t.profit },
      { offset: zero, color: t.profit },
      { offset: zero, color: t.loss },
      { offset: 1, color: t.loss },
    ],
  }
}

/** 4px rounded data-end, square at the zero baseline, for bars that can go either way. */
function signedBar(t: Theme, value: number, color = signColor(t, value)) {
  return { value, itemStyle: { color, borderRadius: value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } }
}

function baseOption(t: Theme): Option {
  return {
    animation: false,
    textStyle: { fontFamily: FONT, color: t.textSecondary },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.surface,
      borderColor: t.grid,
      textStyle: { color: t.textPrimary, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: t.baseline } },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
  }
}

function dateAxis(t: Theme, dates: string[], gridIndex: number, showLabels: boolean) {
  return {
    type: 'category',
    gridIndex,
    data: dates,
    axisLine: { lineStyle: { color: t.baseline } },
    axisTick: { show: false },
    axisLabel: { show: showLabels, color: t.textMuted, formatter: (d: string) => d.slice(5).replace('-', '/') },
  }
}

function valueAxis(t: Theme, gridIndex: number, name: string) {
  return {
    type: 'value',
    gridIndex,
    name,
    nameTextStyle: { color: t.textMuted, align: 'left' },
    splitNumber: 3,
    axisLabel: { color: t.textMuted, formatter: krwCompact },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
  }
}

function tooltipRows(rows: [string, string][]): string {
  return rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:16px"><span>${k}</span><b>${v}</b></div>`).join('')
}

/**
 * Cumulative net PnL, daily net PnL and drawdown as three stacked panels sharing one date axis.
 * The axis starts at `baseline` (the day before the range) where cumulative PnL and drawdown are 0.
 */
export function pnlOption(t: Theme, points: DayPoint[], baseline: string): Option {
  const dates = [baseline, ...points.map((p) => p.date)]
  const cumMin = Math.min(0, ...points.map((p) => p.cumulative))
  const cumMax = Math.max(0, ...points.map((p) => p.cumulative))
  return {
    ...baseOption(t),
    grid: [
      { left: 56, right: 48, top: 28, height: '42%' },
      { left: 56, right: 48, top: '56%', height: '16%' },
      { left: 56, right: 48, top: '80%', bottom: 28 },
    ],
    xAxis: [dateAxis(t, dates, 0, false), dateAxis(t, dates, 1, false), dateAxis(t, dates, 2, true)],
    yAxis: [valueAxis(t, 0, '누적'), { ...valueAxis(t, 1, '일별'), splitNumber: 2 }, { ...valueAxis(t, 2, '낙폭'), max: 0, splitNumber: 2 }],
    series: [
      {
        name: '누적 순손익',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: [
          { value: 0, itemStyle: { color: t.textMuted } },
          ...points.map((p) => ({ value: p.cumulative, itemStyle: { color: signColor(t, p.cumulative) } })),
        ],
        lineStyle: { width: 2, cap: 'round', join: 'round', color: zeroSplit(t, cumMin, cumMax) },
        areaStyle: { origin: 0, opacity: 0.1, color: zeroSplit(t, Math.min(0, cumMin), Math.max(0, cumMax)) },
        symbol: 'circle',
        symbolSize: 8,
        showSymbol: points.length <= 40,
        itemStyle: { borderColor: t.surface, borderWidth: 2 },
        endLabel: { show: true, color: t.textPrimary, formatter: ({ value }: { value: number }) => krwCompact(value) },
      },
      {
        name: '일별 순손익',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        barMaxWidth: BAR_MAX_WIDTH,
        data: [null, ...points.map((p) => signedBar(t, p.netPnl))],
      },
      {
        name: '낙폭',
        type: 'line',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: [0, ...points.map((p) => p.drawdown)],
        step: 'end',
        symbol: 'none',
        lineStyle: { width: 2, color: t.loss },
        areaStyle: { color: t.loss, opacity: 0.1 },
      },
    ],
    tooltip: {
      ...(baseOption(t).tooltip as object),
      formatter: (params: { dataIndex: number }[]) => {
        const index = params[0]?.dataIndex ?? -1
        if (index === 0) return `<div style="min-width:180px"><div style="margin-bottom:4px">${baseline}</div>${tooltipRows([['기준점', '누적 ₩0']])}</div>`
        const p = points[index - 1]
        if (!p) return ''
        return `<div style="min-width:180px"><div style="margin-bottom:4px">${p.date}</div>${tooltipRows([
          ['일별 순손익', krw(p.netPnl, true)],
          ['누적', krw(p.cumulative, true)],
          ['낙폭', krw(p.drawdown)],
          ['수수료', krw(p.fee)],
          ['거래 종목 수', `${p.instruments}`],
        ])}</div>`
      },
    },
  }
}

/**
 * Round-trip turnover and fees as two panels (different scales, so never one axis).
 * Starts at the same baseline date as pnlOption so the two charts' dates line up.
 */
export function turnoverOption(t: Theme, points: DayPoint[], baseline: string): Option {
  const dates = [baseline, ...points.map((p) => p.date)]
  const top = (color: string) => ({ color, borderRadius: [4, 4, 0, 0] })
  return {
    ...baseOption(t),
    grid: [
      { left: 56, right: 48, top: 28, height: '48%' },
      { left: 56, right: 48, top: '70%', bottom: 28 },
    ],
    xAxis: [dateAxis(t, dates, 0, false), dateAxis(t, dates, 1, true)],
    yAxis: [valueAxis(t, 0, '거래대금'), { ...valueAxis(t, 1, '수수료'), splitNumber: 2 }],
    series: [
      { name: '거래대금', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: BAR_MAX_WIDTH, itemStyle: top(t.turnover), data: [null, ...points.map((p) => p.turnover)] },
      { name: '수수료', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barMaxWidth: BAR_MAX_WIDTH, itemStyle: top(t.fee), data: [null, ...points.map((p) => p.fee)] },
    ],
    tooltip: {
      ...(baseOption(t).tooltip as object),
      formatter: (params: { dataIndex: number }[]) => {
        const p = points[(params[0]?.dataIndex ?? 0) - 1]
        if (!p) return ''
        return `<div style="min-width:200px"><div style="margin-bottom:4px">${p.date}</div>${tooltipRows([
          ['거래대금(왕복)', krw(p.turnover)],
          ['거래대금(청산)', krw(p.exitTurnover)],
          ['수수료', krw(p.fee)],
          ['수수료율', bpText(bp(p.fee, p.turnover))],
          ['순손익/거래대금', bpText(bp(p.netPnl, p.turnover))],
        ])}</div>`
      },
    },
  }
}

const CALENDAR_CELL = 22
const CALENDAR_ROW_HEIGHT = CALENDAR_CELL * 7 + 48

/** One calendar row per year, limited to the months that have data. Diverging blue-gray-red scale. */
export function calendarOption(t: Theme, points: DayPoint[], containerWidth: number): { option: Option; height: number } {
  const first = points[0]?.date
  const last = points.at(-1)?.date
  if (!first || !last) return { option: {}, height: 120 }

  const years: number[] = []
  for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) years.push(y)
  const monthEnd = (ym: string) => {
    const [y, m] = ym.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  }
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.netPnl)))
  const byDate = new Map(points.map((p) => [p.date, p]))

  const option: Option = {
    animation: false,
    textStyle: { fontFamily: FONT, color: t.textSecondary },
    tooltip: {
      trigger: 'item',
      backgroundColor: t.surface,
      borderColor: t.grid,
      textStyle: { color: t.textPrimary, fontSize: 12 },
      formatter: ({ value }: { value: [string, number] }) => {
        const p = byDate.get(value[0])
        return p ? `${p.date}<br/><b>${krw(p.netPnl, true)}</b>` : ''
      },
    },
    visualMap: {
      type: 'continuous',
      min: -maxAbs,
      max: maxAbs,
      calculable: false,
      orient: 'horizontal',
      left: 40,
      bottom: 0,
      itemHeight: 160,
      itemWidth: 10,
      text: ['이익', '손실'],
      textStyle: { color: t.textMuted },
      inRange: { color: [t.lossStrong, t.loss, t.neutral, t.profit, t.profitStrong] },
      formatter: (v: number) => krwCompact(v),
    },
    calendar: years.map((y, i) => {
      const range = [y === years[0] ? `${first.slice(0, 7)}-01` : `${y}-01-01`, y === years.at(-1) ? monthEnd(last.slice(0, 7)) : `${y}-12-31`] as const
      const weeks = Math.ceil((Date.parse(range[1]) - Date.parse(range[0])) / (7 * 86_400_000)) + 2
      return {
      top: 28 + i * CALENDAR_ROW_HEIGHT,
      left: 40,
      width: Math.min(weeks * CALENDAR_CELL, containerWidth - 56),
      cellSize: ['auto', CALENDAR_CELL],
      range,
      itemStyle: { color: t.surface, borderColor: t.surface, borderWidth: 2 },
      splitLine: { show: false },
      dayLabel: { firstDay: 1, nameMap: ['일', '월', '화', '수', '목', '금', '토'], color: t.textMuted, fontSize: 10 },
      monthLabel: { nameMap: 'ZH', formatter: '{M}월', color: t.textMuted },
      yearLabel: { show: years.length > 1, color: t.textMuted },
      }
    }),
    series: years.map((y, i) => ({
      type: 'heatmap',
      coordinateSystem: 'calendar',
      calendarIndex: i,
      itemStyle: { borderRadius: 3, borderColor: t.surface, borderWidth: 2 },
      data: points.filter((p) => p.date.startsWith(String(y))).map((p) => [p.date, p.netPnl]),
    })),
  }
  return { option, height: 28 + years.length * CALENDAR_ROW_HEIGHT + 40 }
}

export { echarts }
