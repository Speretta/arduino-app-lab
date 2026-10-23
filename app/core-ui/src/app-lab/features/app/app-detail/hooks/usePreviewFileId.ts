import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Observable } from 'rxjs';

export type UsePreviewFileIdReturn = [
  string | undefined,
  (id: string | undefined) => void,
  MutableRefObject<string | undefined>,
];

/**
 * Owns the single "preview tab" id shared by panel A ([useEditorFiles]) and
 * panel B ([appLabEditorPanel]).
 *
 * The one preview tab is rendered italic and replaced in place when another
 * file is previewed. A ref mirrors the state so tab-mutating callbacks can
 * read the latest value without a stale closure. Editing a preview file
 * commits it — so once its id appears in the unsaved set the preview flag is
 * cleared.
 *
 * The unsaved set is read through a subscription: only the rare commit needs
 * a render.
 */
export function usePreviewFileId(
  unsavedFiles$: Observable<Set<string>> | undefined,
): UsePreviewFileIdReturn {
  const [previewFileId, _setPreviewFileId] = useState<string>();
  const previewFileIdRef = useRef<string>();

  const setPreviewFileId = useCallback((id: string | undefined) => {
    _setPreviewFileId(id);
    previewFileIdRef.current = id;
  }, []);

  useEffect(() => {
    if (!unsavedFiles$) return undefined;
    const subscription = unsavedFiles$.subscribe((unsavedFileIds) => {
      const id = previewFileIdRef.current;
      if (id && unsavedFileIds.has(id)) {
        setPreviewFileId(undefined);
      }
    });
    return () => subscription.unsubscribe();
  }, [unsavedFiles$, setPreviewFileId]);

  return [previewFileId, setPreviewFileId, previewFileIdRef];
}
