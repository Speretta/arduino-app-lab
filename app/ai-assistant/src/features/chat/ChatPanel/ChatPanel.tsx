import { ChatAgent, ChevronDown } from '@cloud-editor-mono/images/assets/icons';
import {
  type AgentEditorContext,
  ArduinoLoader,
  TextSize,
  useI18n,
  useTooltip,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { messages } from '../../../messages';
import type { AgentWorkspace } from '../../../services';
import { getAgent } from '../../../services';
import { useAiAssistantStore } from '../../../store';
import {
  type PromptAction,
  AutoScrollProvider,
  Heading,
  Prompt,
  Text,
  Toast,
  WorkspaceChip,
} from '../../../ui';
import { useIsOffline, useStickToBottom } from '../../../utils';
import { ChatInput } from '../ChatInput/ChatInput';
import { ChatInputPicker } from '../ChatInput/ChatInputPicker';
import { Message } from '../Message/Message';
import { PendingChoices } from '../PendingChoices/PendingChoices';
import styles from './chat-panel.module.scss';
import { useChatLogic } from './ChatPanel.logic';

export interface ChatPanelProps {
  // Suppresses the panel's own toolbar/session-name bar for hosts that render the
  // session title in their own header instead (see onSessionTitleChange below).
  hideToolbar?: boolean;
  onSessionTitleChange?: (title: string | undefined) => void;
  workspaces?: AgentWorkspace[];
  // Binds the panel to one app, with no way to leave it; the host names the workspace itself.
  lockedWorkspaceId?: string;
  lockedWorkspaceName?: string;
  // False while the host keeps this panel mounted but hidden, so it yields the stream to the visible one.
  onScreen?: boolean;
  // Renders the docked side panel's presentation — compact greeting, tighter padding — at any
  // width, so widening the panel doesn't turn it into the full-screen Agent Mode view.
  docked?: boolean;
  // The editor beside a docked panel, read at each send: the agent gets it, the thread never shows it.
  getEditorContext?: () => AgentEditorContext;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  hideToolbar,
  onSessionTitleChange,
  workspaces = [],
  lockedWorkspaceId,
  lockedWorkspaceName,
  onScreen = true,
  docked = false,
  getEditorContext,
}) => {
  const { formatMessage } = useI18n();
  const {
    messages: chatMessages,
    isStreaming,
    usedTokens,
    turnStartedAt,
    permission,
    models,
    currentModelId,
    setModel,
    modes,
    currentModeId,
    setMode,
    send,
    stop,
    retry,
    respondPermission,
    respondChoices,
    requestError,
    bootstrapError,
    retryBootstrap,
    newChat,
    sessionTitle,
    isLoadingSession,
    isNewSession,
    currentSessionId,
    openFile,
    fileError,
    dismissFileError,
    sessionActionError,
    dismissSessionActionError,
    workspaceId,
    workspaceName,
    selectWorkspace,
  } = useChatLogic(
    lockedWorkspaceId,
    lockedWorkspaceName,
    onScreen,
    getEditorContext,
  );

  const {
    ref: threadRef,
    atBottom,
    atTop,
    onScroll: updateScrollEdges,
    scrollToBottom,
    pauseAutoScroll,
  } = useStickToBottom();

  const offline = useIsOffline();
  const justConnected = useAiAssistantStore((s) => s.justConnected);
  const setJustConnected = useAiAssistantStore((s) => s.setJustConnected);
  const auth = useAiAssistantStore((s) => s.auth);

  const { props: scrollTooltipProps, renderTooltip: renderScrollTooltip } =
    useTooltip({
      content: formatMessage(messages.chatScrollToBottom),
      timeout: 0,
      renderDelay: 500,
    });

  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  const closeScrollTooltip = scrollTooltipProps.onMouseLeave;
  const connectedAgent = getAgent(
    auth.authenticated ? auth.agentId : undefined,
  );

  // Handed to the thread's collapsible blocks: expanding one stops the thread following its
  // bottom edge, so the content it reveals isn't pushed back out of view by the turn still
  // streaming underneath it.
  const autoScrollControl = useMemo(
    () => ({ pauseAutoScroll }),
    [pauseAutoScroll],
  );

  const workspaceItems = useMemo(
    () =>
      workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        icon: workspace.icon,
        dividerAfter: workspace.id === '',
      })),
    [workspaces],
  );

  // An app the board no longer lists still has to read as itself: the first entry would label a scoped session as the general workspace.
  const selectedWorkspace =
    workspaceItems.find((workspace) => workspace.id === workspaceId) ??
    (workspaceId
      ? { id: workspaceId, name: workspaceName || workspaceId }
      : workspaceItems[0]);

  useEffect(() => {
    if (atBottom) {
      closeScrollTooltip?.();
    }
  }, [atBottom, closeScrollTooltip]);

  useEffect(() => {
    if (!offline) {
      setOfflineDismissed(false);
    }
  }, [offline]);

  useEffect(() => {
    onSessionTitleChange?.(sessionTitle);
  }, [sessionTitle, onSessionTitleChange]);

  return (
    <div
      className={clsx(
        styles['chat'],
        docked && styles['chat--docked'],
        isNewSession && styles['chat--empty'],
      )}
    >
      {!hideToolbar && (
        <div className={styles['toolbar']}>
          {sessionTitle && (
            <>
              <Heading className={styles['session-name']}>
                {sessionTitle}
              </Heading>
              {selectedWorkspace && (
                <WorkspaceChip name={selectedWorkspace.name} />
              )}
            </>
          )}
        </div>
      )}

      <div
        className={styles['thread-shadow']}
        style={{ opacity: atTop ? 0 : 1 }}
        aria-hidden="true"
        data-testid="chat-thread-shadow"
      />

      {/* Bottom-anchored scroller: messages are its direct children, newest first, so the
          browser keeps the newest one against the bottom edge as content and layout change. */}
      <AutoScrollProvider value={autoScrollControl}>
        <div
          className={styles['thread']}
          data-testid="chat-thread"
          ref={threadRef}
          onScroll={(e): void => updateScrollEdges(e.currentTarget)}
        >
          {chatMessages.length === 0 ? (
            isLoadingSession ? (
              <div className={styles['loading-state']}>
                <ArduinoLoader className={styles['loading-loader']} />
                <Text
                  size={TextSize.XXSmall}
                  className={styles['loading-caption']}
                >
                  {formatMessage(messages.chatLoadingSession)}
                </Text>
              </div>
            ) : (
              <div className={styles['empty-state']}>
                {docked ? (
                  <>
                    <ChatAgent
                      className={styles['empty-state-icon']}
                      aria-hidden="true"
                    />
                    <Heading className={styles['empty-state-title--compact']}>
                      {formatMessage(messages.chatEmptyTitleCompact)}
                    </Heading>
                  </>
                ) : (
                  <Heading className={styles['empty-state-title']}>
                    {formatMessage(messages.chatEmptyTitle)}
                  </Heading>
                )}
              </div>
            )
          ) : (
            chatMessages
              .map((message, i) => {
                const isStreamingMsg =
                  isStreaming && i === chatMessages.length - 1;
                return (
                  <div key={message.id} className={styles['thread-row']}>
                    <Message
                      message={message}
                      streaming={isStreamingMsg}
                      tokens={isStreamingMsg ? usedTokens : undefined}
                      turnStartedAt={isStreamingMsg ? turnStartedAt : undefined}
                      onOpenFile={openFile}
                    />
                  </div>
                );
              })
              // The reversed scroller paints the first child at the bottom, so hand it the
              // newest message first. Reversing the rendered rows keeps the message order
              // (and the "last one is streaming" check above) reading forwards.
              .reverse()
          )}
        </div>
      </AutoScrollProvider>

      <div className={styles['composer']}>
        <div
          className={styles['thread-fade']}
          style={{ opacity: atBottom ? 0 : 1 }}
          aria-hidden="true"
        />
        {permission && (
          <div className={styles['permission']}>
            <Prompt
              state="permission"
              title={formatMessage(
                permission.planApproval
                  ? messages.planTitle
                  : messages.permDescription,
              )}
              description={
                permission.planApproval
                  ? formatMessage(messages.planDescription)
                  : undefined
              }
              actions={permission.actions.map(
                (action): PromptAction => ({
                  id: action.id,
                  label: action.label ?? formatMessage(action.labelMessage),
                  role: action.role,
                  onClick: (): void =>
                    respondPermission({ optionId: action.id }),
                }),
              )}
            >
              {permission.command && (
                <div className={styles['permission-tool']}>
                  <Text
                    size={TextSize.XXSmall}
                    className={styles['permission-tool-title']}
                  >
                    {permission.command}
                  </Text>
                  {permission.outsideWorkspace && (
                    <span className={styles['permission-outside']}>
                      {formatMessage(messages.permOutsideWorkspace)}
                    </span>
                  )}
                </div>
              )}
              {permission.reason && (
                <Text className={styles['permission-reason']}>
                  {permission.reason}
                </Text>
              )}
            </Prompt>
          </div>
        )}
        {bootstrapError && (
          <div className={styles['request-error']}>
            <Prompt
              state="error"
              title={formatMessage(messages.chatSessionFailedTitle)}
              description={bootstrapError}
              actions={[
                {
                  id: 'new',
                  label: formatMessage(messages.chatSessionFailedNewChat),
                  role: 'secondary',
                  onClick: newChat,
                },
                {
                  id: 'retry',
                  label: formatMessage(messages.chatSessionFailedRetry),
                  role: 'primary',
                  onClick: retryBootstrap,
                },
              ]}
            />
          </div>
        )}
        {requestError && (
          <div className={styles['request-error']}>
            <Prompt
              state="error"
              title="Request failed"
              description={
                requestError.kind === 'network'
                  ? formatMessage(messages.offlineRequestError)
                  : requestError.message
              }
              actions={[
                {
                  id: 'retry',
                  label: 'Retry',
                  role: 'primary',
                  onClick: (): void => void retry(requestError.messageId),
                },
              ]}
            />
          </div>
        )}
        <PendingChoices
          className={styles['choices']}
          onChoicesReply={respondChoices}
        />
        {!atBottom && (
          <div className={styles['scroll-to-bottom']} {...scrollTooltipProps}>
            <button
              type="button"
              className={styles['scroll-to-bottom-button']}
              onClick={scrollToBottom}
              aria-label={formatMessage(messages.chatScrollToBottom)}
            >
              <ChevronDown aria-hidden="true" />
            </button>
            {renderScrollTooltip()}
          </div>
        )}
        {/* Only on an empty chat, a board with no apps of its own included: a session's workspace is fixed when
            it is created, so a started conversation has nothing to pick. From then on the toolbar chip names it. */}
        {lockedWorkspaceId === undefined && isNewSession && selectedWorkspace && (
          <div className={styles['workspace-row']}>
            <div className={styles['workspace-row-inner']}>
              <Text size={TextSize.XXSmall}>
                {formatMessage(messages.workspacePickerPrefix)}
              </Text>
              <ChatInputPicker
                items={workspaceItems}
                selected={selectedWorkspace}
                align="left"
                direction="down"
                label={formatMessage(messages.workspacePicker)}
                isOpen={workspacePickerOpen}
                onToggle={(): void => setWorkspacePickerOpen((open) => !open)}
                onClose={(): void => setWorkspacePickerOpen(false)}
                onSelect={(id): void => {
                  selectWorkspace(
                    id,
                    workspaceItems.find((w) => w.id === id)?.name,
                  );
                  setWorkspacePickerOpen(false);
                }}
                classes={{
                  trigger: styles['workspace-picker-trigger'],
                  value: styles['workspace-picker-value'],
                  icon: styles['workspace-picker-icon'],
                }}
              />
            </div>
          </div>
        )}
        <ChatInput
          isStreaming={isStreaming}
          hasSession={currentSessionId !== null}
          onSend={(text): void => {
            scrollToBottom();
            void send(text);
          }}
          onStop={(): void => void stop()}
          models={models}
          currentModelId={currentModelId}
          setModel={setModel}
          modes={modes}
          currentModeId={currentModeId}
          setMode={setMode}
        />
      </div>

      <div className={styles['chat-toast']}>
        {offline && !offlineDismissed && (
          <Toast
            variant="error"
            onDismiss={(): void => setOfflineDismissed(true)}
            dismissLabel={formatMessage(messages.dismiss)}
          >
            {formatMessage(messages.offlineToast)}
          </Toast>
        )}
        {justConnected && connectedAgent && (
          <Toast
            variant="success"
            autoDismiss
            onDismiss={(): void => setJustConnected(false)}
            dismissLabel={formatMessage(messages.dismiss)}
          >
            {formatMessage(messages.connectedToast, {
              agent: connectedAgent.name,
            })}
          </Toast>
        )}
        {fileError && (
          <Toast
            variant="error"
            autoDismiss
            onDismiss={dismissFileError}
            dismissLabel={formatMessage(messages.dismiss)}
          >
            {fileError}
          </Toast>
        )}
        {sessionActionError && (
          <Toast
            variant="error"
            autoDismiss
            onDismiss={dismissSessionActionError}
            dismissLabel={formatMessage(messages.dismiss)}
          >
            {formatMessage(sessionActionError)}
          </Toast>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
