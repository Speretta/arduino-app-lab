import { BrickMarkdown } from './shared/BrickMarkdown';

export interface DocumentationTabProps {
  apiDocs?: string | null;
  onOpenExternalLink?: (url: string) => void;
}

export const DocumentationTab: React.FC<DocumentationTabProps> = ({
  apiDocs,
  onOpenExternalLink,
}: DocumentationTabProps) => (
  <BrickMarkdown content={apiDocs} onOpenExternalLink={onOpenExternalLink} />
);
