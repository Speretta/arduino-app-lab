import { Config } from '@cloud-editor-mono/common';
import { UAParser } from 'ua-parser-js';

function transformDataToContent(base64String: string): string {
  return decodeBase64ToString(base64String);
}

function transformContentToData(code: string): string {
  return btoa(unescape(encodeURIComponent(code)));
}

function transformBinContentToData(code: string): string {
  return unescape(encodeURIComponent(code));
}

function mimeTypeIsBinary(mimetype: string): boolean {
  return (
    !mimetype.startsWith('text') && !mimetype.startsWith('application/json')
  );
}

export function transformDataToContentByMimeType(
  base64String: string,
  mimetype?: string,
): string {
  if (mimetype && mimeTypeIsBinary(mimetype)) {
    // binary files are already stored and retrieved as base64
    return base64String;
  }

  return transformDataToContent(base64String);
}

export function transformContentToDataByMimeType(
  code: string,
  mimetype?: string,
): string {
  if (mimetype && mimeTypeIsBinary(mimetype)) {
    return transformBinContentToData(code);
  }

  return transformContentToData(code);
}

// Both reducers return the input set when the contents do not change. The unsaved-files subjects
// are read through `useSyncExternalStore`, which re-renders every subscriber on a new reference.
export function addToSet<T>(set: Set<T>, item: T): Set<T> {
  if (set.has(item)) return set;
  return new Set(set.add(item));
}

export function removeFromSet<T>(set: Set<T>, item: T): Set<T> {
  if (!set.has(item)) return set;
  set.delete(item);
  return new Set(set);
}

let parser: UAParser.UAParserInstance;

export function getOS(): string | undefined {
  if (!parser) {
    parser = new UAParser();
  }
  return parser.getOS().name;
}

export const isLinux = (): boolean =>
  !!getOS()?.toLowerCase().includes('linux');

export const isMacOS = (): boolean => getOS() === 'Mac OS';

export const isChromeOs =
  getOS() === 'Chromium OS' ||
  (Config.MODE !== 'production' &&
    new URLSearchParams(window.location.search).has('forceWebSerial')); // temporary for internal testing

export function getBrowser(): string | undefined {
  if (!parser) {
    parser = new UAParser();
  }
  return parser.getBrowser().name;
}

export function isPlayStoreApp(): boolean {
  const isChromebook = /CrOS/.test(navigator.userAgent);
  const isPWA = window.matchMedia('(display-mode: standalone)').matches;
  const flag = sessionStorage.getItem('arduino::chrome-app');

  return flag === 'true' || (isChromebook && isPWA);
}

export function replaceFileNameInvalidCharacters(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9-_]{1}[^a-zA-Z0-9-_.]{0,35}/g, '_');
}

function decodeBase64ToString(base64: string): string {
  try {
    return Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return base64;
  }
}

export { decodeBase64ToString };
