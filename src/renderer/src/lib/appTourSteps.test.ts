import { describe, expect, it } from 'vitest'
import { APP_TOUR_STEPS, tourElementSelector } from '@/lib/appTourSteps'

describe('app tour steps', () => {
  it('walks the toolbar in the planned order', () => {
    expect(APP_TOUR_STEPS.map((step) => step.id)).toEqual([
      'import-data',
      'symbol',
      'timeframe',
      'replay',
      'drawing-toolbar',
      'split',
      'chart-settings',
      'snapshot',
      'fullscreen',
      'theme',
      'paper-trade'
    ])
  })

  it('anchors each step with a data-tour selector', () => {
    for (const step of APP_TOUR_STEPS) {
      expect(tourElementSelector(step.id)).toBe(`[data-tour="${step.id}"]`)
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.description.length).toBeGreaterThan(0)
    }
  })
})
