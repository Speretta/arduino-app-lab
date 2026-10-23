import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { BehaviorSubject, Observable } from 'rxjs';

// from React README: https://github.com/facebook/react/blob/main/packages/use-subscription/README.md#replaysubject
// to support `ReplaySubject` or observables piped to `shareReplay`
function latestValue<T>(observable: Observable<T>): T | undefined {
  if (observable instanceof BehaviorSubject) {
    return observable.getValue();
  }
  let currentValue: T | undefined;
  observable
    .subscribe((value) => {
      currentValue = value;
    })
    .unsubscribe();
  return currentValue;
}

function useSubscribe<T>(
  observable: Observable<T> | undefined,
): (callback: VoidFunction) => VoidFunction {
  return useCallback(
    (callback: VoidFunction) => {
      if (!observable) return (): void => undefined;
      const subscription = observable.subscribe(callback);
      return () => subscription.unsubscribe();
    },
    [observable],
  );
}

// The `Observable<T>` overload comes first so `T` is still inferred from the observable alone:
// with a single `Observable<T> | undefined` signature a union such as
// `BehaviorSubject<X> | Observable<never>` infers `never`.

// to be used with `BehaviorSubject`, `ReplaySubject` or an observable piped to `shareReplay`.
export function useObservable<T>(observable: Observable<T>): T | undefined;
export function useObservable<T>(
  observable: Observable<T> | undefined,
): T | undefined;
export function useObservable<T>(
  observable: Observable<T> | undefined,
): T | undefined {
  const subscribe = useSubscribe(observable);
  const getSnapshot = useCallback(
    () => (observable ? latestValue(observable) : undefined),
    [observable],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Re-renders only when `selector`'s result changes (compared with `Object.is`), so a component
// that needs one fact about a large value does not re-render for every other change to it.
export function useObservableSelector<T, S>(
  observable: Observable<T>,
  selector: (value: T | undefined) => S,
): S;
export function useObservableSelector<T, S>(
  observable: Observable<T> | undefined,
  selector: (value: T | undefined) => S,
): S;
export function useObservableSelector<T, S>(
  observable: Observable<T> | undefined,
  selector: (value: T | undefined) => S,
): S {
  const subscribe = useSubscribe(observable);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = useCallback(
    () => selectorRef.current(observable ? latestValue(observable) : undefined),
    [observable],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

// The latest value without a re-render, for a value that changes often and is read only in
// callbacks and event handlers. The effect seeds the ref: `BehaviorSubject` and `shareReplay`
// replay on subscribe, before any handler can run.
export function useObservableRef<T>(
  observable: Observable<T>,
): MutableRefObject<T | undefined>;
export function useObservableRef<T>(
  observable: Observable<T> | undefined,
): MutableRefObject<T | undefined>;
export function useObservableRef<T>(
  observable: Observable<T> | undefined,
): MutableRefObject<T | undefined> {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (!observable) return undefined;
    const subscription = observable.subscribe((value) => {
      ref.current = value;
    });
    return () => subscription.unsubscribe();
  }, [observable]);
  return ref;
}
