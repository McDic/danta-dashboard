const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })

/** ₩1,234,567 with an explicit sign for non-zero values when signed is true. */
export function krw(n: number, signed = false): string {
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  return `${sign}₩${won.format(Math.abs(Math.round(n)))}`
}

/** Compact Korean units for axes and tiles: 1.2억, 345만, 9,800. */
export function krwCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e8) return `${sign}${trim(abs / 1e8, abs >= 1e10 ? 0 : 1)}억`
  if (abs >= 1e4) return `${sign}${trim(abs / 1e4, abs >= 1e6 ? 0 : 1)}만`
  return `${sign}${won.format(abs)}`
}

export function bpText(n: number): string {
  return `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(2)}bp`
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`
}

function trim(n: number, digits: number): string {
  return n.toLocaleString('ko-KR', { maximumFractionDigits: digits })
}
