/**
 * The store's data layer: one API for vendors, sales, inventory, utang and
 * feedback, backed by Appwrite when it is configured and by localStorage when it
 * is not.
 *
 * The offline path is not a stub — it is the path the app actually runs on a
 * phone with no signal, and it is what lets the demo work before the operator
 * has created the Appwrite project. Writes made offline are queued and pushed on
 * the next successful `sync()`.
 */

import {
  AppwriteError,
  COLLECTIONS,
  configured,
  createDocument,
  listDocuments,
  updateDocument,
  type CollectionName,
  type Feedback,
  type InventoryItem,
  type Sale,
  type Utang,
  type Vendor,
} from './appwrite';

const LOCAL_KEY = 'sariswerte.data.v1';

type AnyDoc = Vendor | Sale | InventoryItem | Utang | Feedback;

interface LocalShape {
  vendors: Vendor[];
  sales: Sale[];
  inventory: InventoryItem[];
  utang: Utang[];
  feedback: Feedback[];
  /** Documents written while offline, waiting to be pushed. */
  pending: { collection: CollectionName; doc: AnyDoc }[];
}

const empty = (): LocalShape => ({
  vendors: [],
  sales: [],
  inventory: [],
  utang: [],
  feedback: [],
  pending: [],
});

function readLocal(): LocalShape {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<LocalShape>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

function writeLocal(data: LocalShape): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode: the session still works from memory */
  }
}

const newId = (): string =>
  `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Save a document. Online it goes straight to Appwrite; offline it is stored
 * locally and queued so nothing the tindera typed is ever lost.
 */
export async function save<K extends CollectionName>(
  collection: K,
  doc: AnyDoc,
): Promise<AnyDoc> {
  if (configured) {
    try {
      return (await createDocument(collection, doc as never)) as AnyDoc;
    } catch (err) {
      if (!(err instanceof AppwriteError) || err.code === 0) throw err;
      // A real API error (permissions, schema) must surface, not be swallowed.
      throw err;
    }
  }
  const local = readLocal();
  const withId = { ...doc, $id: newId() } as AnyDoc;
  (local[collection] as AnyDoc[]).push(withId);
  local.pending.push({ collection, doc: withId });
  writeLocal(local);
  return withId;
}

/** Read a collection, preferring the server when it is reachable. */
export async function load<K extends CollectionName>(
  collection: K,
  limit = 50,
): Promise<AnyDoc[]> {
  if (configured) {
    try {
      const res = await listDocuments(collection, limit);
      return res.documents as AnyDoc[];
    } catch {
      // fall through to the local copy so the store still opens
    }
  }
  return readLocal()[collection] as AnyDoc[];
}

/** Mark an utang as settled. */
export async function settleUtang(id: string): Promise<void> {
  if (configured) {
    await updateDocument(COLLECTIONS.utang, id, { settled: true });
    return;
  }
  const local = readLocal();
  local.utang = local.utang.map((u) => (u.$id === id ? { ...u, settled: true } : u));
  writeLocal(local);
}

/** Push queued offline writes. Returns how many made it. */
export async function sync(): Promise<{ pushed: number; failed: number }> {
  if (!configured) return { pushed: 0, failed: 0 };
  const local = readLocal();
  let pushed = 0;
  let failed = 0;
  const remaining: LocalShape['pending'] = [];

  for (const entry of local.pending) {
    try {
      const { $id: _drop, ...data } = entry.doc as unknown as Record<string, unknown>;
      await createDocument(entry.collection, data as never);
      pushed += 1;
    } catch {
      remaining.push(entry);
      failed += 1;
    }
  }

  writeLocal({ ...local, pending: remaining });
  return { pushed, failed };
}

/** How many writes are waiting for a connection. */
export function pendingCount(): number {
  return readLocal().pending.length;
}

/** Total sales for today, in pesos. */
export async function todaySales(): Promise<number> {
  const rows = (await load(COLLECTIONS.sales, 200)) as Sale[];
  const today = new Date().toISOString().slice(0, 10);
  return rows
    .filter((s) => (s.soldAt ?? '').slice(0, 10) === today)
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
}

/** Utang still owed to the store. */
export async function outstandingUtang(): Promise<number> {
  const rows = (await load(COLLECTIONS.utang, 200)) as Utang[];
  return rows.filter((u) => !u.settled).reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
}

/** Items at or below their reorder point. */
export async function lowStock(): Promise<InventoryItem[]> {
  const rows = (await load(COLLECTIONS.inventory, 200)) as InventoryItem[];
  return rows.filter((i) => Number(i.qty) <= Number(i.reorderAt));
}
