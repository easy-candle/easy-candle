export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && window.api.runtime === 'desktop'
}
