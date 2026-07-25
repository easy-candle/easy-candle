export type SymbolConfig = {
  id: string
  label: string
  binanceSymbol: string
}

export const SYMBOLS: SymbolConfig[] = [
  {
    id: 'btcusdt',
    label: 'BTC/USDT',
    binanceSymbol: 'BTCUSDT'
  }
]

export const DEFAULT_SYMBOL: SymbolConfig = SYMBOLS[0]

/** Allowlisted Binance symbols (uppercase). */
export const ALLOWED_SYMBOLS = new Set(
  SYMBOLS.map((symbol) => symbol.binanceSymbol.toUpperCase())
)

export function isAllowedSymbol(symbol: string): boolean {
  return ALLOWED_SYMBOLS.has(String(symbol || '').toUpperCase())
}
