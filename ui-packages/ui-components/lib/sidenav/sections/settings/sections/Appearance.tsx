import { Decrement, Increment } from '@cloud-editor-mono/images/assets/icons';
import { useContext } from 'react';

import { NumberField } from '../../../../essential/number-field';
import { useI18n } from '../../../../i18n/useI18n';
import { XSmall } from '../../../../typography';
import { SettingsContext } from '../context/settingsContext';
import { messages } from '../messages';
import styles from '../settings.module.scss';
import { Preferences } from '../settings.type';

const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 28;

const Appearance: React.FC = () => {
  const { getPreference, setPreference } = useContext(SettingsContext);
  const { formatMessage } = useI18n();

  const fontSize = Number(getPreference(Preferences.FontSize));

  return (
    <>
      <div className={styles['setting']}>
        <XSmall bold>{formatMessage(messages.fontSizeSection)}</XSmall>
        <NumberField
          label={formatMessage(messages.fontSizeSection)}
          DecIcon={Decrement}
          IncIcon={Increment}
          minValue={MIN_FONT_SIZE}
          maxValue={MAX_FONT_SIZE}
          onChange={(fontSizeValue): void => {
            setPreference(Preferences.FontSize, fontSizeValue);
          }}
          value={fontSize}
          unit="px"
          classes={{
            container: styles['setting__font-size'],
            button: styles['setting__font-size-button'],
            input: styles['setting__font-size-input'],
          }}
        />
      </div>
    </>
  );
};

export default Appearance;
