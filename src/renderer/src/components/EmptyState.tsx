import { PlusIcon, ShieldIcon } from './icons'

interface EmptyStateProps {
  hasEntries: boolean
  onAdd: () => void
}

export function EmptyState({ hasEntries, onAdd }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-center animate-fade-in">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-panel text-slate-300 dark:bg-panel-dark dark:text-slate-700">
        <ShieldIcon className="h-8 w-8" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {hasEntries ? 'Select an entry to view its details' : 'Your vault is empty'}
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">
          {hasEntries ? 'Pick something from the sidebar' : 'Add your first credential to get started'}
        </p>
      </div>
      {!hasEntries && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-2 flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-600/25 transition hover:from-brand-600 hover:to-brand-700"
        >
          <PlusIcon className="h-4 w-4" />
          Add Entry
        </button>
      )}
    </div>
  )
}
