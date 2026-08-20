import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore, type Session } from '@/store/sessionStore'
import { useReplayStore } from '@/store/replayStore'

const STORAGE_KEY = 'easy-candle:sessions'

function stubLocalStorage(store: Record<string, string>): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    }
  })
}

function seedReplayIn(
  replayStore: typeof useReplayStore,
  drawings?: Session['drawings'],
  closedTrades?: Session['closedTrades']
): void {
  replayStore.setState({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    drawings: drawings ?? [],
    drawTool: 'select',
    pendingTrend: null,
    selectedDrawingId: null,
    position: null,
    pendingOrder: null,
    closedTrades: closedTrades ?? [],
    tradeMarkers: []
  })
}

function seedReplay(drawings?: Session['drawings'], closedTrades?: Session['closedTrades']): void {
  seedReplayIn(useReplayStore, drawings, closedTrades)
}

function freshStore(): void {
  useSessionStore.setState({ sessions: [], activeSessionId: null })
  seedReplay()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSession', () => {
  it('captures the current chart drawings and orders', () => {
    freshStore()
    seedReplay(
      [{ id: 'd-1', type: 'hline', price: 100 }],
      [
        {
          id: 't-1',
          side: 'long',
          entryPrice: 99,
          entryTime: 100,
          exitPrice: 102,
          exitTime: 200,
          lots: 1,
          pnl: 3,
          exitReason: 'tp',
          takeProfit: 102,
          stopLoss: 98
        }
      ]
    )
    const id = useSessionStore.getState().createSession('  Morning Replay  ')
    const state = useSessionStore.getState()
    expect(id).not.toBeNull()
    expect(state.activeSessionId).toBe(id)
    const session = state.sessions.find((item) => item.id === id)
    expect(session?.name).toBe('Morning Replay')
    expect(session?.symbol).toBe('BTCUSDT')
    expect(session?.timeframe).toBe('15m')
    expect(session?.drawings).toEqual([{ id: 'd-1', type: 'hline', price: 100 }])
    expect(session?.closedTrades).toHaveLength(1)
    expect(session?.autoSave).toBe(true)
    expect(session?.position).toBeNull()
  })

  it('rejects blank names', () => {
    freshStore()
    expect(useSessionStore.getState().createSession('   ')).toBeNull()
    expect(useSessionStore.getState().sessions).toHaveLength(0)
  })

  it('persists the new session to localStorage', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    const replayMod = await import('@/store/replayStore')
    seedReplayIn(replayMod.useReplayStore, [
      { id: 'd-9', type: 'trendline', t1: 1, p1: 2, t2: 3, p2: 4 }
    ])
    const id = mod.useSessionStore.getState().createSession('Saved')
    const parsed = JSON.parse(store[STORAGE_KEY] ?? '{}') as { sessions: Session[] }
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.sessions[0].id).toBe(id)
    expect(parsed.sessions[0].drawings[0]).toMatchObject({ type: 'trendline' })
  })
})

describe('renameSession', () => {
  it('renames a session with trimming', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Old Name')!
    useSessionStore.getState().renameSession(id, '  New Name  ')
    expect(useSessionStore.getState().sessions[0].name).toBe('New Name')
  })

  it('ignores blank renames', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Keep')!
    useSessionStore.getState().renameSession(id, '   ')
    expect(useSessionStore.getState().sessions[0].name).toBe('Keep')
  })
})

describe('deleteSession', () => {
  it('removes the session and clears the active id when it was active', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Gone')!
    useSessionStore.getState().deleteSession(id)
    expect(useSessionStore.getState().sessions).toHaveLength(0)
    expect(useSessionStore.getState().activeSessionId).toBeNull()
  })

  it('keeps the active session when deleting another one', () => {
    freshStore()
    const activeId = useSessionStore.getState().createSession('Active')!
    const otherId = useSessionStore.getState().createSession('Other')!
    useSessionStore.getState().setActiveSession(activeId)
    useSessionStore.getState().deleteSession(otherId)
    expect(useSessionStore.getState().activeSessionId).toBe(activeId)
  })
})

describe('setSessionAutoSave', () => {
  it('toggles auto-save and persists it', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    seedReplay()
    const id = mod.useSessionStore.getState().createSession('Toggle')!
    mod.useSessionStore.getState().setSessionAutoSave(id, false)
    expect(mod.useSessionStore.getState().sessions[0].autoSave).toBe(false)
    const parsed = JSON.parse(store[STORAGE_KEY] ?? '{}') as { sessions: Session[] }
    expect(parsed.sessions[0].autoSave).toBe(false)
  })
})

describe('saveActiveSession', () => {
  it('updates the active session with the latest chart state', () => {
    freshStore()
    useSessionStore.getState().createSession('Updating')
    seedReplay([{ id: 'd-2', type: 'rect', t1: 1, p1: 2, t2: 3, p2: 4 }])
    expect(useSessionStore.getState().saveActiveSession()).toBe(true)
    expect(useSessionStore.getState().sessions[0].drawings).toEqual([
      { id: 'd-2', type: 'rect', t1: 1, p1: 2, t2: 3, p2: 4 }
    ])
  })

  it('returns false without an active session', () => {
    freshStore()
    expect(useSessionStore.getState().saveActiveSession()).toBe(false)
  })
})

describe('loadSession', () => {
  it('restores drawings and orders onto the chart and sets it active', () => {
    freshStore()
    seedReplay(
      [{ id: 'd-1', type: 'long', t: 10, entry: 100, target: 110, stop: 95, span: 6 }],
      [
        {
          id: 't-9',
          side: 'short',
          entryPrice: 50,
          entryTime: 5,
          exitPrice: 48,
          exitTime: 8,
          lots: 2,
          pnl: 4,
          exitReason: 'sl',
          takeProfit: 45,
          stopLoss: 52
        }
      ]
    )
    const id = useSessionStore.getState().createSession('Load Me')!
    // Wipe the chart, then restore from the session.
    seedReplay()
    expect(useSessionStore.getState().loadSession(id)).toBe(true)
    const chart = useReplayStore.getState()
    expect(chart.drawings).toEqual([
      { id: 'd-1', type: 'long', t: 10, entry: 100, target: 110, stop: 95, span: 6 }
    ])
    expect(chart.drawTool).toBe('select')
    expect(chart.closedTrades).toHaveLength(1)
    expect(useSessionStore.getState().activeSessionId).toBe(id)
  })

  it('returns false for an unknown session', () => {
    freshStore()
    expect(useSessionStore.getState().loadSession('missing')).toBe(false)
  })
})

describe('auto-save', () => {
  it('writes chart edits into the active auto-saving session after debounce', async () => {
    vi.useFakeTimers()
    try {
      freshStore()
      const id = useSessionStore.getState().createSession('Auto')!
      seedReplay([{ id: 'd-3', type: 'hline', price: 1 }])
      expect(useSessionStore.getState().sessions[0].drawings).toHaveLength(0)
      vi.advanceTimersByTime(900)
      expect(useSessionStore.getState().sessions[0].drawings).toEqual([
        { id: 'd-3', type: 'hline', price: 1 }
      ])
      expect(useSessionStore.getState().activeSessionId).toBe(id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips auto-save when the active session has auto-save off', async () => {
    vi.useFakeTimers()
    try {
      freshStore()
      const id = useSessionStore.getState().createSession('Manual')!
      useSessionStore.getState().setSessionAutoSave(id, false)
      seedReplay([{ id: 'd-4', type: 'hline', price: 2 }])
      vi.advanceTimersByTime(900)
      expect(useSessionStore.getState().sessions[0].drawings).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('persisted load', () => {
  it('restores valid sessions and drops invalid entries', async () => {
    const store = {
      [STORAGE_KEY]: JSON.stringify({
        sessions: [
          {
            id: 's-1',
            name: 'Good',
            symbol: 'ETHUSDT',
            timeframe: '1h',
            createdAt: 1,
            updatedAt: 2,
            autoSave: false,
            drawings: [{ id: 'd-1', type: 'hline', price: 42 }],
            position: null,
            pendingOrder: null,
            closedTrades: [],
            tradeMarkers: []
          },
          { id: 's-2', name: '', drawings: [] },
          'garbage'
        ]
      })
    }
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    const state = mod.useSessionStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].name).toBe('Good')
    expect(state.sessions[0].symbol).toBe('ETHUSDT')
    expect(state.sessions[0].autoSave).toBe(false)
    expect(state.sessions[0].drawings[0]).toEqual({ id: 'd-1', type: 'hline', price: 42 })
    expect(state.activeSessionId).toBeNull()
  })
})
