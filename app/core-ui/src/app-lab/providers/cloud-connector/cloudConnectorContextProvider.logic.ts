import {
  deleteCloudConnectorDevice,
  getCloudConnectorStatus,
  openLinkExternal,
  startCloudConnectorProvisioning,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  CloudConnectorOrganization,
  CloudConnectorStatus,
} from '@cloud-editor-mono/infrastructure';
import {
  CloudConnectorErrorDialogLogic,
  CloudConnectorRequiredDialogLogic,
  snackbar,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useBoardLifecycleStore } from '../../store/boardLifecycle';
import { useAuth } from '../auth/authContextProvider.logic';
import { NetworkContext } from '../network/networkContext';
import { cloudConnectorMessages } from './messages';

export type UseCloudConnector = () => {
  status?: CloudConnectorStatus;
  isConnecting: boolean;
  isDisconnecting: boolean;
  startProvisioning: (
    organization: CloudConnectorOrganization,
  ) => Promise<void>;
  removeProvisioning: () => Promise<void>;
  errorDialogLogic: CloudConnectorErrorDialogLogic;
  requiredDialogLogic: CloudConnectorRequiredDialogLogic;
  showRequiredDialog: () => void;
};

const ARDUINO_SUPPORT_URL = 'https://www.arduino.cc/en/contact-us/';

export const useCloudConnector: UseCloudConnector =
  (): ReturnType<UseCloudConnector> => {
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);
    const [requiredDialogOpen, setRequiredDialogOpen] = useState(false);
    const [uhwid, setUhwid] = useState('');

    const { formatMessage } = useI18n();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { isConnected } = useContext(NetworkContext);
    const { selectedConnectedBoard, boardIsReachable } = useBoardLifecycleStore(
      useShallow((state) => ({
        selectedConnectedBoard: state.selectedConnectedBoard,
        boardIsReachable: state.boardIsReachable,
        needsImageUpdate: state.needsImageUpdate,
        setBoardIsFlashing: state.setBoardIsFlashing,
      })),
    );

    const { data: status, refetch: refetchStatus } = useQuery({
      queryKey: ['cloud-connector-status'],
      queryFn: async () => getCloudConnectorStatus(),
      enabled: boardIsReachable && isConnected,
      refetchInterval: isProvisioning ? 1000 : false,
    });

    // Handle successful cloud connector status query
    useEffect(() => {
      if (!status || !isProvisioning) return;

      if (
        status.provisioning === 'provisioned' ||
        status.provisioning === 'error'
      ) {
        setIsProvisioning(false);
      }

      if (status.provisioning === 'provisioned') {
        snackbar({
          message: formatMessage(cloudConnectorMessages.connectedDescription),
          variant: 'success',
        });
      }
    }, [status, isProvisioning]);

    // The status depends on the signed-in user and must be fresh in Settings.
    useEffect(() => {
      if (!boardIsReachable || !isConnected) return;
      if (!user || pathname.startsWith('/settings')) {
        // Joins the fetch `enabled` starts when the board becomes reachable.
        refetchStatus({ cancelRefetch: false });
      }
    }, [boardIsReachable, isConnected, user, pathname, refetchStatus]);

    const {
      mutateAsync: startProvisioning,
      isPending: isStartingProvisioning,
    } = useMutation({
      mutationFn: async (organization: CloudConnectorOrganization) =>
        startCloudConnectorProvisioning(
          selectedConnectedBoard!,
          organization,
          status!,
        ),
      onSuccess: () => {
        // The cached status still holds the previous outcome ('error' or
        // 'provisioned'), and the effect above ends provisioning on either.
        // Mark the cache as in progress so the poll survives until the daemon
        // reports the real outcome.
        queryClient.setQueryData<CloudConnectorStatus>(
          ['cloud-connector-status'],
          (previous) =>
            previous && { ...previous, provisioning: 'provisioning' },
        );
        setIsProvisioning(true);
      },
      onError: (e) => {
        const parseError = ():
          | string
          | { err_code?: number; uhwid?: string } => {
          if (!(e instanceof Error)) return String(e);

          try {
            const error = JSON.parse(e.message) as {
              err_code?: number;
              uhwid?: string;
            };
            return error;
          } catch {
            return e.message;
          }
        };
        const error = parseError();

        const getErrorMessage = (): string | undefined => {
          if (!error || typeof error === 'string' || error.err_code === 4) {
            return formatMessage(
              cloudConnectorMessages.connectionFailedDescription,
            );
          }

          if (error.err_code === 3) {
            setUhwid(error.uhwid || '');
            setErrorDialogOpen(true);
            return;
          }

          return formatMessage(
            cloudConnectorMessages.deviceAlreadyClaimedDescription,
          );
        };
        const message = getErrorMessage();

        if (message) {
          snackbar({
            message,
            variant: 'error',
          });
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({
          queryKey: ['cloud-connector-status'],
        });
      },
    });

    const errorDialogLogic: CloudConnectorErrorDialogLogic = useCallback(
      () => ({
        open: errorDialogOpen,
        uhwid,
        onOpenChange: setErrorDialogOpen,
        confirmAction: (): void => setErrorDialogOpen(false),
        contactSupportAction: (): void => openLinkExternal(ARDUINO_SUPPORT_URL),
      }),
      [errorDialogOpen, uhwid],
    );

    const { mutateAsync: removeProvisioning, isPending: isDisconnecting } =
      useMutation({
        mutationFn: async () => deleteCloudConnectorDevice(status!),
        onSuccess: () => {
          snackbar({
            message: formatMessage(
              cloudConnectorMessages.disconnectedDescription,
            ),
            variant: 'success',
          });
        },
        onError: (e) => {
          snackbar({
            message: e instanceof Error ? e.message : String(e),
            variant: 'error',
          });
        },
        onSettled: () => {
          queryClient.invalidateQueries({
            queryKey: ['cloud-connector-status'],
          });
        },
      });

    const requiredDialogLogic: CloudConnectorRequiredDialogLogic = useCallback(
      () => ({
        open: requiredDialogOpen,
        onOpenChange: setRequiredDialogOpen,
        confirmAction: (): void => {
          setRequiredDialogOpen(false);
          navigate({
            to: '/settings',
            hash: 'cloud-connector',
            search: { openCloudConnectorDialog: true },
          });
        },
      }),
      [navigate, requiredDialogOpen],
    );

    const showRequiredDialog = useCallback((): void => {
      setRequiredDialogOpen(true);
    }, []);

    return useMemo(
      () => ({
        status,
        isConnecting: isStartingProvisioning || isProvisioning,
        isDisconnecting,
        startProvisioning,
        removeProvisioning,
        errorDialogLogic,
        requiredDialogLogic,
        showRequiredDialog,
      }),
      [
        errorDialogLogic,
        isDisconnecting,
        isProvisioning,
        isStartingProvisioning,
        removeProvisioning,
        requiredDialogLogic,
        showRequiredDialog,
        startProvisioning,
        status,
      ],
    );
  };
