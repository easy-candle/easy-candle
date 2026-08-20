export type SymbolConfig = {
  id: string
  label: string
  binanceSymbol: string
  /** Top-level group key (e.g. "crypto"). */
  group: string
}

export type SymbolGroup = {
  key: string
  label: string
  /** Whether the group is collapsed by default in the symbol picker. */
  collapsed: boolean
  symbols: SymbolConfig[]
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    key: 'crypto',
    label: 'Crypto',
    collapsed: false,
    symbols: [
      {
        id: 'btcusdt',
        label: 'BTC/USDT',
        binanceSymbol: 'BTCUSDT',
        group: 'crypto'
      },
      {
        id: 'ethusdt',
        label: 'ETH/USDT',
        binanceSymbol: 'ETHUSDT',
        group: 'crypto'
      },
      {
        id: 'bnbusdt',
        label: 'BNB/USDT',
        binanceSymbol: 'BNBUSDT',
        group: 'crypto'
      },
      {
        id: 'solusdt',
        label: 'SOL/USDT',
        binanceSymbol: 'SOLUSDT',
        group: 'crypto'
      },
      {
        id: 'adausdt',
        label: 'ADA/USDT',
        binanceSymbol: 'ADAUSDT',
        group: 'crypto'
      },
      {
        id: 'avaxusdt',
        label: 'AVAX/USDT',
        binanceSymbol: 'AVAXUSDT',
        group: 'crypto'
      },
      {
        id: 'dotusdt',
        label: 'DOT/USDT',
        binanceSymbol: 'DOTUSDT',
        group: 'crypto'
      },
      {
        id: 'nearusdt',
        label: 'NEAR/USDT',
        binanceSymbol: 'NEARUSDT',
        group: 'crypto'
      },
      {
        id: 'xrpusdt',
        label: 'XRP/USDT',
        binanceSymbol: 'XRPUSDT',
        group: 'crypto'
      },
      {
        id: 'linkusdt',
        label: 'LINK/USDT',
        binanceSymbol: 'LINKUSDT',
        group: 'crypto'
      },
      {
        id: 'ltcusdt',
        label: 'LTC/USDT',
        binanceSymbol: 'LTCUSDT',
        group: 'crypto'
      },
      {
        id: 'atomusdt',
        label: 'ATOM/USDT',
        binanceSymbol: 'ATOMUSDT',
        group: 'crypto'
      },
      {
        id: 'uniusdt',
        label: 'UNI/USDT',
        binanceSymbol: 'UNIUSDT',
        group: 'crypto'
      },
      {
        id: 'maticusdt',
        label: 'MATIC/USDT',
        binanceSymbol: 'MATICUSDT',
        group: 'crypto'
      },
      {
        id: 'dogeusdt',
        label: 'DOGE/USDT',
        binanceSymbol: 'DOGEUSDT',
        group: 'crypto'
      },
      {
        id: 'shibusdt',
        label: 'SHIB/USDT',
        binanceSymbol: 'SHIBUSDT',
        group: 'crypto'
      },
      {
        id: 'pepeusdt',
        label: 'PEPE/USDT',
        binanceSymbol: 'PEPEUSDT',
        group: 'crypto'
      }
    ]
  }
]

export const SYMBOLS: SymbolConfig[] = SYMBOL_GROUPS.flatMap((group) => group.symbols)

export const DEFAULT_SYMBOL: SymbolConfig = SYMBOLS[0]

/** Allowlisted Binance symbols (uppercase). */
export const ALLOWED_SYMBOLS = new Set(SYMBOLS.map((symbol) => symbol.binanceSymbol.toUpperCase()))

export function isAllowedSymbol(symbol: string): boolean {
  return ALLOWED_SYMBOLS.has(String(symbol || '').toUpperCase())
}
