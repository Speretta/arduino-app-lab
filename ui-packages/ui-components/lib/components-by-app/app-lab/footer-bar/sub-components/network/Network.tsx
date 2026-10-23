import {
  WifiConnected,
  WifiDisconnected,
} from '@cloud-editor-mono/images/assets/icons';
import {
  ButtonAppearance,
  ButtonSize,
  ButtonVariant,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../../../essential/icon-button';
import { SystemResource } from '../../FooterBar.type';
import { messages } from '../../messages';
import NetworkPanel from '../network-panel/NetworkPanel';
import styles from './network.module.scss';

interface NetworkProps {
  networkItem: SystemResource | undefined;
  boardIP?: string | null;
}

export const Network: React.FC<NetworkProps> = ({
  networkItem,
  boardIP,
}: NetworkProps) => {
  const [isMenuVisible, setMenuVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const { formatMessage } = useI18n();

  const isConnected = networkItem?.state === 'default';

  // This effect handles clicks outside of the menu
  useEffect(() => {
    // Only add listener if menu is visible
    if (!isMenuVisible) return;
    function handleClickOutside(event: MouseEvent): void {
      // If the click is outside the menuRef, close the menu
      if (
        menuRef.current &&
        menuTriggerRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !menuTriggerRef.current.contains(event.target as Node)
      ) {
        setMenuVisible(false);
      }
    }
    // Bind the event listener
    document.addEventListener('mousedown', handleClickOutside);
    // Unbind the event listener on clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuVisible]); // Re-run effect only if isMenuVisible changes

  function clickHandlerNotifications(): void {
    setMenuVisible(!isMenuVisible);
  }

  const networkClick = networkItem?.onClick;
  const onChange = networkClick
    ? (): void => {
        setMenuVisible(false);
        networkClick();
      }
    : undefined;

  return (
    <>
      <IconButton
        ref={menuTriggerRef}
        label={networkItem?.label || formatMessage(messages.network)}
        Icon={isConnected ? WifiConnected : WifiDisconnected}
        variant={ButtonVariant.Tertiary}
        appearance={ButtonAppearance.LowContrast}
        size={ButtonSize.XSmall}
        onClick={clickHandlerNotifications}
        classes={{
          button: clsx(styles['network-button'], {
            [styles['connected']]: isConnected,
            [styles['active']]: isMenuVisible,
          }),
        }}
      />
      {isMenuVisible && (
        <NetworkPanel
          ref={menuRef}
          triggerRef={menuTriggerRef}
          ssid={networkItem?.label}
          ipAddress={boardIP}
          isConnected={isConnected}
          onChange={onChange}
        />
      )}
    </>
  );
};
