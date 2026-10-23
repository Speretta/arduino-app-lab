import { act, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { usePreviewFileId } from './usePreviewFileId';

describe('usePreviewFileId', () => {
  it('clears the preview flag once the previewed file becomes unsaved', () => {
    const unsavedFiles$ = new Subject<Set<string>>();
    const { result } = renderHook(() => usePreviewFileId(unsavedFiles$));

    act(() => result.current[1]('main.py'));
    expect(result.current[0]).toBe('main.py');
    expect(result.current[2].current).toBe('main.py');

    act(() => unsavedFiles$.next(new Set(['other.py'])));
    expect(result.current[0]).toBe('main.py');

    act(() => unsavedFiles$.next(new Set(['main.py'])));
    expect(result.current[0]).toBeUndefined();
    expect(result.current[2].current).toBeUndefined();
  });

  it('works without an observable', () => {
    const { result } = renderHook(() => usePreviewFileId(undefined));
    act(() => result.current[1]('main.py'));
    expect(result.current[0]).toBe('main.py');
  });
});
