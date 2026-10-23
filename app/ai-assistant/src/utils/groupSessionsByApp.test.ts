import { describe, expect, it } from 'vitest';

import { SessionSummary } from '../services';
import { groupSessionsByApp } from './groupSessionsByApp';

const session = (
  id: string,
  workspaceAppId?: string,
  workspaceName?: string,
): SessionSummary => ({ id, workspaceAppId, workspaceName });

describe('groupSessionsByApp', () => {
  it('puts every session of an app in the same folder, named after the app', () => {
    const folders = groupSessionsByApp(
      [
        session('s1', 'snack', 'Snack Sorter'),
        session('s2', 'weather', 'Weather Station'),
        session('s3', 'snack', 'Snack Sorter'),
      ],
      'Arduino Apps',
    );

    expect(folders.map((f) => [f.name, f.sessions.map((s) => s.id)])).toEqual([
      ['Snack Sorter', ['s1', 's3']],
      ['Weather Station', ['s2']],
    ]);
  });

  // The general folder is one of the folders, not a special case pinned to an end: it sorts with the rest.
  it('collects the sessions started outside an app in the general folder, in list order', () => {
    const folders = groupSessionsByApp(
      [session('s1'), session('s2', 'snack', 'Snack Sorter'), session('s3')],
      'Arduino Apps',
    );

    expect(folders.map((f) => [f.appId, f.name])).toEqual([
      ['', 'Arduino Apps'],
      ['snack', 'Snack Sorter'],
    ]);
    expect(folders[0].sessions.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  // A folder is the grouping itself: nothing left in it means no row, so no empty folder can linger.
  it('yields no folder for an app with no sessions', () => {
    expect(groupSessionsByApp([], 'Arduino Apps')).toEqual([]);
  });

  // The store may hold no name for an app (an older entry, or a board that never answered) — the id still labels the row.
  it('falls back to the app id when no name was remembered', () => {
    const [folder] = groupSessionsByApp(
      [session('s1', 'snack')],
      'Arduino Apps',
    );

    expect(folder.name).toBe('snack');
  });
});
