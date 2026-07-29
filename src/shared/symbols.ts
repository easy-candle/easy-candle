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
  },
  {
    id: 'ethusdt',
    label: 'ETH/USDT',
    binanceSymbol: 'ETHUSDT'
  },
  {
    id: 'bnbusdt',
    label: 'BNB/USDT',
    binanceSymbol: 'BNBUSDT'
  },
  {
    id: 'solusdt',
    label: 'SOL/USDT',
    binanceSymbol: 'SOLUSDT'
  },
  {
    id: 'xrpusdt',
    label: 'XRP/USDT',
    binanceSymbol: 'XRPUSDT'
  },
  {
    id: 'adausdt',
    label: 'ADA/USDT',
    binanceSymbol: 'ADAUSDT'
  },
  {
    id: 'dogeusdt',
    label: 'DOGE/USDT',
    binanceSymbol: 'DOGEUSDT'
  },
  {
    id: 'avaxusdt',
    label: 'AVAX/USDT',
    binanceSymbol: 'AVAXUSDT'
  },
  {
    id: 'linkusdt',
    label: 'LINK/USDT',
    binanceSymbol: 'LINKUSDT'
  },
  {
    id: 'ltcusdt',
    label: 'LTC/USDT',
    binanceSymbol: 'LTCUSDT'
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
