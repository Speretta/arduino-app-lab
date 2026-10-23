import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked Wails surface: the drop bridge's dependencies as spies + an event
// registry we can fire by hand, standing in for the real host-file-drop event.
const { app, runtime } = vi.hoisted(() => {
  const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    app: {
      IsLocalDirectory: vi.fn(async () => false),
    },
    runtime: {
      eventHandlers,
      EventsOn: vi.fn(
        (name: string, cb: (...args: unknown[]) => void): (() => void) => {
          eventHandlers[name] = cb;
          return (): void => {
            delete eventHandlers[name];
          };
        },
      ),
      OnFileDrop: vi.fn(),
    },
  };
});

vi.mock('../../wailsjs/go/app/App', () => app);
vi.mock('../../wailsjs/runtime', () => ({
  EventsOn: runtime.EventsOn,
  OnFileDrop: runtime.OnFileDrop,
}));

import * as svc from './arduinoAppFilesService.impl.standalone';

const dropzone = document.createElement('div');
dropzone.setAttribute('data-native-dropzone', 'true');
document.body.appendChild(dropzone);

beforeEach(() => {
  vi.clearAllMocks();
  document.elementFromPoint = vi.fn(() => dropzone);
});

// Drives the captured host-file-drop handler directly, as the real event
// bridge would, rather than going through the DOM/Wails event system.
const fireDrop = async (paths: string[] = ['/tmp/file.txt']): Promise<void> => {
  await runtime.eventHandlers['host-file-drop']?.(0, 0, paths);
};

describe('arduinoAppFilesService.impl — drop handler arbitration', () => {
  it('runs only the most recently subscribed handler while both are present', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = svc.importDroppedResourceToApp(first);
    const unsubSecond = svc.importDroppedResourceToApp(second);

    await fireDrop();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unsubSecond();
    unsubFirst();
  });

  it('falls back to the previous subscriber once the top one unsubscribes', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = svc.importDroppedResourceToApp(first);
    const unsubSecond = svc.importDroppedResourceToApp(second);

    unsubSecond();
    await fireDrop();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    unsubFirst();
  });

  it('removes a non-top subscriber without disturbing the one on top', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = svc.importDroppedResourceToApp(first);
    const unsubSecond = svc.importDroppedResourceToApp(second);

    unsubFirst();
    await fireDrop();

    expect(second).toHaveBeenCalledTimes(1);

    // first is gone for good, not just deprioritised: unsubscribing second
    // now must not reveal it again.
    unsubSecond();
    await fireDrop();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a drop with no subscriber', async () => {
    await fireDrop();

    expect(app.IsLocalDirectory).not.toHaveBeenCalled();
  });
});
