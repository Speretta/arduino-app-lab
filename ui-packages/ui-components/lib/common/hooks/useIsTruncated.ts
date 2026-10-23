import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface UseIsTruncated<T extends HTMLElement> {
  ref: React.RefObject<T>;
  isTruncated: boolean;
}

// Tracks whether an ellipsized element is actually cut off, so a tooltip can be
// offered only when the full text is not readable.
export const useIsTruncated = <T extends HTMLElement>(
  content?: string,
): UseIsTruncated<T> => {
  const ref = useRef<T>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    setIsTruncated(element.scrollWidth > element.clientWidth + 1);
  }, []);

  useLayoutEffect(() => {
    measure();

    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [measure, content]);

  return { ref, isTruncated };
};
