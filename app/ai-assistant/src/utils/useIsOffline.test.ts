import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useIsOffline } from './useIsOffline';

const setOnLine = (value: boolean | undefined): void => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
};

const emit = (event: 'online' | 'offline'): void =>
  act(() => {
    window.dispatchEvent(new Event(event));
  });

// The offline toast has no close button and no timer: this hook is the only thing that raises it and
// the only thing that takes it away, so both directions are tested.
describe('useIsOffline', () => {
  afterEach(() => setOnLine(true));

  it('starts from the current connection state', () => {
    setOnLine(false);
    expect(renderHook(() => useIsOffline()).result.current).toBe(true);
  });

  it('reports the connection dropping and coming back', () => {
    setOnLine(true);
    const { result } = renderHook(() => useIsOffline());
    expect(result.current).toBe(false);

    setOnLine(false);
    emit('offline');
    expect(result.current).toBe(true);

    setOnLine(true);
    emit('online');
    expect(result.current).toBe(false);
  });

  it('treats a platform that reports nothing as online, so the chat is never locked out', () => {
    setOnLine(undefined);
    expect(renderHook(() => useIsOffline()).result.current).toBe(false);
  });

  it('stops listening once unmounted', () => {
    setOnLine(true);
    const { result, unmount } = renderHook(() => useIsOffline());
    unmount();

    setOnLine(false);
    emit('offline');
    expect(result.current).toBe(false);
  });
});
