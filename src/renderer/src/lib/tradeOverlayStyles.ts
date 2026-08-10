/** Chart overlay tokens for open-position / TP / SL chrome. */
export const TRADE_OVERLAY = {
  longLine: '#2962FF',
  shortLine: '#F23645',
  handleFill: '#0B0E11',
  handleTextMuted: '#9CA3AF',
  pnlProfit: '#26A69A',
  pnlLoss: '#EF5350',
  tpLine: '#26A69A',
  slLine: '#FF9800',
  qtyFill: '#2962FF',
  qtyText: '#FFFFFF',
  closeIcon: '#9EC1FF',
  connector: '#2962FF',
  zoneTp: 'rgba(38, 166, 154, 0.08)',
  zoneSl: 'rgba(255, 152, 0, 0.10)',
  /** Active entry uses a solid stroke; pending TP/SL stay dotted. */
  entryDash: undefined as string | undefined,
  levelDash: '3 3',
  entryWidth: 1.5,
  levelWidth: 1.25,
  connectorDash: '4 4',
  /** Closed trade history entry→exit arrow (MT-style dashed). */
  historyDash: '5 3',
  historyWidth: 1.75,
  font: 'system-ui, Segoe UI, Tahoma, sans-serif'
} as const

export const OVERLAY_LAYOUT = {
  pillH: 22,
  placeW: 30,
  placeH: 18,
  qtyW: 22,
  closeW: 22,
  gap: 5,
  radius: 3,
  /** Approx width of the PNL text section before measuring. */
  pnlMinW: 88,
  rightPad: 10,
  connectorR: 3.5
} as const
