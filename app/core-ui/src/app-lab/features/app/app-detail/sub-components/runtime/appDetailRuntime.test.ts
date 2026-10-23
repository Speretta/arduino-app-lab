/**
 * Which console tab is selected across run -> stop -> run, and how the log
 * stream and the action state follow a stop.
 *
 * The real `useRuntimeLogic` provider is rendered above the hook, so the tabs,
 * the sources and the action state machine are the shipping ones. Only the
 * orchestrator services are stubbed: the stubs keep the handlers each stream was
 * opened with, which is how a test replays a python log line arriving.
 */

import {
  AppBrickListItem,
  AppDetailedInfo,
  BrickCreateUpdateRequest,
  EventSourceHandlers,
  SERVER_CLOSED_ERROR_CODE,
  StreamEventType,
} from '@cloud-editor-mono/infrastructure';
import {
  Action,
  ActionStatus,
  CONSOLE_SOURCE_KEYS,
  ConsoleSourceKey,
  TreeNode,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import {
  act,
  render,
  renderHook,
  RenderHookResult,
} from '@testing-library/react';
import { createElement, FC, PropsWithChildren, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestProviderWrapper from '../../../../../../../tests-setup';
import { sendAppLabNotification } from '../../../../../features/notifications';
import {
  RuntimeContext,
  RuntimeContextValue,
} from '../../../../../providers/runtime/runtimeContext';
import { useRuntimeLogic } from '../../../../../providers/runtime/runtimeContextProvider.logic';
import { useAppDetailRuntimeLogic } from './appDetailRuntime';

const h = vi.hoisted(() => ({
  startAppHandlers: [] as EventSourceHandlers[],
  stopAppHandlers: [] as EventSourceHandlers[],
  appLogsHandlers: [] as EventSourceHandlers[],
  appLogsControllers: [] as (AbortController | undefined)[],
}));

vi.mock(
  '@cloud-editor-mono/domain/src/services/services-by-app/app-lab',
  () => ({
    startApp: vi.fn(async (_id: string, handlers: EventSourceHandlers) => {
      h.startAppHandlers.push(handlers);
    }),
    stopApp: vi.fn(async (_id: string, handlers: EventSourceHandlers) => {
      h.stopAppHandlers.push(handlers);
    }),
    getAppLogs: vi.fn(
      async (
        _id: string,
        handlers: EventSourceHandlers,
        abortController?: AbortController,
      ) => {
        h.appLogsHandlers.push(handlers);
        h.appLogsControllers.push(abortController);
      },
    ),
    getApps: vi.fn(async () => []),
    getAppStatus: vi.fn(async () => undefined),
    getAIModels: vi.fn(async () => []),
    // A websocket, so the caller keeps whatever this resolves with and closes it.
    getSerialMonitorLogs: vi.fn(async () => ({ close: vi.fn() })),
    findPorts: vi.fn(async () => []),
    forwardNonUIPort: vi.fn(async () => undefined),
    openUIWhenReady: vi.fn(async () => undefined),
    onAgentStartedApp: vi.fn(() => () => undefined),
    onAgentModelImport: vi.fn(() => () => undefined),
  }),
);

vi.mock('../../../../../features/notifications', () => ({
  sendAppLabNotification: vi.fn(),
}));

const APP = {
  id: 'app-1',
  name: 'My App',
  status: 'stopped',
} as AppDetailedInfo;

const running = (app: AppDetailedInfo): AppDetailedInfo =>
  ({ ...app, status: 'running' } as AppDetailedInfo);

const folder = (name: string): TreeNode =>
  ({ name, type: 'folder' } as TreeNode);

// Assigned on every render of the holder, so a test can drive the real actions.
let runtime: RuntimeContextValue;

const RuntimeHolder: FC<PropsWithChildren> = ({ children }) => {
  runtime = useRuntimeLogic();
  return createElement(RuntimeContext.Provider, { value: runtime }, children);
};

const wrapper = ({ children }: PropsWithChildren): ReactElement =>
  createElement(
    TestProviderWrapper,
    null,
    createElement(RuntimeHolder, null, children),
  );

type Props = { app: AppDetailedInfo; rootNodes: TreeNode[] };

const renderAppDetailRuntime = (
  props: Props,
): RenderHookResult<ReturnType<typeof useAppDetailRuntimeLogic>, Props> =>
  renderHook(
    ({ app, rootNodes }: Props) => useAppDetailRuntimeLogic(app, [], rootNodes),
    { wrapper, initialProps: props },
  );

const activeTabOf = (appId: string): ConsoleSourceKey | undefined =>
  runtime.consoleState.activeConsoleTab[appId];

const emit = async (
  handlers: EventSourceHandlers,
  event: StreamEventType,
  data: unknown,
): Promise<void> => {
  await act(async () => {
    handlers.onmessage?.({ id: '', event, data: JSON.stringify(data) });
  });
};

// What the orchestrator sends when an action has finished and the stream ends.
const completeStream = async (handlers: EventSourceHandlers): Promise<void> => {
  await emit(handlers, StreamEventType.Progress, { progress: 100 });
  await emit(handlers, StreamEventType.Error, {
    code: SERVER_CLOSED_ERROR_CODE,
  });
};

const emitPythonLog = (handlers: EventSourceHandlers): Promise<void> =>
  emit(handlers, StreamEventType.Message, {
    id: CONSOLE_SOURCE_KEYS.PYTHON,
    message: 'listening on http://127.0.0.1:7000',
  });

const emitStopFailure = (handlers: EventSourceHandlers): Promise<void> =>
  emit(handlers, StreamEventType.Error, {
    code: 'APP_STOP_FAILED',
    message: 'could not stop the app',
  });

const openLogStreams = (): AbortController[] =>
  h.appLogsControllers.filter(
    (controller): controller is AbortController =>
      !!controller && !controller.signal.aborted,
  );

describe('useAppDetailRuntimeLogic console tab selection', () => {
  beforeEach(() => {
    h.startAppHandlers.length = 0;
    h.stopAppHandlers.length = 0;
    h.appLogsHandlers.length = 0;
    h.appLogsControllers.length = 0;
  });

  it('selects the Python tab once the app is running and its log arrives', async () => {
    const { rerender } = renderAppDetailRuntime({
      app: APP,
      rootNodes: [folder('python')],
    });

    await act(async () => {
      await runtime.runtimeActions.runAction(APP);
    });
    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.STARTUP);

    await act(async () => {
      rerender({ app: running(APP), rootNodes: [folder('python')] });
    });
    await emitPythonLog(h.appLogsHandlers[0]);

    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.PYTHON);
  });

  it('selects the Python tab again on a run after a stop', async () => {
    const { rerender } = renderAppDetailRuntime({
      app: APP,
      rootNodes: [folder('python')],
    });

    await act(async () => {
      await runtime.runtimeActions.runAction(APP);
    });
    await act(async () => {
      rerender({ app: running(APP), rootNodes: [folder('python')] });
    });
    await emitPythonLog(h.appLogsHandlers[0]);
    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.PYTHON);

    await act(async () => {
      await runtime.runtimeActions.stopAction(running(APP));
    });
    await completeStream(h.stopAppHandlers[0]);
    await act(async () => {
      rerender({ app: APP, rootNodes: [folder('python')] });
    });

    await act(async () => {
      await runtime.runtimeActions.runAction(APP);
    });
    await act(async () => {
      rerender({ app: running(APP), rootNodes: [folder('python')] });
    });

    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.PYTHON);
  });

  it('moves the console to App launch when the app is stopped', async () => {
    const { rerender } = renderAppDetailRuntime({
      app: APP,
      rootNodes: [folder('python')],
    });

    await act(async () => {
      await runtime.runtimeActions.runAction(APP);
    });
    await act(async () => {
      rerender({ app: running(APP), rootNodes: [folder('python')] });
    });
    await emitPythonLog(h.appLogsHandlers[0]);

    await act(async () => {
      await runtime.runtimeActions.stopAction(running(APP));
    });
    await completeStream(h.stopAppHandlers[0]);
    await act(async () => {
      rerender({ app: APP, rootNodes: [folder('python')] });
    });

    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.STARTUP);
  });

  it('keeps the tab the user picked while the app is running', async () => {
    const { rerender } = renderAppDetailRuntime({
      app: APP,
      rootNodes: [folder('python')],
    });

    await act(async () => {
      await runtime.runtimeActions.runAction(APP);
    });
    await act(async () => {
      rerender({ app: running(APP), rootNodes: [folder('python')] });
    });
    await emitPythonLog(h.appLogsHandlers[0]);

    await act(async () => {
      runtime.consoleState.setActiveConsoleTab(
        APP.id,
        CONSOLE_SOURCE_KEYS.STARTUP,
      );
    });

    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.STARTUP);
  });

  it('leaves a sketch-only app on App launch', async () => {
    const { rerender } = renderAppDetailRuntime({
      app: APP,
      rootNodes: [folder('sketch')],
    });

    await act(async () => {
      await runtime.runtimeActions.runAction(APP);
    });
    await act(async () => {
      rerender({ app: running(APP), rootNodes: [folder('sketch')] });
    });

    expect(runtime.consoleState.consoleTabs[APP.id]).not.toContain(
      CONSOLE_SOURCE_KEYS.PYTHON,
    );
    expect(activeTabOf(APP.id)).toBe(CONSOLE_SOURCE_KEYS.STARTUP);
  });
});

describe('useAppDetailRuntimeLogic stop', () => {
  beforeEach(() => {
    h.startAppHandlers.length = 0;
    h.stopAppHandlers.length = 0;
    h.appLogsHandlers.length = 0;
    h.appLogsControllers.length = 0;
  });

  // The app is already running when its detail page opens, so the action
  // state starts at Idle and the Stop click is its first change.
  const renderRunningApp = async (): Promise<
    RenderHookResult<ReturnType<typeof useAppDetailRuntimeLogic>, Props>
  > => {
    const rendered = renderAppDetailRuntime({
      app: running(APP),
      rootNodes: [folder('python')],
    });
    await emitPythonLog(h.appLogsHandlers[0]);
    return rendered;
  };

  const clickStop = async (
    result: RenderHookResult<
      ReturnType<typeof useAppDetailRuntimeLogic>,
      Props
    >['result'],
  ): Promise<void> => {
    await act(async () => {
      result.current.runtimeActionsLogic().stopApp(APP.id, 'running');
    });
  };

  it('keeps the log stream open while the app is stopping', async () => {
    const { result } = await renderRunningApp();

    await clickStop(result);

    expect(h.appLogsControllers).toHaveLength(1);
    expect(openLogStreams()).toHaveLength(1);
  });

  it('does not open a second log stream when the stop ends before the status changes', async () => {
    const { result } = await renderRunningApp();

    await clickStop(result);
    await completeStream(h.stopAppHandlers[0]);

    expect(h.appLogsControllers).toHaveLength(1);
    expect(openLogStreams()).toHaveLength(1);
  });

  it('closes the log stream and returns to idle once the app has stopped', async () => {
    const { rerender, result } = await renderRunningApp();

    await clickStop(result);
    await completeStream(h.stopAppHandlers[0]);
    await act(async () => {
      rerender({ app: APP, rootNodes: [folder('python')] });
    });

    expect(openLogStreams()).toHaveLength(0);
    expect(runtime.runtimeActions.currentAction).toBeNull();
    expect(runtime.runtimeActions.currentActionStatus).toBe(ActionStatus.Idle);
  });

  // Leaving the page aborts the streams; the runtime provider above it keeps
  // the pending stop. Only the page under that one provider is remounted.
  it('does not reopen the log stream when the page is opened again during a stop', async () => {
    let detail: ReturnType<typeof useAppDetailRuntimeLogic> | undefined;
    const Detail: FC = () => {
      detail = useAppDetailRuntimeLogic(running(APP), [], [folder('python')]);
      return null;
    };
    const page = (open: boolean): ReactElement =>
      createElement(
        TestProviderWrapper,
        null,
        createElement(RuntimeHolder, null, open ? createElement(Detail) : null),
      );

    const { rerender } = render(page(true));
    await emitPythonLog(h.appLogsHandlers[0]);
    await act(async () => {
      detail?.runtimeActionsLogic().stopApp(APP.id, 'running');
    });

    await act(async () => {
      rerender(page(false));
    });
    expect(openLogStreams()).toHaveLength(0);

    await act(async () => {
      rerender(page(true));
    });

    expect(runtime.runtimeActions.currentAction).toBe(Action.Stop);
    expect(h.appLogsControllers).toHaveLength(1);
  });

  it('keeps a failed stop visible and the log stream open', async () => {
    const { result } = await renderRunningApp();

    await clickStop(result);
    await emitStopFailure(h.stopAppHandlers[0]);

    expect(runtime.runtimeActions.currentAction).toBe(Action.Stop);
    expect(runtime.runtimeActions.currentActionStatus).toBe(
      ActionStatus.Errored,
    );
    expect(h.appLogsControllers).toHaveLength(1);
    expect(openLogStreams()).toHaveLength(1);
  });
});

describe('useAppDetailRuntimeLogic brick configuration on Run', () => {
  beforeEach(() => {
    h.startAppHandlers.length = 0;
  });

  const bricksWithValue = (value: string): AppBrickListItem[] =>
    [
      {
        id: 'arduino:some_brick',
        config_variables: [{ name: 'API_KEY', required: true, value }],
      },
    ] as AppBrickListItem[];

  type BricksProps = { appBricks: AppBrickListItem[] };

  const renderWithBricks = (
    appBricks: AppBrickListItem[],
    updateAppBricks?: (
      bricks: Record<string, BrickCreateUpdateRequest>,
    ) => Promise<boolean>,
  ): RenderHookResult<
    ReturnType<typeof useAppDetailRuntimeLogic>,
    BricksProps
  > =>
    renderHook(
      ({ appBricks }: BricksProps) =>
        useAppDetailRuntimeLogic(
          APP,
          appBricks,
          [folder('python')],
          undefined,
          undefined,
          updateAppBricks,
        ),
      { wrapper, initialProps: { appBricks } },
    );

  it('starts the app after Save and run', async () => {
    // The real save refetches the bricks, so the hook renders with the saved
    // values before the save resolves.
    let rerenderHook: (props: BricksProps) => void = () => undefined;
    const updateAppBricks = vi.fn(async () => {
      await act(async () => {
        rerenderHook({ appBricks: bricksWithValue('secret') });
      });
      return true;
    });
    const { result, rerender } = renderWithBricks(
      bricksWithValue(''),
      updateAppBricks,
    );
    rerenderHook = rerender;

    await act(async () => {
      result.current.runtimeActionsLogic().runApp(APP.id);
    });
    expect(result.current.configureAppBricksDialogLogic().open).toBe(true);

    // Same order as ConfigureAppBricksDialog: confirm, then close on success.
    const { confirmAction, onOpenChange } =
      result.current.configureAppBricksDialogLogic();
    await act(async () => {
      await confirmAction({
        'arduino:some_brick': { variables: { API_KEY: 'secret' } },
      });
      onOpenChange(false);
    });

    expect(updateAppBricks).toHaveBeenCalledTimes(1);
    expect(h.startAppHandlers).toHaveLength(1);
    expect(result.current.configureAppBricksDialogLogic().open).toBe(false);
  });

  it('starts the app when the required value was saved before Run', async () => {
    const { result } = renderWithBricks(bricksWithValue('secret'));

    await act(async () => {
      result.current.runtimeActionsLogic().runApp(APP.id);
    });

    expect(h.startAppHandlers).toHaveLength(1);
    expect(result.current.configureAppBricksDialogLogic().open).toBe(false);
  });

  it('opens the dialog and does not start the app while a required value is empty', async () => {
    const { result } = renderWithBricks(bricksWithValue(''));

    await act(async () => {
      result.current.runtimeActionsLogic().runApp(APP.id);
    });

    expect(h.startAppHandlers).toHaveLength(0);
    expect(result.current.configureAppBricksDialogLogic().open).toBe(true);
  });
});

describe('useAppDetailRuntimeLogic default App', () => {
  beforeEach(() => {
    vi.mocked(sendAppLabNotification).mockClear();
  });

  const renderWithUpdate = (
    updateApp: () => Promise<boolean>,
  ): RenderHookResult<ReturnType<typeof useAppDetailRuntimeLogic>, unknown> =>
    renderHook(
      () => useAppDetailRuntimeLogic(APP, [], [], undefined, updateApp),
      { wrapper },
    );

  it('shows the Undo snackbar after the App is set as default', async () => {
    const updateApp = vi.fn(async () => true);
    const { result } = renderWithUpdate(updateApp);

    await act(async () => {
      await result.current.setAsDefaultApp(true);
    });

    expect(updateApp).toHaveBeenCalledWith({ default: true });
    expect(sendAppLabNotification).toHaveBeenCalledTimes(1);
    const props = vi.mocked(sendAppLabNotification).mock.calls[0][0];
    expect(props.message).toBe('My App is now your default App');
    expect(props.actions?.map((a) => a.text)).toEqual(['Undo']);
  });

  it('shows no snackbar when the default is turned off', async () => {
    const updateApp = vi.fn(async () => true);
    const { result } = renderWithUpdate(updateApp);

    await act(async () => {
      await result.current.setAsDefaultApp(false);
    });

    expect(updateApp).toHaveBeenCalledWith({ default: false });
    expect(sendAppLabNotification).not.toHaveBeenCalled();
  });

  it('shows no snackbar when the update fails', async () => {
    const { result } = renderWithUpdate(vi.fn(async () => false));

    await act(async () => {
      await result.current.setAsDefaultApp(true);
    });

    expect(sendAppLabNotification).not.toHaveBeenCalled();
  });
});

describe('useAppDetailRuntimeLogic swap dialog', () => {
  const RUNNING = {
    id: 'app-0',
    name: 'Snack Sorter',
    status: 'running',
  } as AppDetailedInfo;

  const renderWithStatus = (
    appsStatus: Partial<RuntimeContextValue['appsStatus']>,
  ): RenderHookResult<ReturnType<typeof useAppDetailRuntimeLogic>, unknown> => {
    const StatusHolder: FC<PropsWithChildren> = ({ children }) => {
      const value = useRuntimeLogic();
      return createElement(
        RuntimeContext.Provider,
        {
          value: {
            ...value,
            appsStatus: { ...value.appsStatus, ...appsStatus },
          },
        },
        children,
      );
    };
    return renderHook(() => useAppDetailRuntimeLogic(APP, [], []), {
      wrapper: ({ children }: PropsWithChildren): ReactElement =>
        createElement(
          TestProviderWrapper,
          null,
          createElement(StatusHolder, null, children),
        ),
    });
  };

  it('names the running App and the App about to run', () => {
    const { result } = renderWithStatus({ runningApp: RUNNING });

    expect(result.current.swapRunningAppDialogLogic()).toMatchObject({
      runningAppName: 'Snack Sorter',
      newAppName: 'My App',
      runningAppIsDefault: false,
    });
  });

  it('says when the running App is the default App', () => {
    const { result } = renderWithStatus({
      runningApp: RUNNING,
      defaultApp: RUNNING,
    });

    expect(result.current.swapRunningAppDialogLogic().runningAppIsDefault).toBe(
      true,
    );
  });

  it('does not call the App about to run the running default', () => {
    const { result } = renderWithStatus({
      runningApp: RUNNING,
      defaultApp: APP,
    });

    expect(result.current.swapRunningAppDialogLogic().runningAppIsDefault).toBe(
      false,
    );
  });
});
