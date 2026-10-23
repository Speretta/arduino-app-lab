import clsx from 'clsx';
import { memo, Suspense } from 'react';

import {
  CodeEditor,
  CodeEditorLogic,
  EditorBannerKind,
} from '../../../code-editor';
import { KeywordMap } from '../../../code-mirror';
import { ViewInstances } from '../../../code-mirror/codeMirrorViewInstances';
import EditorImage from '../../../editor-image/EditorImage';
import panelStyles from '../../../editor-panel/editor-panel.module.scss';
import { messages as panelMessages } from '../../../editor-panel/messages';
import {
  BRICK_FILE_EXTENSION,
  EditorTabsBar,
  SUPPORTED_IMAGE_TYPES,
  TabsBarLogic,
} from '../../../editor-tabs-bar';
import EditorToolbar from '../../../editor-toolbar/EditorToolbar';
import { useI18n } from '../../../i18n/useI18n';
import { BrickDetailLogic, BrickDetailTabId } from '../brick-detail';
import styles from './app-lab-editor-panel.module.scss';
import { BrickDetail, MarkdownReader } from './lazyViews';

// A control marked data-keeps-active-editor-panel (the agent panel toggle) acts without making this panel the active one.
const activateUnlessKept = (
  e: React.SyntheticEvent,
  onActivate?: VoidFunction,
): void => {
  if (!(e.target as Element).closest('[data-keeps-active-editor-panel]')) {
    onActivate?.();
  }
};

interface SplitEditorPanelProps {
  codeEditorLogic: CodeEditorLogic;
  tabsBarLogic: TabsBarLogic;
  getKeywords: () => KeywordMap | undefined;
  renderBanner?: (kind: EditorBannerKind) => JSX.Element | undefined;
  selectedFile?: { id: string; ext: string; getData: () => string | undefined };
  shouldRenderMarkdown?: boolean;
  setShouldRenderMarkdown?: (value: boolean) => void;
  canSwitchMarkdownMode?: boolean;
  brickDetailLogic?: BrickDetailLogic;
  brickSelectedTab?: BrickDetailTabId;
  onBrickSelectedTabChange?: (value: BrickDetailTabId) => void;
  openExternalLink?: (url: string) => void;
  onCopyCode?: () => void;
  readOnly?: boolean;
  onFileError?: (error: Error) => void;
  /**
   * Called when the user clicks the Split CTA inside panel B. Receiver
   * should mirror the current panel-B selection into panel A (Split
   * sub-feature, fromPanel='B').
   */
  onSplitClick?: () => void;
  /**
   * Called when the user interacts with this panel (pointer-down or focus)
   * so the parent can mark panel B as active and route file-tree clicks
   * here.
   */
  onActivate?: () => void;
  agentPanel?: {
    label: string;
    isOpen?: boolean;
    onToggle: VoidFunction;
  };
  classes?: {
    tabsBar?: string;
    selectedTab?: string;
    tab?: string;
    editorCode?: string;
    editorImage?: string;
  };
}

/**
 * Secondary read/write CodeMirror panel for split view, bound to ViewInstances.Editor2.
 * Has its own independent tabs bar and its own write/preview toggle for markdown files.
 * File navigation in this panel does not affect the left panel.
 */
const SplitEditorPanel: React.FC<SplitEditorPanelProps> = ({
  codeEditorLogic,
  tabsBarLogic,
  getKeywords,
  renderBanner,
  selectedFile,
  shouldRenderMarkdown,
  setShouldRenderMarkdown,
  canSwitchMarkdownMode,
  brickDetailLogic,
  brickSelectedTab,
  onBrickSelectedTabChange,
  openExternalLink,
  onCopyCode,
  readOnly,
  onFileError,
  onSplitClick,
  onActivate,
  agentPanel,
  classes,
}: SplitEditorPanelProps) => {
  const { formatMessage } = useI18n();
  const isImage =
    !!selectedFile && SUPPORTED_IMAGE_TYPES.includes(`.${selectedFile.ext}`);
  const isBrick =
    !!selectedFile &&
    selectedFile.ext === BRICK_FILE_EXTENSION &&
    !!brickDetailLogic;
  const isMarkdownRendered =
    selectedFile?.ext === 'md' && !!shouldRenderMarkdown;

  return (
    <div
      className={clsx(styles['split-panel'], 'split-panel')}
      onMouseDownCapture={(e): void => activateUnlessKept(e, onActivate)}
      onFocusCapture={(e): void => activateUnlessKept(e, onActivate)}
    >
      <EditorTabsBar
        tabsBarLogic={tabsBarLogic}
        panelId="B"
        classes={{
          container: classes?.tabsBar,
          selected: classes?.selectedTab,
          tab: classes?.tab,
        }}
        splitToggle={
          onSplitClick
            ? {
                label: formatMessage(panelMessages.splitViewButton),
                disabled: true,
                onToggle: onSplitClick,
              }
            : undefined
        }
        agentPanel={agentPanel}
      />
      {selectedFile?.ext === 'md' && (
        <EditorToolbar
          type="markdown"
          isRendered={!!shouldRenderMarkdown}
          readOnly={readOnly}
          classes={{
            disabled: !canSwitchMarkdownMode
              ? styles['editor-toolbar-disabled']
              : undefined,
          }}
          onToggleRender={
            canSwitchMarkdownMode ? setShouldRenderMarkdown : undefined
          }
        />
      )}
      {isImage && selectedFile ? (
        <EditorImage
          key={selectedFile.id}
          data={selectedFile.getData()}
          classes={{ container: classes?.editorImage }}
          extension={
            selectedFile.ext === 'svg'
              ? `${selectedFile.ext}+xml`
              : selectedFile.ext
          }
        />
      ) : isBrick && selectedFile && brickDetailLogic ? (
        <div className={panelStyles['brick-container']}>
          <Suspense fallback={null}>
            <BrickDetail
              brickId={selectedFile.id}
              brickDetailLogic={brickDetailLogic}
              selectedTab={brickSelectedTab}
              onSelectedTabChange={onBrickSelectedTabChange}
            />
          </Suspense>
        </div>
      ) : isMarkdownRendered ? (
        <div className={styles['markdown-container']}>
          <Suspense fallback={null}>
            <MarkdownReader
              key={selectedFile.id}
              content={selectedFile.getData()}
              onOpenExternalLink={openExternalLink}
              onCopyCode={onCopyCode}
            />
          </Suspense>
        </div>
      ) : (
        <CodeEditor
          key={selectedFile?.id}
          viewInstanceId={ViewInstances.Editor2}
          codeEditorLogic={codeEditorLogic}
          getKeywords={getKeywords}
          renderBanner={renderBanner}
          classes={{ container: classes?.editorCode }}
          onFileError={onFileError}
        />
      )}
    </div>
  );
};

export default memo(SplitEditorPanel);
