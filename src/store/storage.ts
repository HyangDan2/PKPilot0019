/**
 * Session autosave.
 *
 * The live path writes a binary snapshot (`projectToStored`): typed arrays go
 * into IndexedDB through structured clone, so no sample is ever turned into a
 * base64 string on the main thread. Old sessions (a base64 JSON string under
 * the same key) are still read and rewritten in the new shape on the next save.
 *
 * Browsers without IndexedDB fall back to a localStorage string that a worker
 * serialises, and only an environment with neither takes the synchronous JSON
 * path — the fallback exists so autosave never silently disappears, not as the
 * normal route.
 */

import { parseProjectJson, projectToJson } from '../audio/project';
import type { ProjectState } from '../audio/types';
import { projectToStored, storedToProject, type StoredSession } from './session';

const DB_NAME = 'lyra-studio';
const STORE = 'session';
const KEY = 'current';
const LS_KEY = 'lyra.session.v1';

export interface SessionBackend {
  read(): Promise<unknown>;
  write(value: unknown): Promise<boolean>;
  remove(): Promise<void>;
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const indexedDbBackend: SessionBackend = {
  async read() {
    const db = await openDatabase();
    if (!db) return null;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  },
  async write(value) {
    const db = await openDatabase();
    if (!db) return false;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return true;
    } catch {
      return false;
    }
  },
  async remove() {
    const db = await openDatabase();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore
    }
  },
};

let backend: SessionBackend = indexedDbBackend;

/** Swap the session store (tests use an in-memory backend). */
export function setSessionBackend(next: SessionBackend | null): void {
  backend = next ?? indexedDbBackend;
}

/** Serialise the session to base64 JSON in a worker (localStorage fallback). */
async function serializeOffThread(project: ProjectState): Promise<string | null> {
  if (typeof Worker === 'undefined') return null;
  try {
    const worker = new Worker(new URL('./session-worker.ts', import.meta.url), { type: 'module' });
    const json = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 8000);
      worker.onmessage = (event: MessageEvent<{ ok: boolean; json: string | null }>) => {
        clearTimeout(timer);
        resolve(event.data?.ok ? event.data.json : null);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      worker.postMessage({ project });
    });
    worker.terminate();
    return json;
  } catch {
    return null;
  }
}

export async function saveSession(project: ProjectState): Promise<boolean> {
  if (await backend.write(projectToStored(project))) return true;
  // Last resort: an environment with neither IndexedDB nor workers still gets
  // autosave, on the main thread, rather than none at all.
  const json = (await serializeOffThread(project)) ?? (typeof Worker === 'undefined' ? projectToJson(project) : null);
  if (!json) return false;
  try {
    localStorage.setItem(LS_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export async function loadSession(): Promise<ProjectState | null> {
  const stored: unknown = await backend.read();
  if (stored && typeof stored === 'object' && (stored as StoredSession).version === 2) {
    return storedToProject(stored as StoredSession);
  }
  // Sessions saved before the binary format are base64 JSON under the same key.
  if (typeof stored === 'string' && stored) {
    try {
      return parseProjectJson(stored);
    } catch {
      // fall through to the legacy localStorage copy
    }
  }
  try {
    const legacy = localStorage.getItem(LS_KEY);
    return legacy ? parseProjectJson(legacy) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await backend.remove();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}
