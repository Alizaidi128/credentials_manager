import { useEffect, useMemo, useRef, useState } from 'react'
import type { CredentialEntry } from '@shared/types'
import { UnlockScreen } from './components/UnlockScreen'
import { Sidebar } from './components/Sidebar'
import { EntryDetail } from './components/EntryDetail'
import { EntryModal } from './components/EntryModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { EmptyState } from './components/EmptyState'
import { SettingsModal } from './components/SettingsModal'
import { ExportModal } from './components/ExportModal'
import { ImportResultModal } from './components/ImportResultModal'
import { UpdateBanner } from './components/UpdateBanner'
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
  const [exportOpen, setExportOpen] = useState(false)
  const [importResult, setImportResult] = useState<{
    toImport: CredentialEntry[]
    toSkip: CredentialEntry[]
    exportedBy?: string
  } | null>(null)
  const [idleTimeoutMs, setIdleTimeoutMs] = useState(0)
  const [pendingUpdate, setPendingUpdate] = useState<{ version: string } | null>(null)
  const remindTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable ref so idle timer always calls the latest handleLock
  const handleLockRef = useRef<() => Promise<void>>()

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = q ? entries.filter((e) => e.appName.toLowerCase().includes(q)) : entries
    return [...source].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
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

  // Keep ref current so idle timer closure always calls the latest version
  handleLockRef.current = handleLock

  // Load idle timeout from settings when vault is unlocked
  useEffect(() => {
    if (!unlocked) return
    window.api.getSettings().then((s) => {
      const mins = s.idleTimeoutMinutes ?? 0
      setIdleTimeoutMs(mins > 0 ? mins * 60 * 1000 : 0)
    })
  }, [unlocked])

  // Idle auto-lock
  useEffect(() => {
    if (!unlocked || !idleTimeoutMs) return
    let timer = window.setTimeout(() => handleLockRef.current?.(), idleTimeoutMs)
    const reset = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => handleLockRef.current?.(), idleTimeoutMs)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, reset))
    }
  }, [unlocked, idleTimeoutMs])

  // Listen for tray "Lock" action from main process
  useEffect(() => {
    return window.api.onForceLock(() => {
      handleLockRef.current?.()
    })
  }, [])

  // Listen for auto-updater events
  useEffect(() => {
    const unsubDownloaded = window.api.onUpdateDownloaded((info) => {
      setPendingUpdate(info)
    })
    return unsubDownloaded
  }, [])

  function handleInstallNow(): void {
    void window.api.installUpdate()
  }

  function handleRemindIn(ms: number): void {
    setPendingUpdate(null)
    if (remindTimerRef.current) clearTimeout(remindTimerRef.current)
    remindTimerRef.current = setTimeout(() => {
      setPendingUpdate((prev) => prev ?? { version: '?' })
    }, ms)
  }

  async function handleImport(): Promise<void> {
    const result = await window.api.importOpen()
    if (!result.ok || !result.entries || result.entries.length === 0) return
    const toImport = result.entries.filter(
      (inc) => !entries.some((ex) => ex.appName.toLowerCase() === inc.appName.toLowerCase())
    )
    const toSkip = result.entries.filter((inc) =>
      entries.some((ex) => ex.appName.toLowerCase() === inc.appName.toLowerCase())
    )
    setImportResult({ toImport, toSkip, exportedBy: result.exportedBy })
  }

  function handleImportConfirm(): void {
    if (!importResult) return
    const now = Date.now()
    const newEntries: CredentialEntry[] = importResult.toImport.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    }))
    void persist([...entries, ...newEntries])
    if (newEntries.length > 0) setSelectedId(newEntries[0].id)
    setImportResult(null)
  }

  function handleTogglePin(id: string): void {
    const next = entries.map((e) =>
      e.id === id ? { ...e, pinned: !e.pinned, updatedAt: Date.now() } : e
    )
    void persist(next)
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
        onTogglePin={handleTogglePin}
        onExport={() => setExportOpen(true)}
        onImport={() => void handleImport()}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {pendingUpdate && (
          <UpdateBanner
            version={pendingUpdate.version}
            onInstallNow={handleInstallNow}
            onDismiss={() => setPendingUpdate(null)}
            onRemindIn={handleRemindIn}
          />
        )}
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

      {exportOpen && (
        <ExportModal
          entries={entries}
          exportedBy={undefined}
          onClose={() => setExportOpen(false)}
        />
      )}

      {importResult && (
        <ImportResultModal
          toImport={importResult.toImport}
          toSkip={importResult.toSkip}
          exportedBy={importResult.exportedBy}
          onCancel={() => setImportResult(null)}
          onConfirm={handleImportConfirm}
        />
      )}
    </div>
  )
}

export default App
