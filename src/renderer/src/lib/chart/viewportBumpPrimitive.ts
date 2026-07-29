import type { ISeriesPrimitive, Time } from 'lightweight-charts'

/**
 * No-op series primitive that notifies when lightweight-charts updates the
 * viewport. LWC calls `updateAllViews` on every visual update, including
 * price-scale drag (which has no dedicated subscription API).
 */
export class ViewportBumpPrimitive implements ISeriesPrimitive<Time> {
  private readonly onUpdate: () => void

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate
  }

  updateAllViews(): void {
    this.onUpdate()
  }
}
