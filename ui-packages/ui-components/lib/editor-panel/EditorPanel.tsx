import clsx from 'clsx';
import { debounce } from 'lodash-es';
import { memo, Suspense, useCallback, useEffect, useMemo } from 'react';
import type { Layout } from 'react-resizable-panels';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { CodeEditor, EditorBannerKind } from '../code-editor';
import { KeywordMap } from '../code-mirror';
import {
  linkSplitEditors,
  unlinkSplitEditors,
  ViewInstances,
} from '../code-mirror/codeMirrorViewInstances';
import {
  BrickDetail,
  MarkdownReader,
} from '../components-by-app/app-lab/editor-panel/lazyViews';
// A static import: linkSplitEditors copies the document only into an editor
// that is already mounted, so this panel must mount together with the panel.
import SplitEditorPanel from '../components-by-app/app-lab/editor-panel/SplitEditorPanel';
import EditorControls from '../editor-controls/EditorControls';
import EditorImage from '../editor-image/EditorImage';
import { EditorStatus } from '../editor-status';
import {
  BRICK_FILE_EXTENSION,
  EditorTabsBar,
  SUPPORTED_IMAGE_TYPES,
} from '../editor-tabs-bar';
import EditorToolbar from '../editor-toolbar/EditorToolbar';
import { useI18n } from '../i18n/useI18n';
import { SecretsEditor } from '../secrets-editor';
import styles from './editor-panel.module.scss';
import { EditorPanelLogic } from './editorPanel.type';
import { editorsNotification } from './EditorPanelSpec';
import EditorSplitDropZone from './EditorSplitDropZone';
import { messages } from './messages';

interface EditorPanelProps {
  editorPanelLogic: EditorPanelLogic;
  getKeywords: () => KeywordMap | undefined;
  renderBanner?: (kind: EditorBannerKind) => JSX.Element | undefined;
  onCopyCode?: () => void;
  onFileError?: (error: Error) => void;
  classes?: {
    container?: string;
    tabsBar?: string;
    selectedTab?: string;
    tab?: string;
    editorImage?: string;
    editorCode?: string;
  };
}

const EditorPanel: React.FC<EditorPanelProps> = (props: EditorPanelProps) => {
  const {
    editorPanelLogic,
    classes,
    getKeywords,
    renderBanner,
    onCopyCode,
    onFileError,
  } = props;
  const { formatMessage } = useI18n();
  const {
    brickDetailLogic,
    codeEditorLogic,
    secretsEditorLogic,
    tabsBarLogic,
    selectedFile,
    isFullscreen,
    codeIsFormatting,
    isConcurrent,
    hideTabs,
    isSnippet,
    openExternalLink,
    shouldRenderMarkdown,
    setShouldRenderMarkdown,
    markdownCanBeRendered,
    canSwitchMarkdownMode,
    readOnly,
    isSplit = false,
    openOrPushToSplit,
    splitToOtherPanel,
    moveTabToOtherPanel,
    setActiveEditorPanel,
    panelATabsCount,
    splitPanelCodeEditorLogic,
    splitPanelTabsBarLogic,
    splitPanelFileId,
    splitPanelFile,
    splitPanelShouldRenderMarkdown,
    splitPanelSetShouldRenderMarkdown,
    splitPanelCanSwitchMarkdownMode,
    splitPanelBrickDetailLogic,
    splitPanelBrickSelectedTab,
    splitPanelSetBrickSelectedTab,
    brickSelectedTab,
    setBrickSelectedTab,
    storedSplitProportionLeft: rawStoredSplitProportionLeft,
    onSplitResize,
    onToggleAgentPanel,
    agentPanelOpen,
    ...rest
  } = editorPanelLogic();

  // Reject out-of-range persisted values (e.g. a `100` left over from a
  // prior bug that wrote single-panel layouts into the split key).
  const storedSplitProportionLeft =
    typeof rawStoredSplitProportionLeft === 'number' &&
    rawStoredSplitProportionLeft >= 10 &&
    rawStoredSplitProportionLeft <= 90
      ? rawStoredSplitProportionLeft
      : undefined;

  // Debounce panel-resize callbacks. `react-resizable-panels` fires
  // `onLayout` on every drag frame, so we throttle the persistence write
  // until the user pauses.
  const debouncedSplitResize = useMemo(
    () =>
      onSplitResize
        ? debounce((leftPanelPercent: number) => {
            onSplitResize(leftPanelPercent);
          }, 250)
        : undefined,
    [onSplitResize],
  );
  useEffect(() => () => debouncedSplitResize?.cancel(), [debouncedSplitResize]);
  const handlePanelLayout = useCallback(
    (layout: Layout) => {
      if (!debouncedSplitResize) return;
      // Only persist while both panels exist — when collapsed to single,
      // `split-left` reports 100 and would overwrite the saved split ratio.
      if (!isSplit) return;
      const left = layout['split-left'];
      if (typeof left !== 'number') return;
      debouncedSplitResize(left);
    },
    [debouncedSplitResize, isSplit],
  );

  const handleDropToSplit = useCallback(
    (fileId: string, fromPanel: 'A' | 'B') => {
      moveTabToOtherPanel && moveTabToOtherPanel(fileId, fromPanel);
    },
    [moveTabToOtherPanel],
  );

  const handleSplitToggleClick = useCallback(() => {
    openOrPushToSplit?.();
  }, [openOrPushToSplit]);

  const handleSplitToggleClickFromB = useCallback(() => {
    if (!splitToOtherPanel) return;
    splitToOtherPanel(splitPanelFileId, 'B');
  }, [splitToOtherPanel, splitPanelFileId]);

  const agentPanelToggle = onToggleAgentPanel
    ? {
        label: formatMessage(messages.agentPanelButton),
        isOpen: agentPanelOpen,
        onToggle: onToggleAgentPanel,
      }
    : undefined;

  // Top-level tabs bar is only shown for the secrets view. Image, brick,
  // and markdown files use the per-panel tabs bar inside the split layout
  // so each panel stays independently navigable.
  const isNonCodeFile = !!selectedFile && selectedFile.ext === 'secrets';

  // Manage the real-time sync link between the two CodeMirror instances.
  // Link only when both panels show the same file AND both are rendering the
  // CodeEditor (i.e. neither is showing MarkdownReader/EditorImage/
  // BrickDetail). Re-evaluating on render-mode toggles ensures Editor2 is
  // re-linked when it (re)mounts.
  const leftIsImage =
    !!selectedFile && SUPPORTED_IMAGE_TYPES.includes(`.${selectedFile.ext}`);
  const rightIsImage =
    !!splitPanelFile &&
    SUPPORTED_IMAGE_TYPES.includes(`.${splitPanelFile.ext}`);
  const leftIsBrick =
    !!selectedFile &&
    selectedFile.ext === BRICK_FILE_EXTENSION &&
    !!brickDetailLogic;
  const rightIsBrick =
    !!splitPanelFile &&
    splitPanelFile.ext === BRICK_FILE_EXTENSION &&
    !!splitPanelBrickDetailLogic;
  const leftShowsCodeEditor =
    !leftIsImage &&
    !leftIsBrick &&
    (selectedFile?.ext !== 'md' || !shouldRenderMarkdown);
  const rightShowsCodeEditor =
    !rightIsImage &&
    !rightIsBrick &&
    (splitPanelFile?.ext !== 'md' || !splitPanelShouldRenderMarkdown);
  useEffect(() => {
    if (!isSplit) {
      unlinkSplitEditors();
      return;
    }
    if (
      selectedFile?.id &&
      selectedFile.id === splitPanelFileId &&
      leftShowsCodeEditor &&
      rightShowsCodeEditor
    ) {
      linkSplitEditors(ViewInstances.Editor);
    } else {
      unlinkSplitEditors();
    }
    return () => {
      unlinkSplitEditors();
    };
  }, [
    isSplit,
    selectedFile?.id,
    splitPanelFileId,
    leftShowsCodeEditor,
    rightShowsCodeEditor,
  ]);

  const renderContent = (): JSX.Element => {
    if (selectedFile && selectedFile.ext === 'secrets') {
      return (
        <SecretsEditor secretsEditorLogic={secretsEditorLogic}></SecretsEditor>
      );
    }

    return (
      <div className={styles['split-group-wrapper']}>
        <Group
          // Remount the panel group on two transitions:
          //   1. Hydration arrives (`storedSplitProportionLeft` goes from
          //      `undefined` → number) so the seeded `defaultSize` is
          //      consumed at mount time.
          //   2. The user toggles `isSplit`. `react-resizable-panels`
          //      doesn't redistribute defaults for Panels added into an
          //      already-mounted Group, so a fresh mount is the only way
          //      to give the newly-shown right Panel its 50% (or stored)
          //      width on first open.
          // Stable tokens — not the raw value — so user-driven resizes
          // write back through `onLayoutChanged` without triggering a
          // remount on every drag frame.
          key={`${isSplit ? 'split' : 'single'}-${
            storedSplitProportionLeft !== undefined ? 'hydrated' : 'pending'
          }`}
          orientation="horizontal"
          className={styles['split-group']}
          onLayoutChanged={handlePanelLayout}
        >
          <Panel
            id="split-left"
            className={styles['code-panel']}
            minSize={200}
            defaultSize={`${storedSplitProportionLeft ?? 50}%`}
            groupResizeBehavior="preserve-pixel-size"
          >
            <div
              className={styles['code-panel-content']}
              onMouseDownCapture={
                isSplit ? (): void => setActiveEditorPanel?.('A') : undefined
              }
              onFocusCapture={
                isSplit ? (): void => setActiveEditorPanel?.('A') : undefined
              }
            >
              {!hideTabs && (
                <EditorTabsBar
                  tabsBarLogic={tabsBarLogic}
                  panelId="A"
                  classes={{
                    container: classes?.tabsBar,
                    selected: classes?.selectedTab,
                    tab: classes?.tab,
                  }}
                  splitToggle={
                    openOrPushToSplit && !isSplit
                      ? {
                          label: formatMessage(messages.splitViewButton),
                          onToggle: handleSplitToggleClick,
                        }
                      : undefined
                  }
                  agentPanel={isSplit ? undefined : agentPanelToggle}
                />
              )}
              {selectedFile?.ext === 'md' && markdownCanBeRendered && (
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
              {leftIsImage && selectedFile ? (
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
              ) : leftIsBrick && selectedFile && brickDetailLogic ? (
                <div className={styles['brick-container']}>
                  <Suspense fallback={null}>
                    <BrickDetail
                      brickId={selectedFile.id}
                      brickDetailLogic={brickDetailLogic}
                      selectedTab={brickSelectedTab}
                      onSelectedTabChange={setBrickSelectedTab}
                    />
                  </Suspense>
                </div>
              ) : selectedFile?.ext === 'md' && shouldRenderMarkdown ? (
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
                  classes={{
                    container: clsx(classes?.editorCode, {
                      [styles['code-editor--snippet']]: isSnippet,
                    }),
                  }}
                  codeEditorLogic={codeEditorLogic}
                  getKeywords={getKeywords}
                  renderBanner={renderBanner}
                  viewInstanceId={ViewInstances.Editor}
                  onFileError={onFileError}
                />
              )}
            </div>
          </Panel>
          {isSplit && splitPanelCodeEditorLogic && splitPanelTabsBarLogic && (
            <>
              <Separator className={styles['split-separator']} />
              <Panel
                id="split-right"
                className={styles['code-panel']}
                minSize={200}
                defaultSize={`${
                  storedSplitProportionLeft !== undefined
                    ? 100 - storedSplitProportionLeft
                    : 50
                }%`}
                groupResizeBehavior="preserve-pixel-size"
              >
                <SplitEditorPanel
                  codeEditorLogic={splitPanelCodeEditorLogic}
                  tabsBarLogic={splitPanelTabsBarLogic}
                  getKeywords={getKeywords}
                  renderBanner={renderBanner}
                  selectedFile={splitPanelFile}
                  onActivate={(): void => setActiveEditorPanel?.('B')}
                  shouldRenderMarkdown={splitPanelShouldRenderMarkdown}
                  setShouldRenderMarkdown={splitPanelSetShouldRenderMarkdown}
                  canSwitchMarkdownMode={splitPanelCanSwitchMarkdownMode}
                  brickDetailLogic={splitPanelBrickDetailLogic}
                  brickSelectedTab={splitPanelBrickSelectedTab}
                  onBrickSelectedTabChange={splitPanelSetBrickSelectedTab}
                  openExternalLink={openExternalLink}
                  onCopyCode={onCopyCode}
                  readOnly={readOnly}
                  onFileError={onFileError}
                  onSplitClick={
                    splitToOtherPanel ? handleSplitToggleClickFromB : undefined
                  }
                  agentPanel={agentPanelToggle}
                  classes={{
                    tabsBar: classes?.tabsBar,
                    selectedTab: classes?.selectedTab,
                    tab: classes?.tab,
                    editorCode: classes?.editorCode,
                    editorImage: classes?.editorImage,
                  }}
                />
              </Panel>
            </>
          )}
        </Group>
        {moveTabToOtherPanel && (
          <EditorSplitDropZone
            isSplit={isSplit}
            panelATabsCount={panelATabsCount ?? 0}
            onMove={handleDropToSplit}
          />
        )}
      </div>
    );
  };

  return (
    <EditorStatus
      className={clsx(styles['editor-panel'], classes?.container, {
        [styles['editor-panel--snippet']]: isSnippet,
      })}
      editorStatus={isConcurrent ? editorsNotification : undefined}
    >
      {!hideTabs && isNonCodeFile && (
        <EditorTabsBar
          tabsBarLogic={tabsBarLogic}
          classes={{
            container: classes?.tabsBar,
            selected: classes?.selectedTab,
            tab: classes?.tab,
          }}
        />
      )}
      <div className={styles['editor-content']}>
        {renderContent()}
        {!rest.hideControls && (
          <EditorControls
            handlers={rest.editorControlsHandlers}
            isFullscreen={isFullscreen}
            indenting={codeIsFormatting}
          />
        )}
      </div>
    </EditorStatus>
  );
};

export default memo(EditorPanel);
