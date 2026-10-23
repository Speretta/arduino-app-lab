import { debounce } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UsePanelPersistence {
  /** For `defaultSize`: a registration prop, so it must not move. */
  sizeAtMount: number | undefined;
  /** For a panel that remounts mid-session; `sizeAtMount` reopens it stale. */
  getLatestSize: () => number | undefined;
  setStoredSize: (sizePx: number) => void;
}

const read = (storageKey: string): number | undefined => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    const value = Number(JSON.parse(raw));
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const write = (storageKey: string, px: number): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(px));
  } catch {
    // Persisting panel size is best-effort.
  }
};

/**
 * Custom persistence layer that stores a panel's last known size in pixels,
 * replacing react-resizable-panels' built-in percentage-based persistence
 * (which does not scale across sessions on differently sized screens).
 */
export const usePanelPersistence = (
  storageKey: string,
): UsePanelPersistence => {
  const [sizeAtMount] = useState<number | undefined>(() => read(storageKey));
  const latestSize = useRef<number | undefined>(sizeAtMount);

  const persist = useMemo(
    () =>
      debounce((sizePx: number) => {
        write(storageKey, sizePx);
      }, 300),
    [storageKey],
  );

  useEffect(() => (): void => persist.cancel(), [persist]);

  const getLatestSize = useCallback(
    (): number | undefined => latestSize.current,
    [],
  );

  const setStoredSize = useCallback(
    (sizePx: number): void => {
      latestSize.current = sizePx;
      persist(sizePx);
    },
    [persist],
  );

  return { sizeAtMount, getLatestSize, setStoredSize };
};
