import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ProjectData } from '../analysis/project'
import { SCHEMA_VERSION, type ProjectExport, type ProjectSummary } from './schema'
import { projectFromPayload, toExport } from './serialize'
import { validateExport } from './validate'

interface StoredProject extends ProjectExport { id: string }
interface RepoGraphDB extends DBSchema {
  summaries: { key: string; value: ProjectSummary }
  projects: { key: string; value: StoredProject }
  sources: { key: string; value: { id: string; sources: Record<string, string> } }
}

export type LoadResult = { ok: true; project: ProjectData } | { ok: false; error: string }

export function describeStorageError(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  if (name === 'QuotaExceededError') return 'There is not enough browser storage left to save this project. Delete saved projects or save without source text.'
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'UnknownError') return 'Local storage is blocked in this browser or mode, for example in a private window.'
  return 'The project could not be saved to this browser.'
}

export const isStorageSupported = () => typeof indexedDB !== 'undefined'

/** randomUUID is only defined in secure contexts, so fall back to random bytes elsewhere. */
const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Local project storage in IndexedDB. Nothing is written unless saveProject is called.
 * Summaries, graphs, and source text live in separate stores so listing stays cheap
 * and source text can be deleted or omitted independently.
 */
export function createProjectStore(dbName = 'repograph') {
  let dbPromise: Promise<IDBPDatabase<RepoGraphDB>> | null = null
  const db = () =>
    (dbPromise ??= openDB<RepoGraphDB>(dbName, 1, {
      upgrade(d) {
        d.createObjectStore('summaries', { keyPath: 'id' })
        d.createObjectStore('projects', { keyPath: 'id' })
        d.createObjectStore('sources', { keyPath: 'id' })
      },
    }))

  return {
    /** Saves or overwrites a project. Source text is stored only when includeSource is true. */
    async save(project: ProjectData, { includeSource }: { includeSource: boolean }, now = new Date()): Promise<ProjectSummary> {
      const doc = toExport(project, now)
      const id = project.savedId ?? newId()
      const withSource = includeSource && project.sources !== null && project.sources.size > 0
      const summary: ProjectSummary = {
        id, name: project.name, savedAt: now.toISOString(), schemaVersion: SCHEMA_VERSION,
        fileCount: project.files.length, statementCount: project.relationships.length, hasSource: withSource,
      }
      const d = await db()
      const tx = d.transaction(['summaries', 'projects', 'sources'], 'readwrite')
      await Promise.all([
        tx.objectStore('summaries').put(summary),
        tx.objectStore('projects').put({ ...doc, id }),
        withSource
          ? tx.objectStore('sources').put({ id, sources: Object.fromEntries(project.sources!) })
          : tx.objectStore('sources').delete(id),
        tx.done,
      ])
      return summary
    },

    async list(): Promise<ProjectSummary[]> {
      const all = await (await db()).getAll('summaries')
      return all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    },

    /** Stored data is validated like an imported file, so corrupt or outdated records fail safely. */
    async load(id: string): Promise<LoadResult> {
      const d = await db()
      const stored = await d.get('projects', id)
      if (!stored) return { ok: false, error: 'This project is no longer in local storage.' }
      const checked = validateExport(stored)
      if (!checked.ok) return { ok: false, error: `The saved data could not be read: ${checked.errors[0]}` }
      const src = await d.get('sources', id)
      const sources = src && typeof src.sources === 'object' && src.sources !== null
        ? new Map(Object.entries(src.sources).filter((e): e is [string, string] => typeof e[1] === 'string'))
        : null
      return { ok: true, project: { ...projectFromPayload(checked.export.project, sources), savedId: id } }
    },

    async remove(id: string): Promise<void> {
      const d = await db()
      const tx = d.transaction(['summaries', 'projects', 'sources'], 'readwrite')
      await Promise.all([tx.objectStore('summaries').delete(id), tx.objectStore('projects').delete(id), tx.objectStore('sources').delete(id), tx.done])
    },

    async removeAll(): Promise<void> {
      const d = await db()
      const tx = d.transaction(['summaries', 'projects', 'sources'], 'readwrite')
      await Promise.all([tx.objectStore('summaries').clear(), tx.objectStore('projects').clear(), tx.objectStore('sources').clear(), tx.done])
    },

    async close(): Promise<void> {
      if (dbPromise) (await dbPromise).close()
      dbPromise = null
    },
  }
}

export type ProjectStore = ReturnType<typeof createProjectStore>
