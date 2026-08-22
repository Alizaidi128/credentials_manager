import { useTheme } from '../hooks/useTheme'
import { MoonIcon, SunIcon } from './icons'

export function ThemeToggle(): JSX.Element {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-slate-500 shadow-sm transition-colors hover:text-brand-600 dark:border-border-dark dark:bg-surface-dark dark:text-slate-400 dark:hover:text-brand-400"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
    </button>
  )
}
