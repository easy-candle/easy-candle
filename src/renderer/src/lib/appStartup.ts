import { isDesktopRuntime } from '@/lib/runtime'
import { useAccountStore } from '@/store/accountStore'
import { useReplayStore } from '@/store/replayStore'

let didNotifyStartupReady = false

/**
 * First-paint work that should finish while the splash window is up:
 * live/imported candles plus the account session (Easy Candle API).
 */
export async function runAppStartup(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    useReplayStore.getState().loadCandles(),
    useAccountStore.getState().hydrate()
  ]

  if (isDesktopRuntime()) {
    tasks.push(
      window.api.mtBridgeStatus().then((status) => {
        useReplayStore.getState().syncMtBridgeStatus(status)
      })
    )
  }

  try {
    await Promise.all(tasks)
  } catch {
    // Still reveal — the stores already record load/auth errors.
  }
  notifyStartupReady()
}

function notifyStartupReady(): void {
  if (didNotifyStartupReady) return
  didNotifyStartupReady = true
  window.api.notifyStartupReady()
}
