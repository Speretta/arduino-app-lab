import {
  createStore,
  del as idbDel,
  get as idbGet,
  set as idbSet,
  update as idbUpdate,
  UseStore,
} from 'idb-keyval';

// idb-keyval's default database and object store, so saved state carries over.
const DB_NAME = 'keyval-store';
const STORE_NAME = 'keyval';

const RETRY_DELAYS_MS = [250, 1000];
// Background attempts at 5 s, 15 s and 45 s after falling back to memory.
const BACKGROUND_DELAYS_MS = [5000, 10000, 30000];

// WebKit's message when the database file opens but has no complete
// IDBDatabaseInfo: its first creation was interrupted, or another process is
// creating it at this moment. The waiting tries rule out the second case.
const HALF_BUILT_MESSAGE = 'Unable to establish IDB database file';

type Backend =
  | { kind: 'indexeddb'; store: UseStore }
  | { kind: 'memory'; values: Map<IDBValidKey, unknown> };

let backend: Promise<Backend> | undefined;
let unavailable = false;
let reported = false;
let listener: (() => void) | undefined;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const deliverUnavailable = (): void => {
  if (unavailable && !reported && listener) {
    reported = true;
    listener();
  }
};

const reportUnavailable = (): void => {
  unavailable = true;
  deliverUnavailable();
};

/**
 * Calls `onUnavailable` once per launch, the first time storage cannot be
 * opened or written, including when that happened before subscribing.
 */
export const onStorageUnavailable = (
  onUnavailable: () => void,
): (() => void) => {
  listener = onUnavailable;
  deliverUnavailable();
  return () => {
    if (listener === onUnavailable) listener = undefined;
  };
};

// idb-keyval caches the open request per store, and a failed open stays
// failed, so every try needs a new store.
const openStore = async (): Promise<UseStore> => {
  const store = createStore(DB_NAME, STORE_NAME);
  await store('readonly', () => undefined);
  return store;
};

const isHalfBuilt = (error: unknown): boolean =>
  error instanceof DOMException &&
  error.name === 'UnknownError' &&
  error.message === HALF_BUILT_MESSAGE;

const deleteDatabase = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => reject(request.error);
    request.onblocked = (): void =>
      reject(
        new Error('deleting the database is blocked by an open connection'),
      );
  });

const retryInBackground = async (): Promise<void> => {
  for (const ms of BACKGROUND_DELAYS_MS) {
    await delay(ms);
    try {
      const store = await openStore();
      // Values written to memory are not merged: several keys are lists that
      // callers read and extend, and writing back a partial list drops entries.
      backend = Promise.resolve({ kind: 'indexeddb', store });
      return;
    } catch (error) {
      console.error('App Lab storage: background open failed', error);
    }
  }
};

const start = async (): Promise<Backend> => {
  const errors: unknown[] = [];
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await delay(RETRY_DELAYS_MS[attempt - 1]);
    try {
      return { kind: 'indexeddb', store: await openStore() };
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.every(isHalfBuilt)) {
    try {
      await deleteDatabase();
      const store = await openStore();
      console.warn(
        'App Lab storage: the database was incomplete and has been recreated',
      );
      return { kind: 'indexeddb', store };
    } catch (error) {
      errors.push(error);
    }
  }

  console.error(
    'App Lab storage: IndexedDB cannot be opened; using memory',
    errors,
  );
  reportUnavailable();
  void retryInBackground();
  return { kind: 'memory', values: new Map() };
};

const getBackend = (): Promise<Backend> => (backend ??= start());

// Never rejects: a caller such as the `/` loader must not fail because storage did.
const withBackend = async <T>(
  operation: string,
  onIndexedDb: (store: UseStore) => Promise<T>,
  onMemory: (values: Map<IDBValidKey, unknown>) => T,
  onFailure: T,
): Promise<T> => {
  const current = await getBackend();
  if (current.kind === 'memory') return onMemory(current.values);
  try {
    return await onIndexedDb(current.store);
  } catch (error) {
    console.error('App Lab storage: %s failed', operation, error);
    reportUnavailable();
    return onFailure;
  }
};

// The `any` default is idb-keyval's own, so call sites moved here keep the types
// they had.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const get = <T = any>(key: IDBValidKey): Promise<T | undefined> =>
  withBackend<T | undefined>(
    `get ${String(key)}`,
    (store) => idbGet<T>(key, store),
    (values) => values.get(key) as T | undefined,
    undefined,
  );

export const set = (key: IDBValidKey, value: unknown): Promise<void> =>
  withBackend(
    `set ${String(key)}`,
    (store) => idbSet(key, value, store),
    (values) => {
      values.set(key, value);
    },
    undefined,
  );

export const del = (key: IDBValidKey): Promise<void> =>
  withBackend(
    `del ${String(key)}`,
    (store) => idbDel(key, store),
    (values) => {
      values.delete(key);
    },
    undefined,
  );

export const update = <T>(
  key: IDBValidKey,
  updater: (oldValue: T | undefined) => T,
): Promise<void> =>
  withBackend(
    `update ${String(key)}`,
    (store) => idbUpdate<T>(key, updater, store),
    (values) => {
      values.set(key, updater(values.get(key) as T | undefined));
    },
    undefined,
  );
