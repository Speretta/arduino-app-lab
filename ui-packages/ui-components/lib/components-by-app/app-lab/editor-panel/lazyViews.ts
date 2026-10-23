import { lazy } from 'react';

// These views bring App Lab dependencies (AI model dialogs, parse5). The
// shared EditorPanel renders them only for a brick file or rendered markdown,
// so they load on first use instead of in Cloud Editor's startup chunk.
export const BrickDetail = lazy(() => import('../brick-detail/BrickDetail'));
export const MarkdownReader = lazy(
  () => import('../markdown-reader/MarkdownReader'),
);
