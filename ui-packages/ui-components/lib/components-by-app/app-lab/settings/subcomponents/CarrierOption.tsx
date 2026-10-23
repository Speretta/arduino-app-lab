import {
  ChevronDown,
  MediaCamera,
  MediaDisplay,
} from '@cloud-editor-mono/images/assets/icons';
import { useCallback, useMemo } from 'react';

import { DropdownMenuButton } from '../../../../essential/dropdown-menu';
import { useI18n, XXSmall } from '../../../shared';
import { Info } from '../../settings-section/subcomponents/Info';
import { Row } from '../../settings-section/subcomponents/Row';
import { boardExtensionsMessages } from '../messages';
import styles from '../settings.module.scss';
import { HwListDevice, HwStatus } from '../settings.type';

export interface CarrierOptionProps {
  carrierName: string;
  device: HwListDevice;
  status: HwStatus;
  onChange: (carrierName: string, device: string, option: string) => void;
}

export const CarrierOption = ({
  carrierName,
  device,
  status,
  onChange,
}: CarrierOptionProps): JSX.Element => {
  const { formatMessage } = useI18n();

  const name = useMemo(() => {
    // Adds a space before trailing digits, e.g. "camera0" -> "camera 0".
    return device.name.replace(/([a-zA-Z])(\d)/, '$1 $2');
  }, [device.name]);

  const icon = useMemo(() => {
    switch (device.deviceType) {
      case 'camera':
        return <MediaCamera />;
      case 'display':
        return <MediaDisplay />;
      default:
        return null;
    }
  }, [device.deviceType]);

  const value = useMemo(() => {
    return (
      status.mounts
        .find((carrier) => carrier.name === carrierName)
        ?.nextDevices.find((deviceItem) => deviceItem.device === device.name)
        ?.option ?? 'none'
    );
  }, [status.mounts, device.name, carrierName]);

  const renderLabel = useCallback(
    (option: string) => {
      return option === 'none'
        ? formatMessage(boardExtensionsMessages.carrierTypeNoOption, {
            type: device.deviceType,
          })
        : option;
    },
    [device.deviceType, formatMessage],
  );

  return (
    <Row
      classes={{ value: styles['carrier-value'] }}
      label={
        <div className={styles['carrier-label']}>
          {icon}
          <XXSmall>{name}</XXSmall>
        </div>
      }
    >
      <DropdownMenuButton
        sections={[
          {
            name: 'Actions',
            items: device.options.map((option) => ({
              id: option,
              label: renderLabel(option),
            })),
          },
        ]}
        buttonChildren={
          <>
            {renderLabel(value)}
            <ChevronDown />
          </>
        }
        // react-aria computes the position against the viewport, which only
        // matches where the popover is placed when it is portaled.
        useStaticPosition={false}
        usePortal
        onAction={(key): void =>
          onChange(carrierName, device.name, key as string)
        }
        classes={{
          dropdownMenu: styles['dropdown-menu'],
          dropdownMenuButton: styles['dropdown-menu-button'],
          dropdownMenuButtonOpen: styles['dropdown-menu-button-open'],
          dropdownMenuButtonWrapper: styles['dropdown-menu-button-wrapper'],
          dropdownMenuPopover: styles['dropdown-menu-popover'],
        }}
      />
      {device.deviceType === 'display' && value !== 'none' && (
        <Info>{formatMessage(boardExtensionsMessages.carrierTooltip)}</Info>
      )}
    </Row>
  );
};
