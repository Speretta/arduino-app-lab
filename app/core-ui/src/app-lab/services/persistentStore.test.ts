import type { UseStore } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeStore = UseStore & {
  values: Map<IDBValidKey, unknown>;
  writeError?: unknown;
};

const h = vi.hoisted(() => ({
  createStore: vi.fn(),
  deleteDatabase: vi.fn(),
}));

vi.mock('idb-keyval', () => ({
  createStore: h.createStore,
  get: async (key: IDBValidKey, store: FakeStore): Promise<unknown> =>
    store.values.get(key),
  set: async (
    key: IDBValidKey,
    value: unknown,
    store: FakeStore,
  ): Promise<void> => {
    if (store.writeError) throw store.writeError;
    store.values.set(key, value);
  },
  del: async (key: IDBValidKey, store: FakeStore): Promise<void> => {
    if (store.writeError) throw store.writeError;
    store.values.delete(key);
  },
  update: async (
    key: IDBValidKey,
    updater: (old: unknown) => unknown,
    store: FakeStore,
  ): Promise<void> => {
    if (store.writeError) throw store.writeError;
    store.values.set(key, updater(store.values.get(key)));
  },
}));

const HALF_BUILT = 'Unable to establish IDB database file';
const CANNOT_OPEN = 'Unable to open database file on disk';

const idbError = (message: string): DOMException =>
  new DOMException(message, 'UnknownError');

const openingStore = (values = new Map<IDBValidKey, unknown>()): FakeStore =>
  Object.assign((() => Promise.resolve(undefined)) as unknown as UseStore, {
    values,
  });

const failingStore = (error: unknown): FakeStore =>
  Object.assign((() => Promise.reject(error)) as unknown as UseStore, {
    values: new Map<IDBValidKey, unknown>(),
  });

const deleteRequest = (
  outcome: 'success' | 'error',
): Partial<IDBOpenDBRequest> => {
  const request: Partial<IDBOpenDBRequest> = {};
  queueMicrotask(() => {
    const handler = outcome === 'success' ? request.onsuccess : request.onerror;
    handler?.call(request as IDBOpenDBRequest, new Event(outcome));
  });
  return request;
};

type StoreModule = typeof import('./persistentStore');

const load = async (): Promise<{
  store: StoreModule;
  unavailable: ReturnType<typeof vi.fn>;
}> => {
  const store = await import('./persistentStore');
  const unavailable = vi.fn();
  store.onStorageUnavailable(unavailable);
  return { store, unavailable };
};

// Waits out the two retries (250 ms, then 1 s) before the value resolves.
const settle = async <T>(pending: Promise<T>): Promise<T> => {
  await vi.advanceTimersByTimeAsync(1250);
  return pending;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  h.createStore.mockReset();
  h.deleteDatabase.mockReset();
  vi.stubGlobal('indexedDB', { deleteDatabase: h.deleteDatabase });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persistentStore', () => {
  it('uses IndexedDB when the first retry opens it, without a message', async () => {
    const good = openingStore(new Map([['k', 'saved']]));
    h.createStore
      .mockReturnValueOnce(failingStore(idbError(CANNOT_OPEN)))
      .mockReturnValueOnce(good);
    const { store, unavailable } = await load();

    expect(await settle(store.get('k'))).toBe('saved');
    await store.set('k', 'next');

    expect(good.values.get('k')).toBe('next');
    expect(h.createStore).toHaveBeenCalledTimes(2);
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('falls back to memory with one message when every try fails to open, without deleting', async () => {
    h.createStore.mockImplementation(() => failingStore(idbError(CANNOT_OPEN)));
    const { store, unavailable } = await load();

    expect(await settle(store.get('k'))).toBeUndefined();
    await store.set('k', 'in memory');
    expect(await store.get('k')).toBe('in memory');

    expect(h.createStore).toHaveBeenCalledTimes(3);
    expect(h.deleteDatabase).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it('deletes and recreates a half-built database once, without a message', async () => {
    const fresh = openingStore();
    h.createStore
      .mockReturnValueOnce(failingStore(idbError(HALF_BUILT)))
      .mockReturnValueOnce(failingStore(idbError(HALF_BUILT)))
      .mockReturnValueOnce(failingStore(idbError(HALF_BUILT)))
      .mockReturnValueOnce(fresh);
    h.deleteDatabase.mockImplementation(() => deleteRequest('success'));
    const { store, unavailable } = await load();

    expect(await settle(store.get('k'))).toBeUndefined();
    await store.set('k', 'kept');

    expect(h.deleteDatabase).toHaveBeenCalledTimes(1);
    expect(h.deleteDatabase).toHaveBeenCalledWith('keyval-store');
    expect(fresh.values.get('k')).toBe('kept');
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('does not delete when the half-built error clears on the last try', async () => {
    const good = openingStore();
    h.createStore
      .mockReturnValueOnce(failingStore(idbError(HALF_BUILT)))
      .mockReturnValueOnce(failingStore(idbError(HALF_BUILT)))
      .mockReturnValueOnce(good);
    const { store, unavailable } = await load();

    await settle(store.get('k'));

    expect(h.deleteDatabase).not.toHaveBeenCalled();
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('falls back to memory once when the recreated database also fails', async () => {
    h.createStore.mockImplementation(() => failingStore(idbError(HALF_BUILT)));
    h.deleteDatabase.mockImplementation(() => deleteRequest('success'));
    const { store, unavailable } = await load();

    await settle(store.get('k'));
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');

    expect(h.createStore).toHaveBeenCalledTimes(4);
    expect(h.deleteDatabase).toHaveBeenCalledTimes(1);
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it('falls back to memory when the delete fails', async () => {
    h.createStore.mockImplementation(() => failingStore(idbError(HALF_BUILT)));
    h.deleteDatabase.mockImplementation(() => deleteRequest('error'));
    const { store, unavailable } = await load();

    await settle(store.get('k'));

    expect(h.createStore).toHaveBeenCalledTimes(3);
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it('switches to IndexedDB after a background retry and drops the memory values', async () => {
    const recovered = openingStore(new Map([['k', 'saved']]));
    h.createStore
      .mockReturnValueOnce(failingStore(idbError(CANNOT_OPEN)))
      .mockReturnValueOnce(failingStore(idbError(CANNOT_OPEN)))
      .mockReturnValueOnce(failingStore(idbError(CANNOT_OPEN)))
      .mockReturnValueOnce(failingStore(idbError(CANNOT_OPEN)))
      .mockReturnValueOnce(recovered);
    const { store, unavailable } = await load();

    await settle(store.get('k'));
    await store.set('k', 'in memory');

    await vi.advanceTimersByTimeAsync(5000); // first background try fails
    expect(await store.get('k')).toBe('in memory');
    await vi.advanceTimersByTimeAsync(10000); // second one opens

    expect(await store.get('k')).toBe('saved');
    expect(recovered.values.get('k')).toBe('saved');
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it('catches write failures after a good open and reports them once', async () => {
    const broken = openingStore();
    broken.writeError = new DOMException(
      'attempt to write a readonly database',
    );
    h.createStore.mockReturnValueOnce(broken);
    const { store, unavailable } = await load();

    await expect(store.set('a', 1)).resolves.toBeUndefined();
    await expect(store.del('a')).resolves.toBeUndefined();
    await expect(
      store.update<number>('a', (old) => (old ?? 0) + 1),
    ).resolves.toBeUndefined();

    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it('delivers a failure that happened before anyone subscribed', async () => {
    h.createStore.mockImplementation(() => failingStore(idbError(CANNOT_OPEN)));
    const store = await import('./persistentStore');
    await settle(store.get('k'));

    const late = vi.fn();
    store.onStorageUnavailable(late);
    store.onStorageUnavailable(late);

    expect(late).toHaveBeenCalledTimes(1);
  });
});
