import 'fake-indexeddb/auto';

import * as IDB from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OPEN_FILES_KEY, OpenFilesStore } from '../../common/hooks/files';
import {
  moveOpenFilesEntry,
  patchOpenFilesEntry,
  pruneOrphanedOpenFiles,
  removeOpenFilesForApp,
} from './openFilesStore';

const item = (label: string): OpenFilesStore[string] => ({
  items: [label],
  selected: label,
});

const seed = async (store: OpenFilesStore): Promise<void> => {
  await IDB.set(OPEN_FILES_KEY, store);
};

const read = async (): Promise<OpenFilesStore | undefined> =>
  IDB.get<OpenFilesStore>(OPEN_FILES_KEY);

beforeEach(async () => {
  await IDB.clear();
});

afterEach(async () => {
  await IDB.clear();
});

describe('removeOpenFilesForApp', () => {
  it('removes only the current-board record for the app', async () => {
    await seed({
      'app-a-SERIAL1': item('a1'),
      'app-a-SERIAL2': item('a2'),
      'app-a-example': item('aEx'),
      'app-b-SERIAL1': item('b1'),
    });

    await removeOpenFilesForApp('app-a', 'SERIAL1');

    expect(await read()).toEqual({
      'app-a-SERIAL2': item('a2'),
      'app-a-example': item('aEx'),
      'app-b-SERIAL1': item('b1'),
    });
  });

  it('removes the bare record when no board serial is given', async () => {
    await seed({ 'app-a': item('a'), 'app-a-SERIAL1': item('a1') });

    await removeOpenFilesForApp('app-a');

    expect(await read()).toEqual({ 'app-a-SERIAL1': item('a1') });
  });

  it('is a no-op when the record is absent', async () => {
    await seed({ 'app-b-SERIAL1': item('b1') });

    await removeOpenFilesForApp('app-a', 'SERIAL1');

    expect(await read()).toEqual({ 'app-b-SERIAL1': item('b1') });
  });
});

describe('pruneOrphanedOpenFiles', () => {
  it('drops orphan current-board records but keeps existing apps', async () => {
    await seed({
      'app-live-SERIAL1': item('live'),
      'app-dead-SERIAL1': item('dead'),
    });

    await pruneOrphanedOpenFiles(['app-live'], 'SERIAL1');

    expect(await read()).toEqual({ 'app-live-SERIAL1': item('live') });
  });

  it('leaves other boards and example records untouched', async () => {
    await seed({
      'app-dead-SERIAL1': item('dead'),
      'app-dead-SERIAL2': item('otherBoard'),
      'app-dead-example': item('example'),
    });

    await pruneOrphanedOpenFiles(['app-live'], 'SERIAL1');

    expect(await read()).toEqual({
      'app-dead-SERIAL2': item('otherBoard'),
      'app-dead-example': item('example'),
    });
  });

  it('does nothing when no board serial is provided', async () => {
    const store = { 'app-dead-SERIAL1': item('dead') };
    await seed(store);

    await pruneOrphanedOpenFiles(['app-live'], undefined);

    expect(await read()).toEqual(store);
  });

  it('never wipes the store when the app list is empty', async () => {
    const store = { 'app-dead-SERIAL1': item('dead') };
    await seed(store);

    await pruneOrphanedOpenFiles([], 'SERIAL1');

    expect(await read()).toEqual(store);
  });
});

describe('moveOpenFilesEntry', () => {
  it('moves the record to the new key', async () => {
    await seed({ 'app-old-SERIAL1': item('x'), 'app-b-SERIAL1': item('b') });

    await moveOpenFilesEntry('app-old-SERIAL1', 'app-new-SERIAL1');

    expect(await read()).toEqual({
      'app-new-SERIAL1': item('x'),
      'app-b-SERIAL1': item('b'),
    });
  });

  it('is a no-op when the source key is missing', async () => {
    await seed({ 'app-b-SERIAL1': item('b') });

    await moveOpenFilesEntry('app-old-SERIAL1', 'app-new-SERIAL1');

    expect(await read()).toEqual({ 'app-b-SERIAL1': item('b') });
  });
});

describe('patchOpenFilesEntry', () => {
  it('merges onto the previous record', async () => {
    await seed({ 'app-a-SERIAL1': item('a') });

    await patchOpenFilesEntry('app-a-SERIAL1', () => ({ selected: 'b' }));

    expect((await read())?.['app-a-SERIAL1']).toMatchObject({
      items: ['a'],
      selected: 'b',
    });
  });

  it('serializes concurrent writes without losing any', async () => {
    await seed({});

    await Promise.all([
      patchOpenFilesEntry('a-S', () => ({ items: ['a'], selected: 'a' })),
      patchOpenFilesEntry('b-S', () => ({ items: ['b'], selected: 'b' })),
      pruneOrphanedOpenFiles(['a'], 'S'),
    ]);

    expect(Object.keys((await read()) ?? {}).sort()).toEqual(['a-S']);
  });
});
