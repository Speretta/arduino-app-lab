import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';
import { scan, shareReplay } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

import {
  useObservable,
  useObservableRef,
  useObservableSelector,
} from './useObservable';

// The same shape as the unsaved-files subject: a Subject piped through scan + shareReplay(1).
function unsavedFilesLike(): {
  next: (fileId: string, unsaved: boolean) => void;
  observable: Subject<Set<string>>;
} {
  const source = new Subject<[string, boolean]>();
  const observable = source.pipe(
    scan<[string, boolean], Set<string>>((set, [fileId, unsaved]) => {
      const next = new Set(set);
      if (unsaved) next.add(fileId);
      else next.delete(fileId);
      return next;
    }, new Set<string>()),
    shareReplay(1),
  ) as unknown as Subject<Set<string>>;
  return {
    next: (fileId, unsaved) => source.next([fileId, unsaved]),
    observable,
  };
}

describe('useObservable', () => {
  it('returns the latest value and undefined for no observable', () => {
    const subject = new BehaviorSubject(1);
    const { result } = renderHook(() => useObservable(subject));
    expect(result.current).toBe(1);
    act(() => subject.next(2));
    expect(result.current).toBe(2);

    const none = renderHook(() => useObservable<number>(undefined));
    expect(none.result.current).toBeUndefined();
  });
});

describe('useObservableSelector', () => {
  it('re-renders only when the selected value changes', () => {
    const { next, observable } = unsavedFilesLike();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useObservableSelector(observable, (ids) => !!ids?.has('a.py'));
    });
    const after = renders;
    expect(result.current).toBe(false);

    act(() => next('b.py', true));
    expect(result.current).toBe(false);
    expect(renders).toBe(after);

    act(() => next('a.py', true));
    expect(result.current).toBe(true);
    expect(renders).toBe(after + 1);
  });
});

describe('useObservableRef', () => {
  it('tracks the latest value without re-rendering', () => {
    const { next, observable } = unsavedFilesLike();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useObservableRef(observable);
    });
    const after = renders;

    act(() => next('a.py', true));
    expect(result.current.current?.has('a.py')).toBe(true);
    expect(renders).toBe(after);
  });
});
