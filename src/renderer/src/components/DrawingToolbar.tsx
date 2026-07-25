import { Minus, MousePointer2, Trash2, TrendingUp } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { useReplayStore } from '@/store/replayStore'

export default function DrawingToolbar() {
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const drawTool = useReplayStore((s) => s.drawTool)
  const drawings = useReplayStore((s) => s.drawings)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const clearDrawings = useReplayStore((s) => s.clearDrawings)

  if (mode !== 'replay') return null

  const disabled = replayStatus === 'ended'

  return (
    <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
      <IconButton
        label="Select / pan"
        active={drawTool === 'select'}
        disabled={disabled}
        onClick={() => setDrawTool('select')}
      >
        <MousePointer2 className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Horizontal line"
        active={drawTool === 'hline'}
        disabled={disabled}
        onClick={() => setDrawTool('hline')}
      >
        <Minus className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Trend line"
        active={drawTool === 'trendline'}
        disabled={disabled}
        onClick={() => setDrawTool('trendline')}
      >
        <TrendingUp className="h-4 w-4" />
      </IconButton>
      <IconButton
        label="Clear drawings"
        disabled={disabled || drawings.length === 0}
        onClick={clearDrawings}
        tone="danger"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
