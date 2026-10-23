import type { LspReferencesResult } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLspReferencesStore } from './lspReferences';

/**
 * One field and two actions, but `close`'s return value is a contract rather
 * than a convenience: the editor's Escape binding runs
 * `closeLspReferences?.() ?? false`, and a `true` stops the key reaching the
 * lower-precedence handlers — the find-and-replace panel and the language
 * autocomplete. Reporting `true` with no panel open would swallow Escape.
 */

// Carried through to the row-click handler and never read here, so any panel
// value serves.
const ORIGIN_VIEW_INSTANCE_ID =
  0 as LspReferencesResult['originViewInstanceId'];

const result = (symbol: string): LspReferencesResult => ({
  symbol,
  groups: [],
  totalCount: 0,
  lspId: 'python',
  originViewInstanceId: ORIGIN_VIEW_INSTANCE_ID,
});

beforeEach(() => {
  useLspReferencesStore.setState({ result: null });
});

describe('useLspReferencesStore', () => {
  it('reports nothing to close when no panel is open', () => {
    expect(useLspReferencesStore.getState().close()).toBe(false);
  });

  it('closes an open panel and says that it did', () => {
    useLspReferencesStore.getState().show(result('add'));

    expect(useLspReferencesStore.getState().close()).toBe(true);
    expect(useLspReferencesStore.getState().result).toBeNull();
  });

  it('notifies nobody when there was nothing to close', () => {
    const listener = vi.fn();
    const unsubscribe = useLspReferencesStore.subscribe(listener);

    useLspReferencesStore.getState().close();
    unsubscribe();

    // Consumers subscribe without a selector, so an unguarded `set` here would
    // hand them a fresh state object — and re-render the editor page — on every
    // Escape press that had no panel to close.
    expect(listener).not.toHaveBeenCalled();
  });

  it('replaces the result when a second search runs over the first', () => {
    useLspReferencesStore.getState().show(result('add'));
    useLspReferencesStore.getState().show(result('subtract'));

    expect(useLspReferencesStore.getState().result?.symbol).toBe('subtract');
  });
});
