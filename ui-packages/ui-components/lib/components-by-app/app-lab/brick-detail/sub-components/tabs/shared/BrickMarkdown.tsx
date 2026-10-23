import { AllowElement } from 'react-markdown/lib/rehype-filter';

import { useI18n } from '../../../../../../i18n/useI18n';
import MarkdownReader from '../../../../markdown-reader/MarkdownReader';
import { messages } from '../../../messages';

const dropLeadingH1: AllowElement = (el, index) =>
  index !== 0 || el.tagName !== 'h1';

export interface BrickMarkdownProps {
  content?: string | null;
  onOpenExternalLink?: (url: string) => void;
}

export const BrickMarkdown: React.FC<BrickMarkdownProps> = ({
  content,
  onOpenExternalLink,
}: BrickMarkdownProps) => {
  const { formatMessage } = useI18n();

  return (
    <MarkdownReader
      content={content ?? formatMessage(messages.fileNotFound)}
      onOpenExternalLink={onOpenExternalLink}
      allowElement={dropLeadingH1}
    />
  );
};
