import { useCallback, useState } from 'react';

export interface UsePersistedFlag {
  /** Current value. */
  value: boolean;
  /** Sets the flag; safe to call again once it is set. */
  set: () => void;
}

const read = (storageKey: string): boolean => {
  try {
    return localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
};

const write = (storageKey: string): void => {
  try {
    localStorage.setItem(storageKey, 'true');
  } catch {
    // Remembering the flag is best-effort.
  }
};

/**
 * A one-way boolean remembered across sessions: false until something sets it,
 * then true for good.
 */
export const usePersistedFlag = (storageKey: string): UsePersistedFlag => {
  const [value, setValue] = useState<boolean>(() => read(storageKey));

  const set = useCallback((): void => {
    write(storageKey);
    setValue(true);
  }, [storageKey]);

  return { value, set };
};
