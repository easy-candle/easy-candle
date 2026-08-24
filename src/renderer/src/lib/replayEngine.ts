import { dedupeCandlesByTime, findIndexAtOrBefore, type Candle } from '@shared/candleUtils'

export type ReplayStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'ended'

export type ReplayState = {
  candles: Candle[]
  index: number
  isPlaying: boolean
  speed: number
  status: ReplayStatus
}

export const REPLAY_SPEEDS = Object.freeze([0.5, 1, 2, 4] as const)

export type ReplaySeekOptions = {
  /** When false, move the playhead without stopping playback. Default true. */
  pause?: boolean
}

const DEFAULT_SPEED = 1
const DEFAULT_PREFETCH_THRESHOLD = 50

function normalizeSpeed(value: number): number {
  const n = Number(value)
  if ((REPLAY_SPEEDS as readonly number[]).includes(n)) return n
  return DEFAULT_SPEED
}

function normalizeCandles(candles: unknown): Candle[] {
  if (!Array.isArray(candles)) return []
  return dedupeCandlesByTime(
    candles.filter(
      (c): c is Candle =>
        Boolean(c) &&
        typeof c === 'object' &&
        Number.isFinite((c as Candle).time) &&
        Number.isFinite((c as Candle).open) &&
        Number.isFinite((c as Candle).high) &&
        Number.isFinite((c as Candle).low) &&
        Number.isFinite((c as Candle).close)
    )
  )
}

export function createReplayEngine(options: { prefetchThreshold?: number; speed?: number } = {}) {
  const prefetchThreshold =
    Number.isFinite(options.prefetchThreshold) && (options.prefetchThreshold as number) >= 0
      ? Math.floor(options.prefetchThreshold as number)
      : DEFAULT_PREFETCH_THRESHOLD

  let candles: Candle[] = []
  let index = 0
  let isPlaying = false
  let speed = normalizeSpeed(options.speed ?? DEFAULT_SPEED)
  let status: ReplayStatus = 'idle'

  function lastIndex(): number {
    return candles.length - 1
  }

  function hasCandles(): boolean {
    return candles.length > 0
  }

  function getState(): ReplayState {
    return {
      candles: candles.slice(),
      index,
      isPlaying,
      speed,
      status
    }
  }

  function load(nextCandles: Candle[]): ReplayState {
    candles = normalizeCandles(nextCandles)
    index = 0
    isPlaying = false
    status = hasCandles() ? 'ready' : 'idle'
    return getState()
  }

  function play(): ReplayState {
    if (!hasCandles() || status === 'ended') return getState()
    isPlaying = true
    status = 'playing'
    return getState()
  }

  function pause(): ReplayState {
    if (!hasCandles()) return getState()
    if (status === 'ended') {
      isPlaying = false
      return getState()
    }
    isPlaying = false
    status = 'paused'
    return getState()
  }

  function stepForward(): ReplayState {
    if (!hasCandles()) return getState()

    if (index >= lastIndex()) {
      isPlaying = false
      status = 'ended'
      return getState()
    }

    index += 1
    status = isPlaying ? 'playing' : 'paused'
    return getState()
  }

  function stepBackward(): ReplayState {
    if (!hasCandles()) return getState()

    if (index > 0) {
      index -= 1
    }

    isPlaying = false
    status = 'paused'
    return getState()
  }

  function setSpeed(nextSpeed: number): ReplayState {
    speed = normalizeSpeed(nextSpeed)
    return getState()
  }

  function seekToIndex(nextIndex: number, opts?: ReplaySeekOptions): ReplayState {
    if (!hasCandles()) return getState()

    const n = Number(nextIndex)
    if (!Number.isFinite(n)) return getState()

    index = Math.min(lastIndex(), Math.max(0, Math.floor(n)))
    if (opts?.pause === false) {
      if (isPlaying) status = 'playing'
      return getState()
    }

    isPlaying = false
    status = 'paused'
    return getState()
  }

  function seekToTime(timeSeconds: number, opts?: ReplaySeekOptions): ReplayState {
    if (!hasCandles()) return getState()

    const found = findIndexAtOrBefore(candles, timeSeconds)
    return seekToIndex(found < 0 ? 0 : found, opts)
  }

  function getVisibleCandles(): Candle[] {
    if (!hasCandles()) return []
    return candles.slice(0, index + 1)
  }

  function getCurrentCandle(): Candle | null {
    if (!hasCandles()) return null
    return candles[index] ?? null
  }

  function needsPrefetch(): boolean {
    if (!hasCandles() || status === 'idle') return false
    const remaining = lastIndex() - index
    return remaining <= prefetchThreshold
  }

  function appendCandles(more: Candle[]): ReplayState {
    if (!Array.isArray(more) || more.length === 0) return getState()

    const incoming = normalizeCandles(more)
    if (incoming.length === 0) return getState()

    const previousLast = hasCandles() ? candles[lastIndex()].time : null
    const extensions =
      previousLast == null ? incoming : incoming.filter((c) => c.time > previousLast)

    if (extensions.length === 0) return getState()

    const wasEnded = status === 'ended'
    candles = dedupeCandlesByTime(candles.concat(extensions))

    if (!hasCandles()) {
      index = 0
      isPlaying = false
      status = 'idle'
      return getState()
    }

    if (index > lastIndex()) {
      index = lastIndex()
    }

    if (wasEnded && index < lastIndex()) {
      isPlaying = false
      status = 'paused'
    }

    return getState()
  }

  return {
    getState,
    load,
    play,
    pause,
    stepForward,
    stepBackward,
    setSpeed,
    seekToIndex,
    seekToTime,
    getVisibleCandles,
    getCurrentCandle,
    needsPrefetch,
    appendCandles
  }
}

export type ReplayEngine = ReturnType<typeof createReplayEngine>
