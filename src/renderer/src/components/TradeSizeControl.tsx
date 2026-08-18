import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import IconButton from '@/components/IconButton'
import {
  clampTradeSize,
  formatTradeSize,
  MAX_LOT_SIZE,
  MIN_CRYPTO_SIZE,
  MIN_LOT_SIZE,
  TRADE_SIZE_STEP
} from '@/lib/paperTrade'
import { tradeSizeKindForSymbol } from '@shared/pricePrecision'

type TradeSizeControlProps = {
  value: number
  symbol: string
  disabled?: boolean
  onChange: (value: number) => void
}

export default function TradeSizeControl({
  value,
  symbol,
  disabled = false,
  onChange
}: TradeSizeControlProps) {
  const kind = tradeSizeKindForSymbol(symbol)
  const noun = kind === 'lot' ? 'lot size' : 'amount'
  const label = kind === 'lot' ? 'Lot' : 'Amt'
  const display = formatTradeSize(value, kind)
  const [draft, setDraft] = useState(display)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(display)
  }, [display])

  const atMin = kind === 'lot' ? value <= MIN_LOT_SIZE : value <= MIN_CRYPTO_SIZE
  const atMax = kind === 'lot' && value >= MAX_LOT_SIZE

  function commit(raw: string): void {
    const parsed = Number(String(raw).trim().replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setDraft(display)
      return
    }
    const next = clampTradeSize(parsed, kind)
    onChange(next)
    setDraft(formatTradeSize(next, kind))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Escape') {
      setDraft(display)
      event.currentTarget.blur()
    }
  }

  return (
    <div
      className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1 py-0.5"
      title={
        kind === 'lot'
          ? 'Lot size 0.01–100 (0.01 step). Type to enter.'
          : 'Coin amount. Type any positive size — no maximum.'
      }
    >
      <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <IconButton
        tooltip={`Decrease ${noun}`}
        disabled={disabled || atMin}
        onClick={() => onChange(clampTradeSize(value - TRADE_SIZE_STEP, kind))}
        className="!h-6 !w-6"
      >
        <Minus className="h-3 w-3" />
      </IconButton>
      <input
        type="text"
        inputMode="decimal"
        aria-label={kind === 'lot' ? 'Lot size' : 'Coin amount'}
        disabled={disabled}
        value={draft}
        onFocus={(event) => {
          focusedRef.current = true
          event.currentTarget.select()
        }}
        onBlur={(event) => {
          focusedRef.current = false
          commit(event.currentTarget.value)
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        className="h-6 w-14 bg-transparent text-center text-xs font-semibold tabular-nums text-zinc-200 outline-none disabled:opacity-40"
      />
      <IconButton
        tooltip={`Increase ${noun}`}
        disabled={disabled || atMax}
        onClick={() => onChange(clampTradeSize(value + TRADE_SIZE_STEP, kind))}
        className="!h-6 !w-6"
      >
        <Plus className="h-3 w-3" />
      </IconButton>
    </div>
  )
}
