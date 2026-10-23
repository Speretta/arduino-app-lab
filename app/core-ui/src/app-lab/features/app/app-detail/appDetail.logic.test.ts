/**
 * The file-tree handlers' conflict guard. `WriteFileContent` truncates and
 * `RenameFile` is read + write + remove, so this check is the only thing
 * standing between an existing file and being overwritten: when it cannot be
 * resolved the operation must not go ahead.
 *
 * Everything the logic hook composes is stubbed; only its own handlers run.
 */

import type { AppsSection } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createContext, createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardScopedQuery } from '../../../boardScopedQuery';
import {
  SKETCH_INO_TEMPLATE,
  SKETCH_YAML_TEMPLATE,
} from '../../../utils/sketch-file-templates';
import { useAppDetailLogic } from './appDetail.logic';

// Every stub is created once: a new identity per render would restart the
// hook's effects and spin.
const h = vi.hoisted(() => ({
  // Wraps a value as a module factory / hook stub with an explicit return type.
  stub:
    <T>(value: T) =>
    (): T =>
      value,
  statAppPath: vi.fn(),
  getAppBricks: vi.fn((): Promise<never[]> => Promise.resolve([])),
  sendAppLabNotification: vi.fn(),
  appFiles: {
    fileTree: [],
    appDirListed: true,
    appDirFailed: false,
    expandDir: vi.fn(),
    collapseDir: vi.fn(),
    revealPath: vi.fn(),
    findFileNode: (): undefined => undefined,
    invalidateDirs: vi.fn(),
    unlistDir: vi.fn(),
    renameDir: vi.fn(),
    refetchAppYaml: vi.fn(),
    refetchSketchYaml: vi.fn(),
    fetchFile: vi.fn(),
    refreshFileContents: vi.fn(),
  },
  editorFiles: {
    unsavedFileIds: [],
    editorFiles: [],
    openFiles: [],
    openFileIds: [],
    selectFile: vi.fn(),
    updateOpenFile: vi.fn(),
    updateOpenFilesOrder: vi.fn(),
    closeFile: vi.fn(),
    onAppRename: vi.fn(),
    openFilesStore: {},
    storeSplitState: vi.fn(),
  },
  lsp: { lspClients: [] },
  editorPanel: { rightPanelTabs: [] },
  runtime: { runtimeActionsLogic: (): Record<string, never> => ({}) },
  // The arguments of the last `useAppDetailRuntimeLogic` call.
  runtimeArgs: [] as unknown[],
  updateAppBrick: vi.fn(),
  updateAppDetail: vi.fn(),
  getAppDetail: vi.fn(),
  sketchLibraryDialog: { openDialog: vi.fn(), dialogLogic: vi.fn() },
  titleLogic: (): { onAppAction: () => void } => ({ onAppAction: vi.fn() }),
  brickDetailLogic: vi.fn(),
  importDialogLogic: vi.fn(),
  fileOperations: {
    renameFile: vi.fn(() => Promise.resolve()),
    deleteFile: vi.fn(),
    removeFolder: vi.fn(),
    addFile: vi.fn(() => Promise.resolve()),
    addFolder: vi.fn(() => Promise.resolve()),
    openFile: vi.fn(),
  },
  queryClient: { invalidateQueries: vi.fn() },
  activeSelectedFile: { fileId: 'python/sub/x.py', fileExtension: 'py' },
}));

const APP = { id: 'app-1', path: '/apps/foo', name: 'foo' };
// Reassigned by the test covering an app whose path never resolved.
let appPath: string | undefined = APP.path;

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  (): Record<string, unknown> => ({
    statAppPath: h.statAppPath,
    listAppDirectory: vi.fn((): Promise<never[]> => Promise.resolve([])),
    getAppDetail: h.getAppDetail.mockImplementation(
      (): Promise<Omit<typeof APP, 'path'> & { path?: string }> =>
        Promise.resolve({ ...APP, path: appPath }),
    ),
    getAppBricks: h.getAppBricks,
    getBricks: (): Promise<never[]> => Promise.resolve([]),
    getUnsavedFilesSubject: h.stub({ subscribe: vi.fn() }),
    addAppBrick: vi.fn(),
    addAppCustomBrick: vi.fn(),
    deleteAppBrick: vi.fn(),
    importResourceToAppFromPath: vi.fn(),
    openFileExternal: vi.fn(),
    openLinkExternal: vi.fn(),
    renameAppCustomBrick: vi.fn(),
    selectResourcePathToImport: vi.fn(),
    updateAppBrick: h.updateAppBrick,
    updateAppDetail: h.updateAppDetail,
  }),
);

vi.mock(
  '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab',
  async (importOriginal): Promise<Record<string, unknown>> => ({
    ...(await importOriginal<Record<string, unknown>>()),
    useI18n: h.stub({ formatMessage: (m: { id: string }): string => m.id }),
  }),
);

vi.mock(
  '@cloud-editor-mono/images/assets/file-icons',
  h.stub({ FileIcon: (): null => null }),
);

// Flipped by the ⌘L tests: main keeps this route mounted (hidden) while Agent Mode is on screen.
let agentModeActive = false;

vi.mock(
  '@tanstack/react-router',
  h.stub({
    useNavigate: h.stub(vi.fn()),
    // All the logic asks the router is whether Agent Mode is the surface on screen.
    useRouterState: (): boolean => agentModeActive,
  }),
);

vi.mock(
  '../../notifications',
  h.stub({ sendAppLabNotification: h.sendAppLabNotification }),
);

// `findFileNode` closes over the listings, so the real hook hands back a new
// identity every time a folder is listed or refetched. Reproduced here.
vi.mock(
  './hooks/useAppFiles',
  h.stub({
    MAIN_SKETCH_PATH: 'sketch/sketch.ino',
    SKETCH_YAML_PATH: 'sketch/sketch.yaml',
    useAppFiles: (): Record<string, unknown> => ({
      ...h.appFiles,
      findFileNode: (): undefined => undefined,
    }),
  }),
);

vi.mock(
  './hooks/useFileOperations',
  h.stub({ useFileOperations: h.stub(h.fileOperations) }),
);

vi.mock(
  './hooks/useEditorFiles',
  h.stub({ useEditorFiles: h.stub(h.editorFiles) }),
);

vi.mock('./hooks/useLSP', h.stub({ useLSP: h.stub(h.lsp) }));
vi.mock('./hooks/useFileWatch', h.stub({ useFileWatch: vi.fn() }));
vi.mock(
  './hooks/useSketchLibraries',
  h.stub({ useSketchLibraries: h.stub({}) }),
);
vi.mock(
  './hooks/useSketchLibrariesDialogs',
  h.stub({ useAddSketchLibraryDialog: h.stub(h.sketchLibraryDialog) }),
);
vi.mock(
  './sub-components/editor-panel/appLabEditorPanel',
  h.stub({ useCreateEditorPanelLogic: h.stub(h.editorPanel) }),
);
vi.mock(
  './sub-components/runtime/appDetailRuntime',
  h.stub({
    useAppDetailRuntimeLogic: (...args: unknown[]): typeof h.runtime => {
      h.runtimeArgs = args;
      return h.runtime;
    },
  }),
);
vi.mock(
  './sub-components/title/appDetailTitle',
  h.stub({ useCreateAppTitleLogic: h.stub(h.titleLogic) }),
);
vi.mock('../../../hooks/useIsBoard', h.stub({ useIsBoard: h.stub({}) }));
vi.mock('../../../hooks/useNotFound', h.stub({ useNotFound: vi.fn() }));
vi.mock(
  '../../../hooks/useBrickDetail',
  h.stub({
    makeAppBrickDetailLogic: h.stub(h.brickDetailLogic),
    useConfigureAppBrickDialog: vi.fn(),
  }),
);
vi.mock(
  '../../../hooks/useImportResource',
  h.stub({ useImportResource: h.stub(h.importDialogLogic) }),
);
vi.mock(
  '../../../utils/create-webui-files',
  h.stub({ createWebUIFiles: vi.fn() }),
);
vi.mock('../../../../common/hooks/keywords', h.stub({ useKeywords: vi.fn() }));
// Built inside the factory, not around it: a mock factory runs before the
// file's own imports are initialised, so `createContext` is not there yet.
vi.mock(
  '../../../providers/language-server/languageServerContext',
  (): Record<string, unknown> => ({
    LanguageServerContext: createContext({
      activeSelectedFile: h.activeSelectedFile,
      setActiveSelectedFile: vi.fn(),
    }),
  }),
);
// The route tree drags in the whole app (auth included); only one map is used.
vi.mock(
  '../../../routes/__root',
  h.stub({
    DETAIL_PATH_BY_SECTION: { 'my-apps': '/my-apps', examples: '/examples' },
  }),
);
vi.mock(
  '../../../../common/providers/data-fetching/QueryProvider',
  h.stub({ queryClient: h.queryClient }),
);

type Handlers = {
  addFileHandler: (path: string) => Promise<void>;
  addFolderHandler: (path: string) => Promise<void>;
  renameFileHandler: (
    path: string,
    newName: string,
    appendExt?: boolean,
    nodeType?: 'file' | 'folder',
  ) => Promise<void>;
  renameAppCustomBrick: (
    brickId: string,
    params: { name: string },
  ) => Promise<boolean>;
  addAppCustomBrick: (
    appId: string,
    body: { name: string },
  ) => Promise<{ id: string } | undefined>;
};

const renderHandlers = async (): Promise<Handlers> => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(
    () =>
      useAppDetailLogic('app-1', 'my-apps').appLabEditSectionLogic() as unknown,
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );

  await waitFor(() =>
    expect((result.current as { app?: unknown }).app).toBeDefined(),
  );
  return result.current as Handlers;
};

const errorNotifications = (): unknown[] =>
  h.sendAppLabNotification.mock.calls.filter(
    ([params]) => params.variant === 'error',
  );

beforeEach(() => {
  vi.clearAllMocks();
  appPath = APP.path;
  agentModeActive = false;
  h.statAppPath.mockRejectedValue(new Error('board unreachable'));
});

describe('appDetail.logic file reveal', () => {
  // Revealing expands the selected file's ancestors, so re-revealing re-adds a
  // folder the user has since collapsed. It belongs to the selection changing,
  // not to every listing: the effect that also reads `findFileNode` used to run
  // it, and that runs again after each watcher refetch.
  it('reveals the selected file once, whatever the listings do', async () => {
    await renderHandlers();

    expect(h.appFiles.revealPath).toHaveBeenCalledTimes(1);
    expect(h.appFiles.revealPath).toHaveBeenCalledWith('python/sub/x.py');
  });
});

describe('appDetail.logic conflict check', () => {
  it('does not create a file when the check fails', async () => {
    const { addFileHandler } = await renderHandlers();

    await addFileHandler('python/new.py');

    expect(h.fileOperations.addFile).not.toHaveBeenCalled();
    expect(errorNotifications()).toHaveLength(1);
  });

  it('does not create a folder when the check fails', async () => {
    const { addFolderHandler } = await renderHandlers();

    await addFolderHandler('python/lib');

    expect(h.fileOperations.addFolder).not.toHaveBeenCalled();
    expect(errorNotifications()).toHaveLength(1);
  });

  it('does not rename when the check fails', async () => {
    const { renameFileHandler } = await renderHandlers();

    await renameFileHandler('python/old.py', 'new.py', false, 'file');

    expect(h.fileOperations.renameFile).not.toHaveBeenCalled();
    expect(errorNotifications()).toHaveLength(1);
  });

  // Without a path there is nothing to stat, and the write would land on
  // `/<relative path>` on the host.
  it('does not create a file when the app has no path', async () => {
    appPath = undefined;
    h.statAppPath.mockResolvedValue(null);
    const { addFileHandler } = await renderHandlers();

    await addFileHandler('python/new.py');

    expect(h.statAppPath).not.toHaveBeenCalled();
    expect(h.fileOperations.addFile).not.toHaveBeenCalled();
    expect(errorNotifications()).toHaveLength(1);
  });

  it('creates the file when the check says the name is free', async () => {
    h.statAppPath.mockResolvedValue(null);
    const { addFileHandler } = await renderHandlers();

    await addFileHandler('python/new.py');

    expect(h.fileOperations.addFile).toHaveBeenCalled();
  });
});

describe('appDetail.logic sketch files created by hand', () => {
  // The stub is declared without parameters, so its calls are typed empty.
  const written = (): Array<[string, string | undefined]> =>
    (h.fileOperations.addFile.mock.calls as unknown as string[][]).map(
      ([path, , , content]) => [path, content],
    );

  beforeEach(() => {
    h.statAppPath.mockResolvedValue(null);
  });

  it('writes the sketch.yaml template into a sketch.yaml in any folder', async () => {
    const { addFileHandler } = await renderHandlers();

    await addFileHandler('python/sketch.yaml');

    expect(written()).toEqual([['python/sketch.yaml', SKETCH_YAML_TEMPLATE]]);
  });

  it('writes the sketch.ino template and also creates sketch/sketch.yaml when sketch/sketch.ino is created', async () => {
    const { addFileHandler } = await renderHandlers();

    await addFileHandler('sketch/sketch.ino');

    expect(written()).toEqual([
      ['sketch/sketch.ino', SKETCH_INO_TEMPLATE],
      ['sketch/sketch.yaml', SKETCH_YAML_TEMPLATE],
    ]);
    expect(errorNotifications()).toHaveLength(0);
  });

  it('writes any other name empty', async () => {
    const { addFileHandler } = await renderHandlers();

    await addFileHandler('python/new.py');

    expect(written()).toEqual([['python/new.py', '']]);
  });
});

// A tab id that is not in the brick list is shown as a file without an
// extension, so the brick tab must not get the new id before the list has it.
// Holds the next brick list request open and returns its resolver.
const holdNextBrickList = (): (() => void) => {
  let release: () => void = () => undefined;
  h.getAppBricks.mockReturnValueOnce(
    new Promise<never[]>((resolve) => {
      release = (): void => resolve([]);
    }),
  );
  return () => release();
};

describe('appDetail.logic add custom brick', () => {
  it('opens the brick tab only once the brick list has the new brick', async () => {
    vi.mocked(
      (
        await import(
          '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
        )
      ).addAppCustomBrick,
    ).mockResolvedValue({ id: 'new_brick_id' });
    const { addAppCustomBrick } = await renderHandlers();
    const listRequests = h.getAppBricks.mock.calls.length;
    const releaseBrickList = holdNextBrickList();

    const adding = addAppCustomBrick('app-1', { name: 'New Brick Id' });
    await waitFor(() =>
      expect(h.getAppBricks).toHaveBeenCalledTimes(listRequests + 1),
    );
    expect(h.editorFiles.selectFile).not.toHaveBeenCalled();

    releaseBrickList();
    await adding;
    expect(h.editorFiles.selectFile).toHaveBeenCalledWith({
      fileId: 'new_brick_id',
    });
  });
});

describe('appDetail.logic rename custom brick', () => {
  const mockRename = async (result: string | null): Promise<void> => {
    vi.mocked(
      (
        await import(
          '@cloud-editor-mono/domain/src/services/services-by-app/app-lab'
        )
      ).renameAppCustomBrick,
    ).mockResolvedValue(result);
  };

  it('renames the brick tab only once the brick list has the new id', async () => {
    await mockRename('new_brick_id');
    const { renameAppCustomBrick } = await renderHandlers();
    const listRequests = h.getAppBricks.mock.calls.length;
    const releaseBrickList = holdNextBrickList();

    const renaming = renameAppCustomBrick('old_brick_id', {
      name: 'New Brick Id',
    });
    await waitFor(() =>
      expect(h.getAppBricks).toHaveBeenCalledTimes(listRequests + 1),
    );
    expect(h.fileOperations.renameFile).toHaveBeenCalled();
    expect(h.editorFiles.updateOpenFile).not.toHaveBeenCalled();

    releaseBrickList();
    await renaming;
    expect(h.editorFiles.updateOpenFile).toHaveBeenCalledWith(
      'old_brick_id',
      'new_brick_id',
    );
  });

  it('renames the brick folder by its path and the brick tab by its id', async () => {
    await mockRename('new_brick_id');
    const { renameAppCustomBrick } = await renderHandlers();

    await renameAppCustomBrick('old_brick_id', { name: 'New Brick Id' });

    expect(h.fileOperations.renameFile).toHaveBeenCalledWith(
      'bricks/old_brick_id',
      'bricks/new_brick_id',
      { nodeType: 'folder', source: 'stream' },
    );
    expect(h.editorFiles.updateOpenFile).toHaveBeenCalledWith(
      'old_brick_id',
      'new_brick_id',
    );
    expect(h.appFiles.invalidateDirs).not.toHaveBeenCalled();
  });

  it('renames nothing when the rename fails', async () => {
    await mockRename(null);
    const { renameAppCustomBrick } = await renderHandlers();

    await renameAppCustomBrick('old_brick_id', { name: 'New Brick Id' });

    expect(h.fileOperations.renameFile).not.toHaveBeenCalled();
    expect(h.editorFiles.updateOpenFile).not.toHaveBeenCalled();
    expect(errorNotifications()).toHaveLength(1);
  });
});

// ⌘L lives here rather than in EditorPanel: the shortcut is window-wide, and main keeps this route
// mounted (hidden) in Agent Mode, where a listener of its own toggled an invisible panel and ate the key.
describe('appDetail.logic agent panel shortcut', () => {
  const renderLogic = async (
    section: AppsSection = 'my-apps',
  ): Promise<{ current: ReturnType<typeof useAppDetailLogic> }> => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useAppDetailLogic('app-1', section), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(result.current.app).toBeDefined());
    return result;
  };

  const pressCmdL = (): void => {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'l', metaKey: true }),
      );
    });
  };

  it('toggles the panel from the editor', async () => {
    const result = await renderLogic();
    expect(result.current.agentPanelVisible).toBe(false);

    pressCmdL();
    expect(result.current.agentPanelVisible).toBe(true);

    pressCmdL();
    expect(result.current.agentPanelVisible).toBe(false);
  });

  it('leaves the key alone while Agent Mode is on screen', async () => {
    agentModeActive = true;
    const result = await renderLogic();

    pressCmdL();

    expect(result.current.agentPanelVisible).toBe(false);
  });

  // Read-only example apps can't run the agent, so there is no panel for ⌘L to open.
  it('leaves the key alone on a read-only example app', async () => {
    const result = await renderLogic('examples');

    pressCmdL();

    expect(result.current.agentPanelVisible).toBe(false);
  });
});

describe('appDetail.logic updateAppBricks', () => {
  type UpdateAppBricks = (
    bricks: Record<string, { variables: Record<string, string> }>,
  ) => Promise<boolean>;

  // The daemon can lose a value when two PATCHes to the same app overlap.
  it('sends the next brick PATCH only after the previous one resolves', async () => {
    await renderHandlers();
    const updateAppBricks = h.runtimeArgs[5] as UpdateAppBricks;

    let resolveFirst: (ok: boolean) => void = () => undefined;
    h.updateAppBrick
      .mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(true);

    let done = false;
    const pending = updateAppBricks({
      'arduino:telegram_bot': { variables: { TELEGRAM_BOT_TOKEN: 't' } },
      'arduino:object_detection': { variables: {} },
    }).then((ok) => {
      done = true;
      return ok;
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(h.updateAppBrick).toHaveBeenCalledTimes(1);
    expect(h.updateAppBrick).toHaveBeenLastCalledWith(
      'app-1',
      'arduino:telegram_bot',
      { variables: { TELEGRAM_BOT_TOKEN: 't' } },
    );
    expect(done).toBe(false);

    resolveFirst(true);
    await expect(pending).resolves.toBe(true);
    expect(h.updateAppBrick).toHaveBeenCalledTimes(2);
    expect(h.updateAppBrick).toHaveBeenLastCalledWith(
      'app-1',
      'arduino:object_detection',
      { variables: {} },
    );
  });
});

describe('appDetail.logic updateApp', () => {
  type UpdateApp = (request: { default?: boolean }) => Promise<boolean>;

  // The My Apps list sections and the status list behind this toggle are other queries under the same prefix.
  it('refreshes every app list query after a "Run at startup" change', async () => {
    await renderHandlers();
    const updateApp = h.runtimeArgs[4] as UpdateApp;
    h.updateAppDetail.mockResolvedValue(APP.id);
    h.getAppDetail.mockClear();

    await act(async () => {
      await expect(updateApp({ default: true })).resolves.toBe(true);
    });

    expect(h.updateAppDetail).toHaveBeenCalledWith(APP.id, { default: true });
    expect(h.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [BoardScopedQuery.LIST_MY_APPS],
    });
    // The prefix invalidate already refetches this detail; a second fetch would be cancelled.
    expect(h.getAppDetail).not.toHaveBeenCalled();
  });
});
