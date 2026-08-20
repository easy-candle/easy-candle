import { useRef } from 'react'
import { ArrowDownCircle, ArrowUpCircle, CircleX } from 'lucide-react'
import IconButton from '@/components/IconButton'
import LevelPriceControl, { parseLevelPrice } from '@/components/LevelPriceControl'
import RiskRewardControl from '@/components/RiskRewardControl'
import TradeSizeControl from '@/components/TradeSizeControl'
import { formatPnl, formatPositionSize, pnlScaleForSymbol, unrealizedPnl, canPlaceTicketSide, type TicketOrderType } from '@/lib/paperTrade'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore } from '@/store/replayStore'

export type { TicketOrderType }

type OrderTicketFormProps = {
  compact?: boolean
}

export default function OrderTicketForm({ compact = false }: OrderTicketFormProps) {
  const limitInputRef = useRef<HTMLInputElement>(null)
  const tpInputRef = useRef<HTMLInputElement>(null)
  const slInputRef = useRef<HTMLInputElement>(null)

  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const position = useReplayStore((s) => s.position)
  const pendingOrder = useReplayStore((s) => s.pendingOrder)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const paperClose = useReplayStore((s) => s.paperClose)
  const placeLimit = useReplayStore((s) => s.placeLimit)
  const cancelPending = useReplayStore((s) => s.cancelPending)
  const setPendingPrice = useReplayStore((s) => s.setPendingPrice)
  const setTakeProfit = useReplayStore((s) => s.setTakeProfit)
  const setStopLoss = useReplayStore((s) => s.setStopLoss)
  const ticketTakeProfit = useReplayStore((s) => s.ticketTakeProfit)
  const ticketStopLoss = useReplayStore((s) => s.ticketStopLoss)
  const ticketLimitPrice = useReplayStore((s) => s.ticketLimitPrice)
  const setTicketTakeProfit = useReplayStore((s) => s.setTicketTakeProfit)
  const setTicketStopLoss = useReplayStore((s) => s.setTicketStopLoss)
  const setTicketLimitPrice = useReplayStore((s) => s.setTicketLimitPrice)
  const ticketOrderType = useReplayStore((s) => s.ticketOrderType)
  const setTicketOrderType = useReplayStore((s) => s.setTicketOrderType)
  const pricePick = useReplayStore((s) => s.pricePick)
  const setPricePick = useReplayStore((s) => s.setPricePick)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const setTradeSize = useReplayStore((s) => s.setTradeSize)
  const symbol = useReplayStore((s) => s.symbol)
  const pricePrecision = usePricePrecision()

  const busy = replayLoading || replayStatus === 'ended' || !currentCandle
  const mark = currentCandle?.close
  const orderType = ticketOrderType
  const canSubmit = !busy && !position && !pendingOrder
  const canClose = !busy && Boolean(position)
  const canCancel = !busy && Boolean(pendingOrder)
  const sizeValue = position?.lots ?? pendingOrder?.lots ?? tradeSize
  const sizeLocked = Boolean(position || pendingOrder)
  const limitPrice = pendingOrder?.price ?? ticketLimitPrice
  const liveTp = position?.takeProfit ?? pendingOrder?.takeProfit ?? null
  const liveSl = position?.stopLoss ?? pendingOrder?.stopLoss ?? null
  const tpValue = liveTp ?? ticketTakeProfit
  const slValue = liveSl ?? ticketStopLoss
  const levelsLive = Boolean(position || pendingOrder)
  const ticketLevels = {
    orderType,
    markPrice: mark,
    limitPrice,
    takeProfit: tpValue,
    stopLoss: slValue
  }
  const canBuy = canSubmit && canPlaceTicketSide('long', ticketLevels)
  const canSell = canSubmit && canPlaceTicketSide('short', ticketLevels)
  const openPnl = unrealizedPnl(
    position,
    mark,
    pnlScaleForSymbol(symbol, position?.lots ?? tradeSize)
  )

  function readLevel(input: HTMLInputElement | null, fallback: number | null): number | null {
    const parsed = parseLevelPrice(input?.value ?? '')
    if (parsed === undefined) return fallback
    return parsed
  }

  function applyLevels(tp: number | null, sl: number | null): void {
    if (tp != null) setTakeProfit(tp, { linkRr: sl == null })
    if (sl != null) setStopLoss(sl, { linkRr: tp == null })
  }

  function onTpChange(value: number | null): void {
    if (levelsLive) {
      setTakeProfit(value, { linkRr: true })
      return
    }
    setTicketTakeProfit(value)
  }

  function onSlChange(value: number | null): void {
    if (levelsLive) {
      setStopLoss(value, { linkRr: true })
      return
    }
    setTicketStopLoss(value)
  }

  function submit(side: 'long' | 'short'): void {
    if (pricePick) setPricePick(null)
    const tp = readLevel(tpInputRef.current, tpValue)
    const sl = readLevel(slInputRef.current, slValue)
    if (orderType === 'limit') {
      const price = readLevel(limitInputRef.current, limitPrice)
      placeLimit(side, price ?? Number.NaN)
    } else if (side === 'long') {
      paperBuy()
    } else {
      paperSell()
    }
    const state = useReplayStore.getState()
    if (!state.position && !state.pendingOrder) return
    applyLevels(tp, sl)
  }

  function onLimitChange(value: number | null): void {
    if (value == null) {
      if (!pendingOrder) setTicketLimitPrice(null)
      return
    }
    if (pendingOrder) {
      setPendingPrice(value)
      return
    }
    setTicketLimitPrice(value)
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
      active
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
    }`

  return (
    <div className={`flex flex-col gap-2 ${compact ? '' : 'min-h-0'}`}>
      <div className="flex rounded border border-zinc-800 bg-zinc-900/40 p-0.5">
        <button
          type="button"
          aria-pressed={orderType === 'market'}
          className={tabClass(orderType === 'market')}
          onClick={() => setTicketOrderType('market')}
        >
          Market
        </button>
        <button
          type="button"
          aria-pressed={orderType === 'limit'}
          className={tabClass(orderType === 'limit')}
          onClick={() => setTicketOrderType('limit')}
        >
          Limit
        </button>
      </div>

      <TradeSizeControl
        value={sizeValue}
        symbol={symbol}
        disabled={sizeLocked || busy}
        onChange={setTradeSize}
      />

      {orderType === 'limit' && (
        <LevelPriceControl
          label="Price"
          ariaLabel="Limit price"
          title="Limit price. Type or pick from the chart. Buy Limit must be below market; Sell Limit must be above market."
          value={limitPrice}
          precision={pricePrecision}
          disabled={busy || Boolean(position)}
          picking={pricePick === 'limit'}
          inputRef={limitInputRef}
          onChange={onLimitChange}
          onPickClick={() => setPricePick('limit')}
        />
      )}

      <LevelPriceControl
        label="TP"
        ariaLabel="Take profit"
        title="Take profit price. Type to set, or use the crosshair to pick from the chart. Long TP is above entry, short TP is below. First fill seeds the other level at the R:R guide."
        value={tpValue}
        precision={pricePrecision}
        disabled={busy}
        picking={pricePick === 'tp'}
        inputRef={tpInputRef}
        onChange={onTpChange}
        onPickClick={() => setPricePick('tp')}
      />
      <LevelPriceControl
        label="SL"
        ariaLabel="Stop loss"
        title="Stop loss price. Type to set, or use the crosshair to pick from the chart. Long SL is below current price, short SL is above. First fill seeds the other level at the R:R guide."
        value={slValue}
        precision={pricePrecision}
        disabled={busy}
        picking={pricePick === 'sl'}
        inputRef={slInputRef}
        onChange={onSlChange}
        onPickClick={() => setPricePick('sl')}
      />

      <div className={`flex ${compact ? 'flex-wrap' : ''} items-stretch gap-1`}>
        <IconButton
          tooltip={
            !canBuy && orderType === 'limit' && limitPrice == null
              ? 'Pick or type a limit price'
              : !canBuy && orderType === 'limit'
                ? 'Buy Limit needs a price below market, with TP above and SL below entry'
                : !canBuy
                  ? 'TP/SL levels do not allow a long'
                  : orderType === 'limit'
                    ? 'Buy Limit — wait for price to trade down to the limit'
                    : 'Buy — open long at the current close'
          }
          disabled={!canBuy}
          onClick={() => submit('long')}
          tone="success"
          active
          className="!h-8 !w-auto min-w-0 flex-1 gap-1 px-2.5"
        >
          <ArrowUpCircle className="h-4 w-4" />
          <span className="text-xs font-semibold">Buy</span>
        </IconButton>
        <IconButton
          tooltip={
            !canSell && orderType === 'limit' && limitPrice == null
              ? 'Pick or type a limit price'
              : !canSell && orderType === 'limit'
                ? 'Sell Limit needs a price above market, with TP below and SL above entry'
                : !canSell
                  ? 'TP/SL levels do not allow a short'
                  : orderType === 'limit'
                    ? 'Sell Limit — wait for price to trade up to the limit'
                    : 'Sell — open short at the current close'
          }
          disabled={!canSell}
          onClick={() => submit('short')}
          tone="danger"
          active
          className="!h-8 !w-auto min-w-0 flex-1 gap-1 px-2.5"
        >
          <ArrowDownCircle className="h-4 w-4" />
          <span className="text-xs font-semibold">Sell</span>
        </IconButton>
      </div>

      {canClose && (
        <IconButton
          tooltip="Close open position at current close"
          onClick={paperClose}
          tone="accent"
          className="!h-8 !w-full gap-1 px-2.5"
        >
          <CircleX className="h-4 w-4" />
          <span className="text-xs font-semibold">Close</span>
        </IconButton>
      )}

      {canCancel && (
        <IconButton
          tooltip="Cancel unfilled limit order"
          onClick={cancelPending}
          tone="accent"
          className="!h-8 !w-full gap-1 px-2.5"
        >
          <CircleX className="h-4 w-4" />
          <span className="text-xs font-semibold">Cancel</span>
        </IconButton>
      )}

      <RiskRewardControl compact={compact} />

      {pendingOrder && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
            Pending
          </span>
          <span
            className={
              pendingOrder.side === 'long'
                ? 'font-semibold text-emerald-400'
                : 'font-semibold text-red-400'
            }
          >
            {pendingOrder.side === 'long' ? 'BUY LIMIT' : 'SELL LIMIT'}
          </span>
          <span className="text-zinc-500">{formatPositionSize(pendingOrder.lots, symbol)}</span>
          <span className="text-zinc-500">
            @ {formatAssetPrice(pendingOrder.price, pricePrecision)}
          </span>
        </div>
      )}

      {position && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
          <span
            className={
              position.side === 'long'
                ? 'font-semibold text-emerald-400'
                : 'font-semibold text-red-400'
            }
          >
            {position.side.toUpperCase()}
          </span>
          <span className="text-zinc-500">{formatPositionSize(position.lots, symbol)}</span>
          <span className="text-zinc-500">
            @ {formatAssetPrice(position.entryPrice, pricePrecision)}
          </span>
          <span
            className={`ml-auto font-medium ${
              openPnl != null && openPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {formatPnl(openPnl)}
          </span>
        </div>
      )}
    </div>
  )
}
