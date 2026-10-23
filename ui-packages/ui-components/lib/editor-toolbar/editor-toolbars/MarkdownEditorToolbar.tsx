import {
  Tabs,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback } from 'react';

import { messages } from './messages';

const TAB_WRITE = 'Write' as const;
const TAB_PREVIEW = 'Preview' as const;

type MarkdownTab = typeof TAB_WRITE | typeof TAB_PREVIEW;

interface MarkdownEditorToolbarProps {
  isRendered: boolean;
  onToggleRender?: (rendered: boolean) => void;
  readOnly?: boolean;
}

const MarkdownEditorToolbar: React.FC<MarkdownEditorToolbarProps> = (
  props: MarkdownEditorToolbarProps,
) => {
  const { formatMessage } = useI18n();
  const { isRendered, onToggleRender, readOnly } = props;
  // Controlled: derive directly from props so per-file mode changes
  // (eg. switching tabs in a panel) keep the toolbar in sync.
  const activeTab: MarkdownTab = isRendered ? TAB_PREVIEW : TAB_WRITE;

  const setActiveTab = useCallback(
    (tab: MarkdownTab): void => {
      onToggleRender?.(tab === TAB_PREVIEW);
    },
    [onToggleRender],
  );

  const tabs: MarkdownTab[] = [TAB_WRITE, TAB_PREVIEW];

  const tabDictionary = (tab: MarkdownTab): string => {
    switch (tab) {
      case TAB_WRITE:
        return formatMessage(messages.tabWrite);
      case TAB_PREVIEW:
        return formatMessage(messages.tabPreview);
      default:
        return tab;
    }
  };

  return (
    <div>
      {!readOnly && (
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabDictionary={tabDictionary}
          size="default"
          withBackground
        />
      )}
    </div>
  );
};

export default MarkdownEditorToolbar;
