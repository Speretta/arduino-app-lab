import { UAParser } from 'ua-parser-js';

export function iterable<T>(cursor: Iterator<T>): Iterable<T> {
  return {
    [Symbol.iterator]: () => cursor,
  };
}

export const createMatchCounterWorker = (
  isEnabled: boolean = true,
): undefined | Worker => {
  return isEnabled
    ? new Worker(new URL('../workers/matchCounter.ts', import.meta.url), {
        type: 'module',
      })
    : undefined;
};

export const getShortcutCommand = (): string => {
  const parser = new UAParser();
  return parser.getOS().name === 'Mac OS' ? '⌘' : 'Ctrl+';
};

// Up to 2 initials from a full name, e.g. "Agustin Rujana" -> "AR"
export const getInitials = (name?: string): string | undefined => {
  const parts = name?.trim().split(/\s+/).filter(Boolean) || [];
  if (parts.length === 0) {
    return undefined;
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};
