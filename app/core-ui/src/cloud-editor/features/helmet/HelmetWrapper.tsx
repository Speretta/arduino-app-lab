import { useTheme } from '@bcmi-labs/art-ui';
import ArduinoTabLogo from '@cloud-editor-mono/images/public/arduino-tab-logo.svg';
import ArduinoTabLogoWhite from '@cloud-editor-mono/images/public/arduino-tab-logo-white.svg';
import { useI18n } from '@cloud-editor-mono/ui-components';
import { Helmet } from 'react-helmet-async';

import { messages } from './messages';

interface HelmetWrapperProps {
  tabTitle?: string;
}

const HelmetWrapper: React.FC<HelmetWrapperProps> = (
  props: HelmetWrapperProps,
) => {
  const { tabTitle } = props;
  const { themeName } = useTheme();

  const { formatMessage } = useI18n();

  return (
    <Helmet>
      <title>
        {tabTitle
          ? `${tabTitle} — ${formatMessage(messages.titleSuffix)}`
          : formatMessage(messages.title)}
      </title>
      <link
        rel="icon"
        type="image/svg+xml"
        href={themeName === 'light' ? ArduinoTabLogoWhite : ArduinoTabLogo}
      />
    </Helmet>
  );
};

export default HelmetWrapper;
