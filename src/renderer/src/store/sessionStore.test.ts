import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeUnsavedWork, useSessionStore, type Session } from '@/store/sessionStore'
import { useReplayStore } from '@/store/replayStore'
import { summarizeSession } from '@/lib/paperTrade'

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
    pendingTrendEnd: null,
    selectedDrawingId: null,
    positions: [],
    pendingOrders: [],
    selectedWorkingId: null,
    closedTrades: closedTrades ?? [],
    orderHistory: [],
    tradeMarkers: []
  })
}

function seedReplay(drawings?: Session['drawings'], closedTrades?: Session['closedTrades']): void {
  seedReplayIn(useReplayStore, drawings, closedTrades)
}

function freshStore(): void {
  useSessionStore.setState({ sessions: [], activeSessionId: null, pendingLoadId: null })
  useReplayStore.setState({ mode: 'live', sessionReport: null })
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
    expect(session?.orderHistory).toEqual([])
    expect(session?.autoSave).toBe(true)
    expect(session?.positions).toEqual([])
    expect(session?.pendingOrders).toEqual([])
  })

  it('captures canceled orders in order history', () => {
    freshStore()
    seedReplay()
    useReplayStore.setState({
      orderHistory: [
        {
          id: 'o-1',
          side: 'long',
          type: 'limit',
          status: 'canceled',
          price: 95,
          lots: 1,
          placedTime: 10,
          updateTime: 20,
          takeProfit: 110,
          stopLoss: 90
        }
      ]
    })
    const id = useSessionStore.getState().createSession('Canceled Limit')
    const session = useSessionStore.getState().sessions.find((item) => item.id === id)
    expect(session?.orderHistory).toHaveLength(1)
    expect(session?.orderHistory[0]).toMatchObject({ status: 'canceled', type: 'limit', price: 95 })
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
  it('restores drawings and orders onto the chart and sets it active', async () => {
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
    useReplayStore.setState({
      orderHistory: [
        {
          id: 'o-9',
          side: 'short',
          type: 'limit',
          status: 'canceled',
          price: 52,
          lots: 2,
          placedTime: 3,
          updateTime: 4,
          takeProfit: 45,
          stopLoss: 55
        }
      ]
    })
    const id = useSessionStore.getState().createSession('Load Me')!
    // Wipe the chart, then restore from the session.
    seedReplay()
    expect(await useSessionStore.getState().loadSession(id)).toBe(true)
    const chart = useReplayStore.getState()
    expect(chart.drawings).toEqual([
      { id: 'd-1', type: 'long', t: 10, entry: 100, target: 110, stop: 95, span: 6 }
    ])
    expect(chart.drawTool).toBe('select')
    expect(chart.closedTrades).toHaveLength(1)
    expect(chart.orderHistory).toHaveLength(1)
    expect(chart.orderHistory[0].status).toBe('canceled')
    expect(useSessionStore.getState().activeSessionId).toBe(id)
  })

  it('returns false for an unknown session', async () => {
    freshStore()
    expect(await useSessionStore.getState().loadSession('missing')).toBe(false)
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

describe('exitActiveSession', () => {
  it('saves once more, detaches, and clears drawings and orders', () => {
    freshStore()
    seedReplay([{ id: 'd-1', type: 'hline', price: 100 }])
    const id = useSessionStore.getState().createSession('Exiting')!

    // Draw after creating, so the exit save is the only way this is captured.
    seedReplay([
      { id: 'd-1', type: 'hline', price: 100 },
      { id: 'd-2', type: 'hline', price: 200 }
    ])
    useSessionStore.getState().exitActiveSession()

    expect(useSessionStore.getState().activeSessionId).toBeNull()
    const saved = useSessionStore.getState().sessions.find((item) => item.id === id)
    expect(saved?.drawings).toHaveLength(2)

    const chart = useReplayStore.getState()
    expect(chart.drawings).toEqual([])
    expect(chart.selectedDrawingId).toBeNull()
    expect(chart.positions).toEqual([])
    expect(chart.pendingOrders).toEqual([])
    expect(chart.closedTrades).toEqual([])
    expect(chart.orderHistory).toEqual([])
    expect(chart.tradeMarkers).toEqual([])
  })

  it('never leaves a session report behind', () => {
    freshStore()
    useReplayStore.setState({
      sessionReport: {
        symbol: 'BTCUSDT',
        timeframe: '15m',
        trades: [],
        summary: summarizeSession([]),
        closedOpenOnExit: false
      }
    })
    useSessionStore.getState().createSession('No Report')
    useSessionStore.getState().exitActiveSession()
    expect(useReplayStore.getState().sessionReport).toBeNull()
  })

  it('does not write a final save when auto-save is off', () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Manual Exit')!
    useSessionStore.getState().setSessionAutoSave(id, false)
    seedReplay([{ id: 'd-5', type: 'hline', price: 5 }])

    useSessionStore.getState().exitActiveSession()

    expect(useSessionStore.getState().sessions[0].drawings).toHaveLength(0)
    expect(useSessionStore.getState().activeSessionId).toBeNull()
    expect(useReplayStore.getState().drawings).toEqual([])
  })

  it('ignores a pending auto-save queued before the exit', () => {
    vi.useFakeTimers()
    try {
      freshStore()
      const id = useSessionStore.getState().createSession('Debounced')!
      seedReplay([{ id: 'd-6', type: 'hline', price: 6 }])
      // Exit inside the debounce window; the queued write must not resurrect it.
      useSessionStore.getState().exitActiveSession()
      vi.advanceTimersByTime(900)

      const saved = useSessionStore.getState().sessions.find((item) => item.id === id)
      expect(saved?.drawings).toHaveLength(1)
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exits replay without producing a session report', () => {
    freshStore()
    useSessionStore.getState().createSession('In Replay')
    // A closed trade would normally make exitReplay raise the report dialog.
    useReplayStore.setState({
      mode: 'replay',
      dataSource: 'binance',
      closedTrades: [
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
      ],
      drawings: [{ id: 'd-8', type: 'hline', price: 8 }]
    })

    useSessionStore.getState().exitActiveSession()

    const chart = useReplayStore.getState()
    expect(chart.sessionReport).toBeNull()
    expect(chart.mode).toBe('live')
    expect(chart.drawings).toEqual([])
    expect(chart.closedTrades).toEqual([])
  })

  it('is a no-op without an active session', () => {
    freshStore()
    seedReplay([{ id: 'd-7', type: 'hline', price: 7 }])
    useSessionStore.getState().exitActiveSession()
    expect(useReplayStore.getState().drawings).toHaveLength(1)
  })
})

describe('requestLoadSession', () => {
  it('loads straight away on a clean chart', async () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Clean')!
    // Detach and wipe, so this exercises the clean-chart path rather than the
    // already-active short circuit.
    useSessionStore.setState({ activeSessionId: null })
    seedReplay()

    expect(await useSessionStore.getState().requestLoadSession(id)).toBe(true)
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
    expect(useSessionStore.getState().activeSessionId).toBe(id)
  })

  it('asks first when the unattached chart has drawings', async () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Target')!
    useSessionStore.setState({ activeSessionId: null })
    seedReplay([{ id: 'd-1', type: 'hline', price: 100 }])

    expect(await useSessionStore.getState().requestLoadSession(id)).toBe('confirm')
    expect(useSessionStore.getState().pendingLoadId).toBe(id)
    // Nothing loaded yet: the chart is untouched.
    expect(useSessionStore.getState().activeSessionId).toBeNull()
    expect(useReplayStore.getState().drawings).toHaveLength(1)
  })

  it('asks first when the unattached chart is in replay', async () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Target')!
    useSessionStore.setState({ activeSessionId: null })
    seedReplay()
    useReplayStore.setState({ mode: 'replay' })

    expect(await useSessionStore.getState().requestLoadSession(id)).toBe('confirm')
    expect(useSessionStore.getState().pendingLoadId).toBe(id)
  })

  it('asks first when the unattached chart has orders but no drawings', async () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Target')!
    useSessionStore.setState({ activeSessionId: null })
    seedReplay()
    useReplayStore.setState({
      pendingOrders: [
        {
          id: 'p-1',
          side: 'long',
          kind: 'limit',
          price: 95,
          placedTime: 10,
          lots: 1,
          takeProfit: null,
          stopLoss: null
        }
      ]
    })

    expect(await useSessionStore.getState().requestLoadSession(id)).toBe('confirm')
  })

  it('does not ask while a session is active — that work is already saved', async () => {
    freshStore()
    const first = useSessionStore.getState().createSession('First')!
    const second = useSessionStore.getState().createSession('Second')!
    // createSession leaves `second` active.
    expect(useSessionStore.getState().activeSessionId).toBe(second)
    seedReplay([{ id: 'd-2', type: 'hline', price: 5 }])

    expect(await useSessionStore.getState().requestLoadSession(first)).toBe(true)
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
    expect(useSessionStore.getState().activeSessionId).toBe(first)
  })

  it('is a no-op for the already active session', async () => {
    freshStore()
    const id = useSessionStore.getState().createSession('Active')!
    expect(await useSessionStore.getState().requestLoadSession(id)).toBe(true)
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
  })

  it('returns false for an unknown session', async () => {
    freshStore()
    expect(await useSessionStore.getState().requestLoadSession('missing')).toBe(false)
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
  })
})

describe('confirmPendingLoad / cancelPendingLoad', () => {
  async function pending(): Promise<string> {
    freshStore()
    const id = useSessionStore.getState().createSession('Pending')!
    useSessionStore.setState({ activeSessionId: null })
    seedReplay([{ id: 'd-9', type: 'hline', price: 9 }])
    await useSessionStore.getState().requestLoadSession(id)
    return id
  }

  it('loads the pending session and clears the prompt', async () => {
    const id = await pending()
    expect(await useSessionStore.getState().confirmPendingLoad()).toBe(true)
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
    expect(useSessionStore.getState().activeSessionId).toBe(id)
    // The session was created on a clean chart, so the drawing is gone.
    expect(useReplayStore.getState().drawings).toEqual([])
  })

  it('cancel keeps the chart untouched', async () => {
    await pending()
    useSessionStore.getState().cancelPendingLoad()
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
    expect(useSessionStore.getState().activeSessionId).toBeNull()
    expect(useReplayStore.getState().drawings).toHaveLength(1)
  })

  it('confirm without a pending id is false', async () => {
    freshStore()
    expect(await useSessionStore.getState().confirmPendingLoad()).toBe(false)
  })

  it('deleting the pending session clears the prompt', async () => {
    const id = await pending()
    useSessionStore.getState().deleteSession(id)
    expect(useSessionStore.getState().pendingLoadId).toBeNull()
  })
})

describe('describeUnsavedWork', () => {
  const clean = {
    drawings: [],
    positions: [],
    pendingOrders: [],
    closedTrades: [],
    orderHistory: [],
    mode: 'live' as const
  }

  it('is null for a clean live chart', () => {
    expect(describeUnsavedWork(clean)).toBeNull()
  })

  it('counts drawings and every order bucket as trades', () => {
    expect(
      describeUnsavedWork({
        ...clean,
        drawings: [{}, {}],
        positions: [{}],
        pendingOrders: [{}],
        closedTrades: [{}],
        orderHistory: [{}]
      })
    ).toEqual({ drawings: 2, trades: 4, inReplay: false })
  })

  it('flags replay even with an empty chart', () => {
    expect(describeUnsavedWork({ ...clean, mode: 'replay' })).toEqual({
      drawings: 0,
      trades: 0,
      inReplay: true
    })
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
            orderHistory: [],
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

  it('keeps a fib channel drawing and drops one missing the width point', async () => {
    const store = {
      [STORAGE_KEY]: JSON.stringify({
        sessions: [
          {
            id: 's-1',
            name: 'Channel',
            symbol: 'BTCUSDT',
            timeframe: '15m',
            createdAt: 1,
            updatedAt: 2,
            autoSave: false,
            drawings: [
              {
                id: 'd-ok',
                type: 'fibchannel',
                t1: 1,
                p1: 2,
                t2: 3,
                p2: 4,
                t3: 5,
                p3: 6,
                levels: [{ ratio: 0.5 }]
              },
              { id: 'd-bad', type: 'fibchannel', t1: 1, p1: 2, t2: 3, p2: 4 }
            ],
            closedTrades: [],
            orderHistory: [],
            tradeMarkers: []
          }
        ]
      })
    }
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/sessionStore')
    expect(mod.useSessionStore.getState().sessions[0].drawings).toEqual([
      {
        id: 'd-ok',
        type: 'fibchannel',
        t1: 1,
        p1: 2,
        t2: 3,
        p2: 4,
        t3: 5,
        p3: 6,
        levels: [{ ratio: 0.5 }]
      }
    ])
  })
})
