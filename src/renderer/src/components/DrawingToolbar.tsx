import { MousePointer2, Settings2, Trash2 } from 'lucide-react'
import DrawingToolIcon from '@/components/DrawingToolIcon'
import IconButton from '@/components/IconButton'
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import fibonacciIcon from '@/assets/drawings/fibonacci.svg?raw'
import hlineIcon from '@/assets/drawings/hline.svg?raw'
import longIcon from '@/assets/drawings/long.svg?raw'
import rectangleIcon from '@/assets/drawings/rectangle.svg?raw'
import shortIcon from '@/assets/drawings/short.svg?raw'
import trendlineIcon from '@/assets/drawings/trendline.svg?raw'

export default function DrawingToolbar() {
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const drawTool = useReplayStore((s) => s.drawTool)
  const drawings = useReplayStore((s) => s.drawings)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const clearDrawings = useReplayStore((s) => s.clearDrawings)
  const setDrawingDialogOpen = useDrawingSettingsStore((s) => s.setDrawingDialogOpen)

  const disabled = mode === 'replay' && replayStatus === 'ended'

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="flex h-full w-[49px] rounded-sm shrink-0 flex-col items-center gap-0.5 border border-zinc-800 bg-zinc-900/60 px-1.5 py-2"
    >
      <IconButton
        variant="ghost"
        tooltip="Select / pan"
        tooltipSide="right"
        active={drawTool === 'select'}
        disabled={disabled}
        onClick={() => setDrawTool('select')}
      >
        <MousePointer2 className="w-6 h-6" strokeWidth={1.25} />
      </IconButton>
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />
      <IconButton
        variant="ghost"
        tooltip="Horizontal line"
        tooltipSide="right"
        active={drawTool === 'hline'}
        disabled={disabled}
        onClick={() => setDrawTool('hline')}
      >
        <DrawingToolIcon svg={hlineIcon} className="w-6 h-6" />
      </IconButton>
      <IconButton
        variant="ghost"
        tooltip="Trend line"
        tooltipSide="right"
        active={drawTool === 'trendline'}
        disabled={disabled}
        onClick={() => setDrawTool('trendline')}
      >
        <DrawingToolIcon svg={trendlineIcon} className="w-6 h-6" />
      </IconButton>
      <IconButton
        variant="ghost"
        tooltip="Fibonacci retracement"
        tooltipSide="right"
        active={drawTool === 'fib'}
        disabled={disabled}
        onClick={() => setDrawTool('fib')}
      >
        <DrawingToolIcon svg={fibonacciIcon} className="w-6 h-6" />
      </IconButton>
      <IconButton
        variant="ghost"
        tooltip="Rectangle"
        tooltipSide="right"
        active={drawTool === 'rect'}
        disabled={disabled}
        onClick={() => setDrawTool('rect')}
      >
        <DrawingToolIcon svg={rectangleIcon} className="w-6 h-6" />
      </IconButton>
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />
      <IconButton
        variant="ghost"
        tooltip="Long position"
        tooltipSide="right"
        active={drawTool === 'long'}
        disabled={disabled}
        onClick={() => setDrawTool('long')}
      >
        <DrawingToolIcon svg={longIcon} className="w-6 h-6" />
      </IconButton>
      <IconButton
        variant="ghost"
        tooltip="Short position"
        tooltipSide="right"
        active={drawTool === 'short'}
        disabled={disabled}
        onClick={() => setDrawTool('short')}
      >
        <DrawingToolIcon svg={shortIcon} className="w-6 h-6" />
      </IconButton>
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />
      <IconButton
        variant="ghost"
        tooltip="Clear drawings"
        tooltipSide="right"
        disabled={disabled || drawings.length === 0}
        onClick={clearDrawings}
        tone="danger"
      >
        <Trash2 className="w-6 h-6" strokeWidth={1.25} />
      </IconButton>
      <div className="my-1 h-px w-7 bg-zinc-800" aria-hidden />
      <IconButton
        variant="ghost"
        tooltip="Drawing settings"
        tooltipSide="right"
        disabled={disabled}
        onClick={() => setDrawingDialogOpen(true, 'toolbar')}
      >
        <Settings2 className="w-6 h-6" strokeWidth={1.25} />
      </IconButton>
    </div>
  )
}
