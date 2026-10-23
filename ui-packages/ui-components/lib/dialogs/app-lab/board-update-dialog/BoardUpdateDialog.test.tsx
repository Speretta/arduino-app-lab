import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';

// Browser APIs jsdom lacks: the app-lab barrel this dialog imports from also
// pulls in the serial monitor, which constructs a web worker at import time,
// and the modal's scrollable body observes its parent.
vi.hoisted(() => {
  const noop = (): void => undefined;

  globalThis.Worker = class {
    addEventListener = noop;
    postMessage = noop;
    terminate = noop;
  } as unknown as typeof Worker;

  globalThis.ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  } as unknown as typeof ResizeObserver;
});

import styles from './board-update-dialog.module.scss';
import { BoardUpdateDialog } from './BoardUpdateDialog';
import {
  BoardUpdateDialogLogic,
  UpdaterStatus,
} from './BoardUpdateDialog.type';

const baseLogic: ReturnType<BoardUpdateDialogLogic> = {
  open: true,
  isBoard: true,
  status: UpdaterStatus.UpdatingBoard,
  boardUpdates: [{ name: 'arduino-app-lab', toVersion: '1.1.0' }],
  boardLogs: [],
  startUpdate: vi.fn(),
  reloadApp: vi.fn(),
  openFlasherTool: vi.fn(),
  openArduinoSupport: vi.fn(),
  skipUpdate: vi.fn(),
  changeNetwork: vi.fn(),
  bypassSkipUpdate: false,
};

const renderDialog = (
  overrides: Partial<ReturnType<BoardUpdateDialogLogic>> = {},
): ReturnType<typeof render> => {
  const logic: BoardUpdateDialogLogic = () => ({ ...baseLogic, ...overrides });
  return render(
    <IntlProvider locale="en">
      <BoardUpdateDialog logic={logic} />
    </IntlProvider>,
  );
};

const indicator = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>(
    `.${styles['indicator']}`,
  );
  if (!element) throw new Error('progress indicator not rendered');
  return element;
};

describe('BoardUpdateDialog installing strip', () => {
  it.each([0, 44, 100])('shows %i%% and fills the bar to it', (progress) => {
    renderDialog({ boardUpdateProgress: progress });

    expect(screen.getByText('Installing updates...')).toBeInTheDocument();
    expect(screen.getByText(`${progress}%`)).toBeInTheDocument();
    expect(indicator().style.width).toBe(`${progress}%`);
    expect(indicator().parentElement?.className).toContain(
      styles['determinate'],
    );
  });

  it('stays indeterminate and shows no percentage before the first value', () => {
    renderDialog();

    expect(screen.getByText('Installing updates...')).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(indicator().style.width).toBe('');
    expect(indicator().parentElement?.className).not.toContain(
      styles['determinate'],
    );
  });

  it('shows no percentage once the update completed', () => {
    renderDialog({
      status: UpdaterStatus.UpdateComplete,
      boardUpdateProgress: 100,
    });

    expect(screen.getByText('Update complete')).toBeInTheDocument();
    expect(screen.queryByText('100%')).toBeNull();
  });
});
