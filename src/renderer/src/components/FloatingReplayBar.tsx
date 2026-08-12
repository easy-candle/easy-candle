import FloatingPanel from '@/components/FloatingPanel'
import ReplayControls from '@/components/ReplayControls'
import { TIMEFRAMES } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function FloatingReplayBar() {
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const driverPane = useReplayStore((s) => s.driverPane)
  const timeframe = useReplayStore((s) => s.timeframe)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)

  const minimized = useUiLayoutStore((s) => s.replayControlsMinimized)
  const pos = useUiLayoutStore((s) => s.replayControlsPos)
  const setReplayControlsMinimized = useUiLayoutStore((s) => s.setReplayControlsMinimized)
  const setReplayControlsPos = useUiLayoutStore((s) => s.setReplayControlsPos)

  const driverLabel =
    chartSplit && driverPane === 'secondary'
      ? `${TIMEFRAMES[secondaryTimeframe]?.label ?? secondaryTimeframe} · R`
      : chartSplit
        ? `${TIMEFRAMES[timeframe]?.label ?? timeframe} · L`
        : null

  const minimizedLabel = driverLabel ? `Replay · ${driverLabel}` : 'Replay'

  return (
    <FloatingPanel
      title="Replay"
      minimized={minimized}
      minimizedLabel={minimizedLabel}
      pos={pos}
      onPosChange={setReplayControlsPos}
      onMinimizedChange={setReplayControlsMinimized}
      defaultPlacement="bottom-center"
    >
      <ReplayControls />
    </FloatingPanel>
  )
}
