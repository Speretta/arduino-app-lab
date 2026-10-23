import { IsUIZoomAvailable, SetUIZoom } from '../../wailsjs/go/app/App';
import { Environment } from '../../wailsjs/runtime/runtime';

// The browser's own steps, so the levels feel like Ctrl + anywhere else.
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const DEFAULT_INDEX = ZOOM_STEPS.indexOf(1);
const STORAGE_KEY = 'al-ui-zoom';

function readStoredIndex(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    const index = ZOOM_STEPS.indexOf(stored);
    return index === -1 ? DEFAULT_INDEX : index;
  } catch {
    return DEFAULT_INDEX;
  }
}

function storeZoom(factor: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(factor));
  } catch {
    // Zoom still applies for this session; it is only not remembered.
  }
}

/**
 * Bind Cmd +, - and 0 on macOS, Ctrl on Linux, to the page zoom of the webview. The zoom itself
 * happens in Go (`internal/uizoom`), on the engine. Nothing is registered where Go cannot set the
 * zoom (Windows, macOS before 11), so the keys still reach the page. Windows zooms with Ctrl +
 * mouse wheel instead.
 */
export async function registerUIZoomShortcuts(): Promise<void> {
  const [available, { platform }] = await Promise.all([
    IsUIZoomAvailable(),
    Environment(),
  ]);
  if (!available) {
    return;
  }
  const isMac = platform === 'darwin';

  let index = readStoredIndex();
  if (index !== DEFAULT_INDEX) {
    void SetUIZoom(ZOOM_STEPS[index]);
  }

  const apply = (next: number): void => {
    index = Math.min(Math.max(next, 0), ZOOM_STEPS.length - 1);
    storeZoom(ZOOM_STEPS[index]);
    void SetUIZoom(ZOOM_STEPS[index]);
  };

  // Capture phase, so a component that handles its own keys (the code editor) never sees these first.
  window.addEventListener(
    'keydown',
    (e) => {
      const modifier = isMac
        ? e.metaKey && !e.ctrlKey
        : e.ctrlKey && !e.metaKey;
      if (!modifier || e.altKey) {
        return;
      }
      // + and - match the character the layout produces. 0 matches its digit-row position,
      // because on AZERTY that key types "à" without Shift.
      if (['+', '='].includes(e.key) || e.code === 'NumpadAdd') {
        apply(index + 1);
      } else if (['-', '_'].includes(e.key) || e.code === 'NumpadSubtract') {
        apply(index - 1);
      } else if (e.key === '0' || ['Digit0', 'Numpad0'].includes(e.code)) {
        apply(DEFAULT_INDEX);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
}
