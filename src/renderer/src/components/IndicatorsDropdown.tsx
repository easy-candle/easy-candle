import { useCallback, useState } from 'react'
import { Check, ChevronDown, LineChart, Lock } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import SignInRequiredDialog from '@/components/SignInRequiredDialog'
import Tooltip from '@/components/Tooltip'
import { INDICATORS, indicatorRequiresAuth } from '@/lib/indicators'
import { useAccountStore } from '@/store/accountStore'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function IndicatorsDropdown() {
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const toggleIndicator = useReplayStore((s) => s.toggleIndicator)
  const signedIn = useAccountStore((s) => s.signedIn)
  const setAccountDialogOpen = useUiLayoutStore((s) => s.setAccountDialogOpen)
  const [authPrompt, setAuthPrompt] = useState<{ label: string } | null>(null)

  const dismissPrompt = useCallback(() => setAuthPrompt(null), [])

  function onOkSignIn(): void {
    setAuthPrompt(null)
    setAccountDialogOpen(true)
  }

  return (
    <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
      <Dropdown
        menuClassName="w-max"
        trigger={({ open, toggle }) => (
          <Tooltip text="Indicators" side="bottom">
            <button
              type="button"
              onClick={toggle}
              aria-label="Indicators"
              aria-expanded={open}
              className={`inline-flex h-8 items-center gap-0.5 rounded border px-1.5 transition-colors ${
                open
                  ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
                  : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
              }`}
            >
              <LineChart className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          </Tooltip>
        )}
      >
        {({ close }) =>
          INDICATORS.map((indicator) => {
            const active = activeIndicators.includes(indicator.id)
            const gated = indicatorRequiresAuth(indicator.id) && !signedIn
            return (
              <button
                key={indicator.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => {
                  if (gated) {
                    close()
                    setAuthPrompt({ label: indicator.label })
                    return
                  }
                  toggleIndicator(indicator.id)
                }}
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
              >
                <span className="flex-1 font-medium">{indicator.label}</span>
                {gated ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                ) : (
                  active && <Check className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                )}
              </button>
            )
          })
        }
      </Dropdown>
      <SignInRequiredDialog
        open={authPrompt != null}
        indicatorLabel={authPrompt?.label ?? 'Smart money concepts'}
        onOk={onOkSignIn}
        onDismiss={dismissPrompt}
      />
    </div>
  )
}
