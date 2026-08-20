import { useEffect } from 'react'
import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import '@/assets/app-tour.css'
import {
  APP_TOUR_STEPS,
  isDeferredTourStep,
  tourElementSelector
} from '@/lib/appTourSteps'
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

let didRequestFirstRunTour = false

function restylePopover(popover: PopoverDOM): void {
  popover.closeButton.textContent = 'Skip'
  popover.closeButton.setAttribute('aria-label', 'Skip tour')
  if (popover.closeButton.parentElement !== popover.footerButtons) {
    popover.footerButtons.insertBefore(popover.closeButton, popover.nextButton)
  }
}

function driveStepId(step: DriveStep | undefined): string | undefined {
  const id = step?.data?.id
  return typeof id === 'string' ? id : undefined
}

function prepareTourStep(id: string | undefined): void {
  if (id === 'paper-trade') {
    useUiLayoutStore.getState().beginPaperTradePreview()
  }
}

function teardownTourStep(id: string | undefined): void {
  if (id === 'paper-trade') {
    useUiLayoutStore.getState().endPaperTradePreview()
  }
}

export default function AppTour(): null {
  const tourRequestId = useUiLayoutStore((s) => s.tourRequestId)

  useEffect(() => {
    if (didRequestFirstRunTour) return
    if (useUiLayoutStore.getState().hasCompletedTour) return
    didRequestFirstRunTour = true
    useUiLayoutStore.getState().startTour()
  }, [])

  useEffect(() => {
    if (tourRequestId === 0) return
    if (useReplayStore.getState().mode === 'replay') return

    let cancelled = false
    let instance: Driver | null = null

    useDrawingSettingsStore.getState().setDrawingDialogOpen(false)

    const timer = window.setTimeout(() => {
      if (cancelled) return

      const steps: DriveStep[] = APP_TOUR_STEPS.filter(
        (step) =>
          isDeferredTourStep(step.id) || document.querySelector(tourElementSelector(step.id))
      ).map((step) => ({
        element: tourElementSelector(step.id),
        waitForElement: isDeferredTourStep(step.id) ? 2000 : undefined,
        data: { id: step.id },
        popover: {
          title: step.title,
          description: step.description,
          side: step.side ?? 'bottom',
          align: step.align ?? 'start'
        }
      }))
      if (steps.length === 0) return

      prepareTourStep(driveStepId(steps[0]))

      instance = driver({
        steps,
        overlayColor: '#000',
        overlayOpacity: 0.7,
        stagePadding: 6,
        stageRadius: 4,
        popoverOffset: 10,
        popoverClass: 'easy-candle-tour',
        animate: true,
        allowClose: true,
        overlayClickBehavior: 'close',
        disableActiveInteraction: true,
        skipMissingElement: true,
        showButtons: ['next', 'close'],
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: 'Next',
        doneBtnText: 'Done',
        onPopoverRender: restylePopover,
        onNextClick: (_element, _step, { driver: active }) => {
          const all = active.getConfig().steps ?? []
          const index = active.getActiveIndex() ?? 0
          prepareTourStep(driveStepId(all[index + 1]))
          active.moveNext()
        },
        onPrevClick: (_element, _step, { driver: active }) => {
          const all = active.getConfig().steps ?? []
          const index = active.getActiveIndex() ?? 0
          prepareTourStep(driveStepId(all[index - 1]))
          active.movePrevious()
        },
        onDeselected: (_element, step) => {
          teardownTourStep(driveStepId(step))
        },
        onDestroyed: () => {
          useUiLayoutStore.getState().endPaperTradePreview()
          if (cancelled) return
          useUiLayoutStore.getState().completeTour()
        }
      })
      instance.drive()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      instance?.destroy()
      useUiLayoutStore.getState().endPaperTradePreview()
    }
  }, [tourRequestId])

  return null
}
