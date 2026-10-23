import { describe, expect, it } from 'vitest';

import { addToSet, removeFromSet } from './utils';

describe('addToSet', () => {
  it('returns a new set when the item is added', () => {
    const set = new Set(['a']);

    const next = addToSet(set, 'b');

    expect(next).not.toBe(set);
    expect([...next]).toEqual(['a', 'b']);
  });

  it('returns the same set when the item is already present', () => {
    const set = new Set(['a', 'b']);

    const next = addToSet(set, 'b');

    expect(next).toBe(set);
    expect([...next]).toEqual(['a', 'b']);
  });

  it('builds up from an empty set', () => {
    const empty = new Set<string>();

    const one = addToSet(empty, 'a');
    const stillOne = addToSet(one, 'a');

    expect([...one]).toEqual(['a']);
    expect(stillOne).toBe(one);
  });
});

describe('removeFromSet', () => {
  it('returns a new set when the item is removed', () => {
    const set = new Set(['a', 'b']);

    const next = removeFromSet(set, 'b');

    expect(next).not.toBe(set);
    expect([...next]).toEqual(['a']);
  });

  it('returns the same set when the item is absent', () => {
    const set = new Set(['a']);

    const next = removeFromSet(set, 'b');

    expect(next).toBe(set);
    expect([...next]).toEqual(['a']);
  });

  it('returns the same empty set when removing from empty', () => {
    const empty = new Set<string>();

    expect(removeFromSet(empty, 'a')).toBe(empty);
  });
});

describe('addToSet / removeFromSet as a reducer pair', () => {
  it('changes identity exactly when the contents change', () => {
    const seen: Set<string>[] = [];
    let acc = new Set<string>();

    const apply = (id: string, unsaved: boolean): void => {
      acc = unsaved ? addToSet(acc, id) : removeFromSet(acc, id);
      seen.push(acc);
    };

    // mark, then nine no-op re-marks (one per keystroke), then save
    apply('a.ino', true);
    for (let i = 0; i < 9; i++) apply('a.ino', true);
    apply('a.ino', false);

    const distinct = new Set(seen);
    // The marked set and the cleared set. The nine no-op re-marks add no references.
    expect(distinct.size).toBe(2);
    expect(acc.size).toBe(0);
  });
});
