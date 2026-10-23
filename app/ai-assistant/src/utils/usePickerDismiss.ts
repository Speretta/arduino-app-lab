import { useEffect, useRef } from 'react';

// Close an open picker on outside-click or Escape; shared by every Picker consumer (composer
// pickers, the workspace picker, the agent panel's history menu), which the user reads as one rule.
export const usePickerDismiss = (
  isOpen: boolean,
  containerRef: React.RefObject<HTMLElement>,
  dismiss: () => void,
): void => {
  // Held in a ref so a caller's inline callback doesn't re-bind the listeners on every render.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        dismissRef.current();
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dismissRef.current();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return (): void => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, containerRef]);
};
