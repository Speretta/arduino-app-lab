import { AppInfo } from '@cloud-editor-mono/infrastructure';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idbStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: (key: string): Promise<unknown> => Promise.resolve(idbStore.get(key)),
  set: (key: string, value: unknown): Promise<void> => {
    idbStore.set(key, value);
    return Promise.resolve();
  },
}));

vi.mock('../notifications', () => ({ sendAppLabNotification: vi.fn() }));

import { RELEASE_INTRO_ACKNOWLEDGED } from '../../constants';
import { useReleaseDialogStore } from '../../store/releaseDialog';
import { useCreateReleaseTrigger } from './releaseDialogs.logic';

const app: AppInfo = { id: 'app-1', name: 'Magic Storyteller', icon: '🏰' };

describe('useCreateReleaseTrigger', () => {
  beforeEach(() => {
    idbStore.clear();
    useReleaseDialogStore.getState().setOpen(false);
  });

  it('opens the explainer first when it has never been acknowledged', async () => {
    const { result } = renderHook(() => useCreateReleaseTrigger());

    act(() => result.current.openCreateRelease(app));

    await waitFor(() =>
      expect(useReleaseDialogStore.getState().open).toBe(true),
    );
    const state = useReleaseDialogStore.getState();
    expect(state.step).toBe('intro');
    expect(state.app).toEqual(app);
  });

  it('skips straight to the form once the explainer is acknowledged', async () => {
    idbStore.set(RELEASE_INTRO_ACKNOWLEDGED, true);
    const { result } = renderHook(() => useCreateReleaseTrigger());

    act(() => result.current.openCreateRelease(app));

    await waitFor(() =>
      expect(useReleaseDialogStore.getState().open).toBe(true),
    );
    const state = useReleaseDialogStore.getState();
    expect(state.step).toBe('form');
    expect(state.app).toEqual(app);
  });
});
