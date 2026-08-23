import { isDesktopRuntime } from '@/lib/runtime'
import { ipcTransports } from './ipcTransport'
import { webTransports } from './webTransport'
import type { FeedTransports } from './types'

export type { FeedTransports }

/** Pick the transport bundle for the current runtime at feed-creation time. */
export function getFeedTransports(): FeedTransports {
  return isDesktopRuntime() ? ipcTransports : webTransports
}
