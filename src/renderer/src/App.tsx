import { useMemo, useState } from 'react'
import type { CredentialEntry } from '@shared/types'
import { UnlockScreen } from './components/UnlockScreen'
import { Sidebar } from './components/Sidebar'
import { EntryDetail } from './components/EntryDetail'
import { EntryModal } from './components/EntryModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { EmptyState } from './components/EmptyState'
import { SettingsModal } from './components/SettingsModal'
import { useTheme } from './hooks/useTheme'

type FormValues = Omit<CredentialEntry, 'id' | 'createdAt' | 'updatedAt'>

function App(): JSX.Element {
  useTheme() // initializes the theme class on <html> as early as possible

  const [unlocked, setUnlocked] = useState(false)
  const [entries, setEntries] = useState<CredentialEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [modalEntry, setModalEntry] = useState<CredentialEntry | null | 'new'>(null)
  const [pendingDelete, setPendingDelete] = useState<CredentialEntry | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.appName.toLowerCase().includes(q))
  }, [entries, query])

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null

  async function persist(next: CredentialEntry[]): Promise<void> {
    setEntries(next)
    await window.api.saveEntries(next)
  }

  function handleUnlocked(loaded: CredentialEntry[]): void {
    setEntries(loaded)
    setUnlocked(true)
    setSelectedId(loaded[0]?.id ?? null)
  }

  async function handleLock(): Promise<void> {
    await window.api.lockVault()
    setUnlocked(false)
    setEntries([])
    setSelectedId(null)
    setQuery('')
  }

  function handleSave(values: FormValues): void {
    if (modalEntry && modalEntry !== 'new') {
      const updated: CredentialEntry = { ...modalEntry, ...values, updatedAt: Date.now() }
      void persist(entries.map((e) => (e.id === updated.id ? updated : e)))
      setSelectedId(updated.id)
    } else {
      const now = Date.now()
      const created: CredentialEntry = {
        ...values,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now
      }
      void persist([...entries, created])
      setSelectedId(created.id)
    }
    setModalEntry(null)
  }

  function handleDeleteConfirmed(): void {
    if (!pendingDelete) return
    const next = entries.filter((e) => e.id !== pendingDelete.id)
    void persist(next)
    if (selectedId === pendingDelete.id) {
      setSelectedId(next[0]?.id ?? null)
    }
    setPendingDelete(null)
  }

  if (!unlocked) {
    return <UnlockScreen onUnlocked={handleUnlocked} />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface dark:bg-surface-dark">
      <Sidebar
        entries={entries}
        filteredEntries={filteredEntries}
        selectedId={selectedId}
        query={query}
        onQueryChange={setQuery}
        onSelect={setSelectedId}
        onAdd={() => setModalEntry('new')}
        onLock={handleLock}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {selectedEntry ? (
          <EntryDetail
            entry={selectedEntry}
            onEdit={() => setModalEntry(selectedEntry)}
            onDelete={() => setPendingDelete(selectedEntry)}
          />
        ) : (
          <EmptyState hasEntries={entries.length > 0} onAdd={() => setModalEntry('new')} />
        )}
      </main>

      {modalEntry !== null && (
        <EntryModal
          initial={modalEntry === 'new' ? null : modalEntry}
          onCancel={() => setModalEntry(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.appName || 'Untitled'}"?`}
          description="This will permanently remove this entry from your vault. This cannot be undone."
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

export default App
