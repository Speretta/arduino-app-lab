import { fireEvent, render, screen } from '@testing-library/react';
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

import styles from './swap-running-app-dialog.module.scss';
import { SwapRunningAppDialog } from './SwapRunningAppDialog';
import { SwapRunningAppDialogLogic } from './swapRunningAppDialog.type';

const renderDialog = (
  overrides: Partial<ReturnType<SwapRunningAppDialogLogic>> = {},
): ReturnType<SwapRunningAppDialogLogic> => {
  const state: ReturnType<SwapRunningAppDialogLogic> = {
    open: true,
    setOpen: vi.fn(),
    runningAppName: 'Snack Sorter',
    newAppName: 'Weather Station',
    runningAppIsDefault: false,
    handleSwap: vi.fn(),
    ...overrides,
  };
  render(
    <IntlProvider locale="en">
      <SwapRunningAppDialog logic={(): typeof state => state} />
    </IntlProvider>,
  );
  return state;
};

const bodyTitle = (): HTMLElement =>
  document.querySelector<HTMLElement>(
    `.${styles['body-title']}`,
  ) as HTMLElement;

const bodyDescription = (): HTMLElement =>
  document.querySelector<HTMLElement>(
    `.${styles['body-description']}`,
  ) as HTMLElement;

describe('SwapRunningAppDialog', () => {
  it('names both Apps in the title and the text', () => {
    renderDialog();

    expect(
      screen.getByRole('heading', { name: 'Swap running App' }),
    ).toBeTruthy();
    expect(bodyTitle().textContent).toBe(
      'Stop Snack Sorter and run Weather Station?',
    );
    expect(bodyDescription().textContent).toBe(
      'Snack Sorter will stop and Weather Station will start.',
    );
  });

  it('wraps each name in its own element so it can be shortened alone', () => {
    renderDialog();

    const titleNames = bodyTitle().querySelectorAll(
      `.${styles['body-title-name']}`,
    );
    expect([...titleNames].map((n) => n.textContent)).toEqual([
      'Snack Sorter',
      'Weather Station',
    ]);
    expect(titleNames[0].getAttribute('title')).toBe('Snack Sorter');

    const bodyNames = bodyDescription().querySelectorAll(
      `.${styles['body-description-name']}`,
    );
    expect([...bodyNames].map((n) => n.textContent)).toEqual([
      'Snack Sorter',
      'Weather Station',
    ]);
  });

  it('adds the default App sentence when the running App is the default', () => {
    renderDialog({ runningAppIsDefault: true });

    expect(bodyDescription().textContent).toBe(
      'Snack Sorter will stop and Weather Station will start. Snack Sorter stays your default App and will run again the next time you power your board.',
    );
  });

  it('swaps on Stop and run and only closes on Cancel', () => {
    const state = renderDialog();

    fireEvent.click(screen.getByText('Cancel'));
    expect(state.setOpen).toHaveBeenCalledWith(false);
    expect(state.handleSwap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Stop and run'));
    expect(state.handleSwap).toHaveBeenCalledTimes(1);
  });
});
