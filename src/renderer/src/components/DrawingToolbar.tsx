import { MousePointer2, Trash2 } from 'lucide-react'
import DrawingToolIcon from '@/components/DrawingToolIcon'
import IconButton from '@/components/IconButton'
import { useReplayStore } from '@/store/replayStore'
import fibonacciIcon from '@/assets/drawings/fibonacci.svg?raw'
import hlineIcon from '@/assets/drawings/hline.svg?raw'
import rectangleIcon from '@/assets/drawings/rectangle.svg?raw'
import trendlineIcon from '@/assets/drawings/trendline.svg?raw'

type DrawingToolbarProps = {
  /** inline = top toolbar chrome; floating = no left border (inside FloatingPanel) */
  variant?: 'inline' | 'floating'
}

export default function DrawingToolbar({ variant = 'inline' }: DrawingToolbarProps) {
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const drawTool = useReplayStore((s) => s.drawTool)
  const drawings = useReplayStore((s) => s.drawings)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const clearDrawings = useReplayStore((s) => s.clearDrawings)

  const disabled = mode === 'replay' && replayStatus === 'ended'
  const shellClass =
    variant === 'floating'
      ? 'flex items-center gap-1'
      : 'flex items-center gap-1 border-l border-zinc-800 pl-2'

  return (
    <div className={shellClass}>
      <IconButton
        tooltip="Select / pan"
        active={drawTool === 'select'}
        disabled={disabled}
        onClick={() => setDrawTool('select')}
      >
        <MousePointer2 className="h-4 w-4" />
      </IconButton>
      <IconButton
        tooltip="Horizontal line"
        active={drawTool === 'hline'}
        disabled={disabled}
        onClick={() => setDrawTool('hline')}
      >
        <DrawingToolIcon svg={hlineIcon} />
      </IconButton>
      <IconButton
        tooltip="Trend line"
        active={drawTool === 'trendline'}
        disabled={disabled}
        onClick={() => setDrawTool('trendline')}
      >
        <DrawingToolIcon svg={trendlineIcon} />
      </IconButton>
      <IconButton
        tooltip="Fibonacci retracement"
        active={drawTool === 'fib'}
        disabled={disabled}
        onClick={() => setDrawTool('fib')}
      >
        <DrawingToolIcon svg={fibonacciIcon} />
      </IconButton>
      <IconButton
        tooltip="Rectangle"
        active={drawTool === 'rect'}
        disabled={disabled}
        onClick={() => setDrawTool('rect')}
      >
        <DrawingToolIcon svg={rectangleIcon} />
      </IconButton>
      <IconButton
        tooltip="Clear drawings"
        disabled={disabled || drawings.length === 0}
        onClick={clearDrawings}
        tone="danger"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
