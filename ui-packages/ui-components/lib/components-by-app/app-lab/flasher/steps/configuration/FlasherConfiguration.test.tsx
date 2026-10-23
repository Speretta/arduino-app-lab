import { OSImageRelease } from '@cloud-editor-mono/infrastructure';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it, vi } from 'vitest';

// Browser APIs jsdom lacks: the app-lab barrel this step imports from also
// pulls in the serial monitor, which constructs a web worker at import time.
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

import { FlasherConfiguration } from './FlasherConfiguration';

type Props = Parameters<typeof FlasherConfiguration>[0];

const installed: OSImageRelease = { version_label: '20250101-1' };
const older: OSImageRelease = { id: '1', version_label: '20250201-2' };
const latest: OSImageRelease = {
  id: '2',
  version_label: '20250301-3',
  latest: true,
};
const ENOUGH_SPACE = 11 * 1024 * 1024 * 1024;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderStep = (overrides: Partial<Props> = {}): Props => {
  const props: Props = {
    flashEvent: null,
    loading: false,
    getCurrentImage: vi.fn().mockResolvedValue(installed),
    listAvailableImages: vi.fn().mockResolvedValue([older, latest]),
    getAvailableFreeSpace: vi.fn().mockResolvedValue(ENOUGH_SPACE),
    getUserPartitionPreservationSupported: vi.fn().mockResolvedValue(true),
    preserveDataSupported: true,
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(
    <IntlProvider locale="en">
      <FlasherConfiguration {...props} />
    </IntlProvider>,
  );
  return props;
};

const versionField = (): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="image-version"]',
  );
  if (!input) throw new Error('version field not rendered');
  return input;
};

// Queried by text rather than by role: most calls sit inside a `waitFor`, and
// `getByRole` recomputes the accessible name of every node in this step's tree
// on each poll, which costs about 900ms per wait here and times the test out
// on CI.
const flashButton = (): HTMLButtonElement => {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === 'Start flashing',
  );
  if (!button) throw new Error('flash button not rendered');
  return button;
};

describe('FlasherConfiguration', () => {
  it('offers the latest image and lets the user change it when several are available', async () => {
    const props = renderStep();

    await waitFor(() =>
      expect(versionField().value).toBe('20250301-3 (Latest)'),
    );
    expect(screen.getByText('Change')).toBeTruthy();
    await waitFor(() => expect(flashButton().disabled).toBe(false));

    fireEvent.click(flashButton());
    expect(props.onConfirm).toHaveBeenCalledWith(latest, true);
  });

  it('selects the only image and hides Change when just one is offered', async () => {
    renderStep({
      listAvailableImages: vi.fn().mockResolvedValue([older]),
    });

    await waitFor(() => expect(versionField().value).toBe('20250201-2'));
    expect(screen.queryByText('Change')).toBeNull();
    await waitFor(() => expect(flashButton().disabled).toBe(false));
  });

  it('keeps flashing disabled and shows the installed version when no image is available', async () => {
    const props = renderStep({
      listAvailableImages: vi.fn().mockResolvedValue([]),
    });

    await waitFor(() => expect(versionField().value).toBe('20250101-1'));
    expect(screen.queryByText('Change')).toBeNull();
    expect(flashButton().disabled).toBe(true);

    fireEvent.click(flashButton());
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('keeps flashing disabled when the image list cannot be fetched', async () => {
    renderStep({
      listAvailableImages: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await waitFor(() => expect(versionField().value).toBe('20250101-1'));
    expect(flashButton().disabled).toBe(true);
  });

  it('shows the installed version while the list loads, then the list pick', async () => {
    const list = deferred<OSImageRelease[]>();
    renderStep({
      listAvailableImages: vi.fn().mockReturnValue(list.promise),
    });

    await waitFor(() => expect(versionField().value).toBe('20250101-1'));
    expect(flashButton().disabled).toBe(true);

    await act(async () => {
      list.resolve([older, latest]);
    });
    await waitFor(() =>
      expect(versionField().value).toBe('20250301-3 (Latest)'),
    );
    await waitFor(() => expect(flashButton().disabled).toBe(false));
  });

  it('does not let a late installed-version reply override the list pick', async () => {
    const current = deferred<OSImageRelease>();
    renderStep({
      getCurrentImage: vi.fn().mockReturnValue(current.promise),
    });

    await waitFor(() =>
      expect(versionField().value).toBe('20250301-3 (Latest)'),
    );

    await act(async () => {
      current.resolve(installed);
    });
    expect(versionField().value).toBe('20250301-3 (Latest)');
  });

  it('treats an empty installed version as unknown', async () => {
    const list = deferred<OSImageRelease[]>();
    renderStep({
      getCurrentImage: vi.fn().mockResolvedValue({ version_label: '' }),
      listAvailableImages: vi.fn().mockReturnValue(list.promise),
    });

    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(versionField().value).toBe('');

    await act(async () => {
      list.resolve([]);
    });
    await waitFor(() => expect(flashButton().disabled).toBe(true));
    expect(versionField().value).toBe('');
  });

  it('offers to keep data when the image supports it', async () => {
    const props = renderStep();

    await waitFor(() =>
      expect(props.getUserPartitionPreservationSupported).toHaveBeenCalledWith(
        latest.version_label,
      ),
    );
    expect(screen.getByText('Data option')).toBeTruthy();
    expect(
      screen.getByText(
        'Preserve existing data during the board flashing process',
      ),
    ).toBeTruthy();
  });

  it('warns instead of offering to keep data when the image does not support it', async () => {
    const props = renderStep({
      getUserPartitionPreservationSupported: vi.fn().mockResolvedValue(false),
    });

    await waitFor(() => expect(flashButton().disabled).toBe(false));
    await waitFor(() => expect(screen.queryByText('Data option')).toBeNull());

    fireEvent.click(flashButton());
    expect(props.onConfirm).toHaveBeenCalledWith(latest, false);
  });

  it('hides the data option and skips the support check when the board cannot keep data', async () => {
    const props = renderStep({ preserveDataSupported: false });

    await waitFor(() => expect(flashButton().disabled).toBe(false));
    expect(screen.queryByText('Data option')).toBeNull();
    expect(props.getUserPartitionPreservationSupported).not.toHaveBeenCalled();

    fireEvent.click(flashButton());
    expect(props.onConfirm).toHaveBeenCalledWith(latest, false);
  });
});
