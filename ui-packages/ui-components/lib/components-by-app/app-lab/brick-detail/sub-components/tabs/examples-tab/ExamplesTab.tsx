import { useLocation } from '@tanstack/react-router';

import MarkdownReader from '../../../../markdown-reader/MarkdownReader';
import { BrickExampleSnippet } from './brick-example-snippet/BrickExampleSnippet';
import { BrickExample } from './ExamplesTab.type';

export interface ExamplesTabProps {
  examples?: BrickExample[] | null;
  onOpenExternalLink?: (url: string) => void;
  hideHeader?: boolean;
}

export const ExamplesTab: React.FC<ExamplesTabProps> = ({
  examples,
  onOpenExternalLink,
  hideHeader = false,
}: ExamplesTabProps) => {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <>
      {(examples ?? []).map(({ content, path, exampleName, exampleId }) =>
        exampleName && exampleId ? (
          <BrickExampleSnippet
            key={path}
            title={exampleName}
            exampleId={exampleId}
            content={content}
            onOpenExternalLink={onOpenExternalLink}
            hideHeader={hideHeader}
            isCurrentExample={pathname === `/examples/${exampleId}`}
          />
        ) : (
          <MarkdownReader
            key={path}
            content={content}
            onOpenExternalLink={onOpenExternalLink}
          />
        ),
      )}
    </>
  );
};
