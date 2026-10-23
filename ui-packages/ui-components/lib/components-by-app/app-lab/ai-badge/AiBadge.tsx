import { Ai as AiIcon } from '@cloud-editor-mono/images/assets/icons';

import { useI18n } from '../../../i18n/useI18n';
import { Badge, BadgeSize, BadgeStyle, BadgeVariant } from '../essential/badge';
import { messages } from './messages';

export const AiBadge: React.FC = () => {
  const { formatMessage } = useI18n();

  return (
    <Badge
      style={BadgeStyle.Light}
      variant={BadgeVariant.Neutral}
      size={BadgeSize.Small}
      icon={<AiIcon />}
    >
      {formatMessage(messages.aiModelBadge)}
    </Badge>
  );
};
