import { create } from 'zustand'
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  toggleTheme as cycleStoredTheme,
  type Theme
} from '@/lib/theme'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getStoredTheme(),

  setTheme: (theme) => {
    if (theme === get().theme) return
    persistTheme(theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    set({ theme: cycleStoredTheme() })
  }
}))
