/** Synthetic rows only. Never paste real trading records into tests: this directory is committed. */
export const HEADER = ['일자', '종목코드', '종목명', 'Exit 방향', '매매 체결량', '평균 매매단가', '청산가격', '실현손익', '실현 수익률', '수수료', 'Exit 거래대금']

export function sheet(...rows: unknown[][]): unknown[][] {
  // Mimics the real tab: title rows above a header on row 5.
  return [['실현손익 내역'], [], [], [], HEADER, ...rows]
}

// Short 3 contracts of a ×10 stock future: entry 50,000, exit 49,000 → gross +30,000, fee 300.
export const STOCK_SHORT_WIN = ['2026/01/05', 'AXX6A000', '테스트종목 F 202601 (  10)', '매수', 3, '₩50,000.00', '₩49,000.00', '₩29,700', '2.00%', '₩300', '']
// Long 1 USD future: entry 1,400.00, exit 1,399.00 → gross −10,000, fee 1,000.
export const USD_LONG_LOSS = ['2026/01/05', 'A7561000', '미국달러 F 202601', '매도', 1, '₩1,400.00', '₩1,399.00', '-₩11,000', '-0.07%', '₩1,000', '']
