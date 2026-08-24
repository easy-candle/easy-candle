import { FeedbackButton } from 'feedbackland-react'

/** Feedbackland organization id from the Widget admin page. */
const PLATFORM_ID = 'c9d1669e-cd23-49ab-9730-73e8f412ecbf'

const TRIGGER_SELECTOR = '[data-feedback-trigger] button'

/** Opens the mounted Feedbackland trigger (Help menu → Send Feedback). */
export function openFeedbackWidget(): void {
  document.querySelector<HTMLButtonElement>(TRIGGER_SELECTOR)?.click()
}

export default function GiveFeedback() {
  return (
    <div className="flex h-full items-stretch" data-feedback-trigger="">
      <FeedbackButton
        platformId={PLATFORM_ID}
        widget="drawer"
        variant="unstyled"
        className="inline-flex h-full items-center px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
      />
    </div>
  )
}
