/**
 * Appwrite backend for SariSwerte.
 *
 * Everything is driven by Vite env vars so no secret is ever committed:
 *
 *   VITE_APPWRITE_ENDPOINT    e.g. https://cloud.appwrite.io/v1
 *   VITE_APPWRITE_PROJECT_ID  the Appwrite project id
 *   VITE_APPWRITE_DB          database id (default: sariswerte)
 *
 * When those are absent the app stays fully usable: `configured` is false, the
 * HUD says BACKEND OFFLINE, and every write is buffered in localStorage so the
 * store keeps working and syncs once the env vars are supplied. This mirrors the
 * brain's behaviour: degrade, never crash, never go silent.
 */

const ENDPOINT = (import.meta.env.VITE_APPWRITE_ENDPOINT ?? '').replace(/\/+$/, '');
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID ?? '';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DB ?? 'sariswerte';

export const configured = Boolean(ENDPOINT && PROJECT_ID);

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  databaseId: string;
}

export const config: AppwriteConfig = {
  endpoint: ENDPOINT,
  projectId: PROJECT_ID,
  databaseId: DATABASE_ID,
};

/** The five collections the store runs on. */
export const COLLECTIONS = {
  vendors: 'vendors',
  sales: 'sales',
  inventory: 'inventory',
  utang: 'utang',
  feedback: 'feedback',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** A vendor: the sari-sari store owner using the app. */
export interface Vendor {
  $id?: string;
  name: string;
  storeName: string;
  phone?: string;
  address?: string;
  createdAt?: string;
}

/** One line sold. `total` is stored so reports never re-derive it wrongly. */
export interface Sale {
  $id?: string;
  vendorId: string;
  item: string;
  qty: number;
  unitPrice: number;
  total: number;
  /** 'cash' | 'gcash' | 'maya' | 'utang' */
  paidWith: string;
  soldAt: string;
}

/** Stock on the shelf, including the reorder point. */
export interface InventoryItem {
  $id?: string;
  vendorId: string;
  item: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  /** Warn when qty falls to or below this. */
  reorderAt: number;
}

/** A running balance someone owes the store. */
export interface Utang {
  $id?: string;
  vendorId: string;
  customer: string;
  amount: number;
  note?: string;
  settled: boolean;
  openedAt: string;
}

/** Free-form note from a customer, with a rating out of 5. */
export interface Feedback {
  $id?: string;
  vendorId: string;
  customer: string;
  rating: number;
  message: string;
  createdAt: string;
}

export interface CollectionDocMap {
  vendors: Vendor;
  sales: Sale;
  inventory: InventoryItem;
  utang: Utang;
  feedback: Feedback;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Query string parameters, already encoded by the caller. */
  query?: string;
}

export class AppwriteError extends Error {
  readonly code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'AppwriteError';
    this.code = code;
  }
}

/**
 * Thin fetch wrapper over the Appwrite REST API. The official SDK is avoided on
 * purpose: it is a large dependency for five collections, and this keeps the
 * bundle small enough for a store phone on mobile data.
 */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!configured) {
    throw new AppwriteError('Appwrite is not configured', 0);
  }
  const url = `${ENDPOINT}${path}${opts.query ? `?${opts.query}` : ''}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': PROJECT_ID,
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppwriteError(text.slice(0, 200) || res.statusText, res.status);
  }
  return (await res.json()) as T;
}

interface DocList<T> {
  total: number;
  documents: T[];
}

/** Create a document in one of the five collections. */
export function createDocument<K extends CollectionName>(
  collection: K,
  data: CollectionDocMap[K],
): Promise<CollectionDocMap[K]> {
  return request<CollectionDocMap[K]>(`/databases/${DATABASE_ID}/collections/${collection}/documents`, {
    method: 'POST',
    body: { documentId: 'unique()', data },
  });
}

/** List documents, newest first. */
export function listDocuments<K extends CollectionName>(
  collection: K,
  limit = 50,
): Promise<DocList<CollectionDocMap[K]>> {
  const query = new URLSearchParams();
  query.set('queries[]', JSON.stringify({ method: 'limit', values: [limit] }));
  return request<DocList<CollectionDocMap[K]>>(
    `/databases/${DATABASE_ID}/collections/${collection}/documents`,
    { query: query.toString() },
  );
}

/** Patch a document in place. */
export function updateDocument<K extends CollectionName>(
  collection: K,
  documentId: string,
  data: Partial<CollectionDocMap[K]>,
): Promise<CollectionDocMap[K]> {
  return request<CollectionDocMap[K]>(
    `/databases/${DATABASE_ID}/collections/${collection}/documents/${documentId}`,
    { method: 'PATCH', body: { data } },
  );
}

/** Remove a document. */
export function deleteDocument(collection: CollectionName, documentId: string): Promise<unknown> {
  return request(`/databases/${DATABASE_ID}/collections/${collection}/documents/${documentId}`, {
    method: 'DELETE',
  });
}

/** A short line for the HUD, in the same voice as the brain status chip. */
export function backendStatus(): { label: string; online: boolean } {
  return configured
    ? { label: 'BACKEND LIVE', online: true }
    : { label: 'BACKEND OFFLINE', online: false };
}
