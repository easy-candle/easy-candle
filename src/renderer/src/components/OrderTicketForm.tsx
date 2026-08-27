import { useRef } from 'react'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import LevelPriceControl, { parseLevelPrice } from '@/components/LevelPriceControl'
import RiskRewardControl from '@/components/RiskRewardControl'
import Tooltip from '@/components/Tooltip'
import TradeSizeControl from '@/components/TradeSizeControl'
import { canPlaceTicketSide, isPendingTicketType, type TicketOrderType } from '@/lib/paperTrade'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'

export type { TicketOrderType }

type OrderTicketFormProps = {
  compact?: boolean
}

export default function OrderTicketForm({ compact: _compact = false }: OrderTicketFormProps) {
  const limitInputRef = useRef<HTMLInputElement>(null)
  const tpInputRef = useRef<HTMLInputElement>(null)
  const slInputRef = useRef<HTMLInputElement>(null)

  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const placeLimit = useReplayStore((s) => s.placeLimit)
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
  const canSubmit = !busy
  const sizeValue = tradeSize
  const limitPrice = ticketLimitPrice
  const tpValue = ticketTakeProfit
  const slValue = ticketStopLoss
  const ticketLevels = {
    orderType,
    markPrice: mark,
    limitPrice,
    takeProfit: tpValue,
    stopLoss: slValue
  }
  const canBuy = canSubmit && canPlaceTicketSide('long', ticketLevels)
  const canSell = canSubmit && canPlaceTicketSide('short', ticketLevels)

  function readLevel(input: HTMLInputElement | null, fallback: number | null): number | null {
    const parsed = parseLevelPrice(input?.value ?? '')
    if (parsed === undefined) return fallback
    return parsed
  }

  function onTpChange(value: number | null): void {
    setTicketTakeProfit(value, { linkRr: true })
  }

  function onSlChange(value: number | null): void {
    setTicketStopLoss(value, { linkRr: true })
  }

  function submit(side: 'long' | 'short'): void {
    if (pricePick) setPricePick(null)
    const tp = readLevel(tpInputRef.current, tpValue)
    const sl = readLevel(slInputRef.current, slValue)
    setTicketTakeProfit(tp)
    setTicketStopLoss(sl)
    if (isPendingTicketType(orderType)) {
      const price = readLevel(limitInputRef.current, limitPrice)
      setTicketLimitPrice(price)
      placeLimit(side, price ?? Number.NaN, orderType)
    } else if (side === 'long') {
      paperBuy()
    } else {
      paperSell()
    }
  }

  function onLimitChange(value: number | null): void {
    setTicketLimitPrice(value)
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition-colors ${
      active
        ? 'bg-zinc-800 text-zinc-100'
        : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
    }`

  return (
    <div className="flex flex-col gap-2">
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
        <button
          type="button"
          aria-pressed={orderType === 'stopLimit'}
          className={tabClass(orderType === 'stopLimit')}
          onClick={() => setTicketOrderType('stopLimit')}
        >
          Stop Limit
        </button>
      </div>

      <TradeSizeControl
        value={sizeValue}
        symbol={symbol}
        disabled={busy}
        onChange={setTradeSize}
      />

      {isPendingTicketType(orderType) && (
        <LevelPriceControl
          label="Price"
          ariaLabel={orderType === 'stopLimit' ? 'Stop limit price' : 'Limit price'}
          title={
            orderType === 'stopLimit'
              ? 'Stop-limit price. Type or pick from the chart. Buy Stop Limit must be above market; Sell Stop Limit must be below market.'
              : 'Limit price. Type or pick from the chart. Buy Limit must be below market; Sell Limit must be above market.'
          }
          value={limitPrice}
          precision={pricePrecision}
          disabled={busy}
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

      <RiskRewardControl />

      <div className="grid w-full grid-cols-2 gap-1">
        <Tooltip
          className="min-w-0 w-full"
          text={
            !canBuy && isPendingTicketType(orderType) && limitPrice == null
              ? 'Pick or type a price'
              : !canBuy && orderType === 'stopLimit'
                ? 'Buy Stop Limit needs a price above market, with TP above and SL below entry'
                : !canBuy && orderType === 'limit'
                  ? 'Buy Limit needs a price below market, with TP above and SL below entry'
                  : !canBuy
                    ? 'TP/SL levels do not allow a long'
                    : orderType === 'stopLimit'
                      ? 'Buy Stop Limit — wait for price to trade up to the stop'
                      : orderType === 'limit'
                        ? 'Buy Limit — wait for price to trade down to the limit'
                        : 'Buy — open long at the current close'
          }
        >
          <button
            type="button"
            disabled={!canBuy}
            onClick={() => submit('long')}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded border border-emerald-500/70 bg-emerald-950/50 text-emerald-300 transition-colors enabled:hover:border-emerald-400 enabled:hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUpCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">Buy</span>
          </button>
        </Tooltip>
        <Tooltip
          className="min-w-0 w-full"
          text={
            !canSell && isPendingTicketType(orderType) && limitPrice == null
              ? 'Pick or type a price'
              : !canSell && orderType === 'stopLimit'
                ? 'Sell Stop Limit needs a price below market, with TP below and SL above entry'
                : !canSell && orderType === 'limit'
                  ? 'Sell Limit needs a price above market, with TP below and SL above entry'
                  : !canSell
                    ? 'TP/SL levels do not allow a short'
                    : orderType === 'stopLimit'
                      ? 'Sell Stop Limit — wait for price to trade down to the stop'
                      : orderType === 'limit'
                        ? 'Sell Limit — wait for price to trade up to the limit'
                        : 'Sell — open short at the current close'
          }
        >
          <button
            type="button"
            disabled={!canSell}
            onClick={() => submit('short')}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded border border-red-500/70 bg-red-950/50 text-red-300 transition-colors enabled:hover:border-red-400 enabled:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowDownCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">Sell</span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
