import {
  connectToWiFi,
  disconnectWiFi,
  getNetworkList,
  getNetworkStatus,
  NetworkStatus,
  WiFiConnectionStatus,
} from '@cloud-editor-mono/domain/src/services/services-by-app/app-lab';
import {
  NetworkCredentials,
  NetworkItem,
  WiFiConnectionErrorCode,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { BoardScopedQuery } from '../../boardScopedQuery';
import { useBoardLifecycleStore } from '../../store/boardLifecycle';
import { NetworkContextValue } from './networkContext';

const EMPTY_NETWORK_LIST: NetworkItem[] = [];

const SCAN_POLL_MS = 1500;
// Polls the scan this many times before it settles for what it found.
const SCAN_POLL_LIMIT = 8;

export function useNetwork(): NetworkContextValue {
  const queryClient = useQueryClient();

  // The mutations know the WiFi state before the next poll does.
  const setWiFiStatus = (wifi: WiFiConnectionStatus): void => {
    queryClient.setQueryData(
      [BoardScopedQuery.NETWORK_STATUS],
      (previous: NetworkStatus | undefined): NetworkStatus => ({
        ethernet: 'disconnected',
        internet: false,
        ...previous,
        wifi,
      }),
    );
  };

  const [connectRequestErrorCode, setConnectRequestErrorCode] =
    useState<WiFiConnectionErrorCode>();

  const {
    mutate: connectToWifiNetwork,
    isPending: connectRequestIsLoading,
    isSuccess: connectRequestIsSuccess,
    isError: connectRequestIsError,
    reset: resetConnectRequest,
  } = useMutation({
    mutationKey: ['connect-to-wifi-network'],
    mutationFn: async ({ name, password }: NetworkCredentials) => {
      await connectToWiFi(name, password);
    },
    onMutate: () => {
      setConnectRequestErrorCode(undefined);
      setWiFiStatus('connecting');
    },
    onSuccess: () => {
      setConnectRequestErrorCode(undefined);
      setWiFiStatus('connected');
    },
    onError: (error) => {
      const code = error instanceof Error ? error.message : undefined;
      setConnectRequestErrorCode(
        code === WiFiConnectionErrorCode.IncorrectPassword
          ? WiFiConnectionErrorCode.IncorrectPassword
          : WiFiConnectionErrorCode.ConnectionFailed,
      );
      setWiFiStatus('disconnected');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.NETWORK_STATUS],
      });
    },
  });

  const { boardIsFlashing, boardIsReachable } = useBoardLifecycleStore(
    useShallow((state) => ({
      boardIsFlashing: state.boardIsFlashing,
      boardIsReachable: state.boardIsReachable,
    })),
  );

  const {
    mutateAsync: disconnectFromNetwork,
    isPending: disconnectRequestIsLoading,
  } = useMutation({
    mutationFn: async () => {
      return disconnectWiFi();
    },
    onMutate: () => {
      resetConnectRequest();
      setWiFiStatus('disconnected');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [BoardScopedQuery.NETWORK_STATUS],
      });
    },
  });

  // One query, one SSH session: the board answers all three from one call.
  const {
    data: networkStatus,
    isLoading: isNetworkStatusLoading,
    isSuccess: networkStatusChecked,
  } = useQuery({
    queryKey: [BoardScopedQuery.NETWORK_STATUS],
    queryFn: async () => getNetworkStatus(),
    retry: 3,
    refetchInterval: 3000,

    enabled:
      !boardIsFlashing &&
      boardIsReachable &&
      !connectRequestIsLoading &&
      !disconnectRequestIsLoading,
  });

  const wiFiStatus = networkStatus?.wifi;
  const ethernetStatus = networkStatus?.ethernet;
  const internetIsReachable = networkStatus?.internet;

  const networkDeviceConnected =
    wiFiStatus === 'connected' || ethernetStatus === 'connected';

  const [scanCount, setScanCount] = useState(0);
  const [scanningIsEnabled, setScanningIsEnabled] = useState(false);
  const isConnected = networkDeviceConnected && internetIsReachable === true;
  const {
    data: networkList,
    dataUpdatedAt: scanUpdatedAt,
    isFetching: scanIsFetching,
    refetch: scanNetworkList,
  } = useQuery({
    queryKey: [BoardScopedQuery.NETWORK_LIST],
    queryFn: getNetworkList,
    enabled: scanningIsEnabled,
    refetchInterval:
      scanningIsEnabled && scanCount < SCAN_POLL_LIMIT ? SCAN_POLL_MS : false,
  });

  // The counter has to advance once per poll, and `dataUpdatedAt` is the only
  // value that changes on a poll that found the same networks as the last one:
  // an equal list keeps its reference, so `networkList` alone would count the
  // first poll and then stop the counter while the poll kept running.
  useEffect(() => {
    if (networkList) {
      setScanCount(
        networkList.length > 0 ? SCAN_POLL_LIMIT : (c): number => c + 1,
      );
    }
  }, [networkList, scanUpdatedAt]);

  const isStatusConnecting =
    wiFiStatus === 'connecting' || ethernetStatus === 'connecting';

  const [selectedNetwork, setSelectedNetwork] = useState<NetworkItem>();
  const [manualNetworkSetup, setManualNetworkSetup] = useState(false);

  useEffect(() => {
    resetConnectRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNetwork, manualNetworkSetup]);

  // Derived before the memo, so the scan poll flipping `scanIsFetching` every
  // 1.5s recomputes nothing: `isScanning` stays true across the whole scan.
  const isScanning =
    scanIsFetching || (scanningIsEnabled && scanCount < SCAN_POLL_LIMIT);
  const isConnecting =
    connectRequestIsLoading ||
    isStatusConnecting ||
    (connectRequestIsSuccess && !internetIsReachable);

  return useMemo(
    () => ({
      isScanning,
      setScanningIsEnabled,
      networkList: networkList ?? EMPTY_NETWORK_LIST,
      isNetworkStatusLoading,
      networkStatusChecked,
      scanNetworkList,
      connectToWifiNetwork,
      disconnectFromNetwork,
      isConnected,
      isStatusConnecting,
      isConnecting,
      connectRequestIsSuccess,
      connectRequestIsError,
      connectRequestErrorCode,
      selectedNetwork,
      setSelectedNetwork,
      manualNetworkSetup,
      setManualNetworkSetup,
    }),
    [
      connectRequestErrorCode,
      connectRequestIsError,
      connectRequestIsSuccess,
      connectToWifiNetwork,
      disconnectFromNetwork,
      isConnected,
      isConnecting,
      isNetworkStatusLoading,
      isScanning,
      isStatusConnecting,
      manualNetworkSetup,
      networkList,
      networkStatusChecked,
      scanNetworkList,
      selectedNetwork,
    ],
  );
}
