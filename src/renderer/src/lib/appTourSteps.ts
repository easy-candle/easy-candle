export type AppTourStep = {
  id: string
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

export const APP_TOUR_STEPS: AppTourStep[] = [
  {
    id: 'import-data',
    title: 'Import data',
    description: 'Open a CSV file and show it on the chart.'
  },
  {
    id: 'symbol',
    title: 'Select a symbol',
    description: 'Pick which market to show. Your imported files are in this list too.'
  },
  {
    id: 'timeframe',
    title: 'Select a timeframe',
    description: 'Pick how long each candle is. For example 1 minute or 1 hour.'
  },
  {
    id: 'replay',
    title: 'Replay',
    description: 'Play old candles one by one so you can practice trading.'
  },
  {
    id: 'drawing-toolbar',
    title: 'Drawing tools',
    description: 'Use this bar to draw on the chart. You can add lines, boxes, and more.',
    side: 'right',
    align: 'start'
  },
  {
    id: 'split',
    title: 'Split chart',
    description: 'Show two charts next to each other.'
  },
  {
    id: 'chart-settings',
    title: 'Chart settings',
    description: 'Change chart colors and other options.'
  },
  {
    id: 'snapshot',
    title: 'Screenshot',
    description: 'Save or copy a picture of the chart.'
  },
  {
    id: 'sessions',
    title: 'Sessions',
    description: 'Save your drawings and trading setup. You can come back to them later.',
    side: 'bottom'
  },
  {
    id: 'fullscreen',
    title: 'Full screen',
    description: 'Make the chart fill the window. Press F to turn this on or off.'
  },
  {
    id: 'theme',
    title: 'Light / dark',
    description: 'Switch between light mode and dark mode.'
  },
  {
    id: 'paper-trade',
    title: 'Paper trade',
    description:
      'In replay, use this panel to practice Buy and Sell. You can set size, take profit, and stop loss. Your results show in the bar under the chart. You cannot click here now. This is only to look.',
    side: 'left',
    align: 'start'
  }
]

export function tourElementSelector(id: string): string {
  return `[data-tour="${id}"]`
}

/** Steps whose target is mounted only for the duration of that tour stop. */
export function isDeferredTourStep(id: string): boolean {
  return id === 'paper-trade'
}
