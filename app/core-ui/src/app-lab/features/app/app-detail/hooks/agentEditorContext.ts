import {
  getCodeSubjects,
  getUnsavedFilesSubject,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  AgentEditorContext,
  BRICK_FILE_EXTENSION,
  getPanelEditorView,
  SelectableFileData,
  SUPPORTED_IMAGE_TYPES,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { Subject } from 'rxjs';

import { CodeEditorPanel } from '../../../../../common/hooks/editor';
import { SKETCH_SECRETS_FILE_ID } from '../../../../../common/hooks/files';

// An image tab holds a data URI, and a YAML file may well start with "data:".
const DATA_URI = /^data:[\w.+-]+\/[\w.+-]+;base64,/;

// The host embeds at most 96 KiB of a file; one character past it tells it the file is too large, so no more crosses the bridge.
const MAX_CONTENT = 96 * 1024 + 1;

// Whether the agent can be given the tab's text: not an image, a brick or the secrets editor.
const isTextTab = (tab: SelectableFileData): boolean => {
  const extension = tab.fileExtension?.toLowerCase() ?? '';
  return (
    extension !== BRICK_FILE_EXTENSION &&
    tab.fileId !== SKETCH_SECRETS_FILE_ID &&
    !SUPPORTED_IMAGE_TYPES.includes(`.${extension}`)
  );
};

const contentOf = (fileId: string): string | undefined => {
  const value = getCodeSubjects().get(fileId)?.getValue().value;
  return typeof value === 'string' && !DATA_URI.test(value) ? value : undefined;
};

const isUnsaved = (fileId: string): boolean => {
  let ids = new Set<string>();
  getUnsavedFilesSubject<Subject<Set<string>>>()
    .subscribe((value) => {
      ids = value;
    })
    .unsubscribe();
  return ids.has(fileId);
};

const readSelection = (
  panel: CodeEditorPanel,
  fileId: string,
  content: string,
): AgentEditorContext['selection'] => {
  const view = getPanelEditorView(panel);
  // Off screen (a markdown preview, a brick, an image) the view still holds its last selection.
  if (!view?.dom.isConnected) {
    return undefined;
  }
  const { state } = view;
  const all = state.selection.ranges.filter((range) => !range.empty);
  // CodeMirror keeps "\n" line breaks whatever the file uses; another text means another file.
  if (!all.length || state.doc.toString() !== content.replace(/\r\n?/g, '\n')) {
    return undefined;
  }
  // A column selection (one range per line, no line skipped) goes whole; scattered ranges would make the line span lie.
  const column = all.every(
    (range, i) =>
      i === 0 ||
      state.doc.lineAt(range.from).number ===
        state.doc.lineAt(all[i - 1].to).number + 1,
  );
  const { main } = state.selection;
  const ranges = column ? all : [main.empty ? all[0] : main];
  const from = ranges[0].from;
  const to = ranges[ranges.length - 1].to;
  const last = state.doc.lineAt(to);
  return {
    path: fileId,
    startLine: state.doc.lineAt(from).number,
    endLine: last.from === to ? last.number - 1 : last.number, // ending where a line starts does not take that line
    text: ranges
      .map((range) => state.sliceDoc(range.from, range.to))
      .join('\n'),
  };
};

// The file in view in the active panel as the editor shows it, and the lines selected in it, for the agent beside the editor.
export const readAgentEditorContext = (
  panel: CodeEditorPanel,
  file: SelectableFileData | undefined,
): AgentEditorContext => {
  const content = file && isTextTab(file) ? contentOf(file.fileId) : undefined;
  if (!file || content === undefined) {
    return {};
  }
  return {
    file: {
      path: file.fileId,
      content: content.slice(0, MAX_CONTENT),
      unsaved: isUnsaved(file.fileId),
    },
    selection: readSelection(panel, file.fileId, content),
  };
};
