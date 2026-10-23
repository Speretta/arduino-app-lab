import {
  abortPendingOtaById,
  checkThingCert,
  CompileSketch_Result,
  createOtaUpload,
  ga4Emitter,
  getBoardByFqbn,
  getCompilationOutput,
  getIotCloudDevices,
  GetIotCloudDevices_Result,
  getOtaById,
  GetSketchResult,
  getThingDevice,
  iotUploadReady,
  listDeviceOTA,
  NotificationMode,
  NotificationType,
  parseCompileData,
  sendNotification,
  UploadIotSketchNotReadyError,
} from '@cloud-editor-mono/domain';
import {
  ArduinoBuilderV2CompilationsResponse_BuilderApi,
  CheckThingCert_Response,
  CreateOtaV1_Response,
  ListOtaV1_Response,
  ShowDeviceV2_Response,
  ShowOtaV1_Response,
  ShowThingV1Device_Response,
} from '@cloud-editor-mono/infrastructure';
import {
  DetectedDevice,
  DetectedDevicesGroup,
  IotDevicesGroups,
  IotPortName,
  ToastSize,
  ToastType,
  useI18n,
} from '@cloud-editor-mono/ui-components';
import {
  QueryObserverResult,
  UseMutateAsyncFunction,
  UseMutateFunction,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageDescriptor } from 'react-intl';
import { WretchError } from 'wretch/types';

import { CommandParams } from '../../../cloud-editor/features/main/main.type';
import { createUpdatedCompilePayload } from '../../../cloud-editor/features/main/utils';
import { useGetBoardByFqbn, useVerifySketch } from './builder';
import { CompilePayload } from './builder.type';
import { refreshFilesContents, refreshSketch } from './create';
import {
  IotUploadOutput,
  IotUploadPayload,
  UseIoTSketch,
  UseIotUpload,
} from './iot.type';
import { useIotUploadData } from './iotUtils';
import { messages } from './messages';
import { formatTimestamp } from './utils/timestamps';

export type ShowThingV1Device_ResponseWithArchAndOriginalName =
  ShowThingV1Device_Response & {
    architecture: string;
    originalName?: string; // presence of this property shows that `.name` was modified
  };

type EnrichedBoard = Awaited<ReturnType<typeof getBoardByFqbn>>;

type IotReadinessTarget = { thingId?: string; deviceId?: string };

type CombinedBoardQueries = {
  boards: (EnrichedBoard | undefined)[];
  isLoading: boolean;
};

function combineBoardQueries(
  results: UseQueryResult<EnrichedBoard>[],
): CombinedBoardQueries {
  return {
    boards: results.map((result) =>
      result.data && !result.error ? result.data : undefined,
    ),
    isLoading: results.some((result) => result.isLoading),
  };
}

function iotDevicesKey(devices: ShowDeviceV2_Response[]): string {
  return JSON.stringify(devices.map((d) => `${d.id}-${d.name}`).sort());
}

// The device list is polled every 1.5 s. Only the id-name set per group
// matters here; any other changed field would give a new reference and
// re-render the whole editor on every poll.
function keepIotCloudDevicesIfEqual(prev: unknown, next: unknown): unknown {
  const prevDevices = prev as GetIotCloudDevices_Result | undefined;
  const nextDevices = next as GetIotCloudDevices_Result;

  if (!prevDevices) return nextDevices;

  const equal =
    iotDevicesKey(prevDevices[DetectedDevicesGroup.Online]) ===
      iotDevicesKey(nextDevices[DetectedDevicesGroup.Online]) &&
    iotDevicesKey(prevDevices[DetectedDevicesGroup.Offline]) ===
      iotDevicesKey(nextDevices[DetectedDevicesGroup.Offline]);

  return equal ? prevDevices : nextDevices;
}

export const useIotSketch: UseIoTSketch = function (
  isReadOnly: boolean,
  sketchData?: GetSketchResult,
): ReturnType<UseIoTSketch> {
  const [thingDeviceDetails, setThingDeviceDetails] =
    useState<ShowThingV1Device_ResponseWithArchAndOriginalName>();
  const [iotDevicesGroups, setIotDevicesGroups] = useState<IotDevicesGroups>();
  const isIotSketch = Boolean(sketchData?.thingId);

  const queryClient = useQueryClient();

  const thingDeviceDetailsQueryKey = useMemo(
    () => ['get-thing-device-details', sketchData?.thingId],
    [sketchData?.thingId],
  );

  const {
    data: thingDevice,
    isLoading: thingDeviceIsLoading,
    isError: thingDeviceNotFound,
  } = useQuery({
    queryKey: thingDeviceDetailsQueryKey,
    queryFn: () => {
      if (!sketchData?.thingId) {
        return Promise.reject('No thingId provided for Thing device');
      }

      try {
        return getThingDevice(sketchData.thingId);
      } catch (err) {
        return undefined;
      }
    },
    enabled: isIotSketch,
  });

  const refreshThingDeviceDetails = useCallback((): void => {
    queryClient.invalidateQueries({ queryKey: thingDeviceDetailsQueryKey });
    queryClient.invalidateQueries({
      queryKey: ['get-iot-cloud-devices'],
    });
  }, [queryClient, thingDeviceDetailsQueryKey]);

  const {
    board: thingDeviceDetailsWithArch,
    isLoading: thingDeviceArchIsLoading,
  } = useGetBoardByFqbn(Boolean(thingDevice), thingDevice?.fqbn);

  useEffect(() => {
    if (!thingDevice || !thingDeviceDetailsWithArch) return;

    setThingDeviceDetails({
      ...thingDevice,
      name:
        thingDevice.name !== thingDeviceDetailsWithArch.name
          ? `${thingDevice.name} - ${thingDeviceDetailsWithArch.name}`
          : thingDevice.name,
      architecture: thingDeviceDetailsWithArch.architecture,
      originalName: thingDevice.name,
    });
  }, [thingDevice, thingDeviceDetailsWithArch]);

  const thingDeviceDetailsIsLoading =
    isIotSketch &&
    (thingDeviceIsLoading || thingDeviceArchIsLoading || !thingDeviceDetails);

  const iotDevicesToEnrich = useMemo(
    () =>
      iotDevicesGroups && [
        ...new Set(
          [
            ...iotDevicesGroups[DetectedDevicesGroup.Online],
            ...iotDevicesGroups[DetectedDevicesGroup.Offline],
          ]
            // ** we only need to fetch details for devices that are missing
            // ** architecture or a board name suffix
            .filter((d) => !d.architecture || !d.originalName)
            .map((d) => ({ fqbn: d.fqbn, name: d.name })),
        ),
      ],
    [iotDevicesGroups],
  );

  const { boards: enrichedBoards, isLoading: boardsAreLoading } = useQueries({
    queries: (iotDevicesToEnrich ?? []).map(({ fqbn: deviceFqbn, name }) => ({
      queryKey: ['get-board-by-fqbn', deviceFqbn, name],
      queryFn: () =>
        deviceFqbn
          ? getBoardByFqbn({ fqbn: deviceFqbn })
          : Promise.reject('No FQBN provided for IoT device'),
    })),

    // `useQueries` returns a new results array on every render. The combined
    // value keeps its reference until a board arrives.
    combine: combineBoardQueries,
  });

  useEffect(() => {
    const boards = enrichedBoards.filter((board): board is EnrichedBoard =>
      Boolean(board),
    );

    if (boards.length === 0) return;

    setIotDevicesGroups((prev) => {
      if (!prev) return prev;

      const mapNameAndArchToDevice = (d: DetectedDevice): DetectedDevice => {
        const data = boards.find((board) => board.fqbn === d.fqbn);

        // An enriched device keeps its suffixed name; two devices with the
        // same fqbn share the board data.
        if (!data || (d.architecture && d.originalName)) return d;

        return {
          ...d,
          name: d.name !== data.name ? `${d.name} - ${data.name}` : d.name,
          architecture: data.architecture,
          originalName: d.name,
        };
      };

      return {
        [DetectedDevicesGroup.Online]: prev[DetectedDevicesGroup.Online].map(
          mapNameAndArchToDevice,
        ),
        [DetectedDevicesGroup.Offline]: prev[DetectedDevicesGroup.Offline].map(
          mapNameAndArchToDevice,
        ),
      };
    });
  }, [enrichedBoards]);

  const { data: iotCloudDevices } = useQuery({
    queryKey: ['get-iot-cloud-devices'],
    queryFn: () => getIotCloudDevices(sketchData?.thingId),
    staleTime: 0,
    refetchInterval: 1500,
    structuralSharing: keepIotCloudDevicesIfEqual,
    notifyOnChangeProps: ['data'],
    // avoids race condition with the board queries above
    enabled: !isReadOnly && isIotSketch && !boardsAreLoading,
  });

  // Handle successful IoT cloud devices query with device change detection
  useEffect(() => {
    if (!iotCloudDevices) return;

    const createMapOtaDevice = (port: IotPortName) =>
      function mapOtaDevice(d: ShowDeviceV2_Response): DetectedDevice {
        const portBoardId = createIotPortBoardID(port, d.id);

        return {
          id: d.id,
          portBoardId,
          name: d.name,
          fqbn: d.fqbn,
          portName: port,
          isUnknownBoard: false,
          isAssociated: false,
          isIot: true,
          serialNumber: d.serial,
          otaCompatible: d.otaCompatible,
        };
      };

    const onlineDevicesMapped = iotCloudDevices[
      DetectedDevicesGroup.Online
    ].map(createMapOtaDevice(IotPortName.Online));
    const offlineDevicesMapped = iotCloudDevices[
      DetectedDevicesGroup.Offline
    ].map(createMapOtaDevice(IotPortName.Offline));

    const mappedDevices = [...onlineDevicesMapped, ...offlineDevicesMapped];

    const deviceIdsKey = JSON.stringify(
      mappedDevices
        .map((d) => `${d.portBoardId}-${d.originalName || d.name}`)
        .sort(),
    );

    setIotDevicesGroups((prev) => {
      const prevDevices = prev && [
        ...prev[DetectedDevicesGroup.Online],
        ...prev[DetectedDevicesGroup.Offline],
      ];

      const previousDeviceIdsKey = JSON.stringify(
        prevDevices
          ?.map((d) => `${d.portBoardId}-${d.originalName || d.name}`)
          .sort(),
      );

      const devicesUnchanged = deviceIdsKey === previousDeviceIdsKey;
      if (devicesUnchanged) return prev;

      const mapNameAndArchToDevice = (d: DetectedDevice): DetectedDevice => {
        const prevMappedDevice = prevDevices?.find(
          (pd) => pd.portBoardId === d.portBoardId,
        );

        const prevMappedArch = prevMappedDevice?.architecture;
        const prevMappedDeviceName = prevMappedDevice?.name;
        const prevMappedDeviceOriginalName = prevMappedDevice?.originalName;

        const nameAlreadySuffixed =
          prevMappedDeviceOriginalName &&
          prevMappedDeviceOriginalName === d.name;

        return {
          ...d,
          name: nameAlreadySuffixed ? prevMappedDeviceName ?? d.name : d.name,
          architecture: prevMappedArch ?? d.architecture,
          originalName: nameAlreadySuffixed
            ? prevMappedDeviceOriginalName
            : undefined,
          // ** if the name has changes backend, set this to undefined, to recreate board name suffix
          // ** in `fqbnQueries`
        };
      };

      const onlineDevices = onlineDevicesMapped.map(mapNameAndArchToDevice);
      const offlineDevices = offlineDevicesMapped.map(mapNameAndArchToDevice);

      return {
        [DetectedDevicesGroup.Online]: onlineDevices,
        [DetectedDevicesGroup.Offline]: offlineDevices,
      };
    });
  }, [iotCloudDevices]);

  useEffect(() => {
    if (!thingDeviceDetails || !iotDevicesGroups) return;

    const iotDevices = [
      ...iotDevicesGroups[DetectedDevicesGroup.Online],
      ...iotDevicesGroups[DetectedDevicesGroup.Offline],
    ];

    const matchingIotDevice = iotDevices.find(
      (d) => d.id === thingDeviceDetails.id,
    );

    if (!matchingIotDevice) return;

    if (
      thingDeviceDetails.originalName &&
      matchingIotDevice.originalName &&
      thingDeviceDetails.originalName !== matchingIotDevice.originalName
    ) {
      queryClient.invalidateQueries({
        queryKey: thingDeviceDetailsQueryKey,
        exact: true,
      });
    }
  }, [
    iotDevicesGroups,
    queryClient,
    sketchData,
    thingDeviceDetails,
    thingDeviceDetailsQueryKey,
    thingDeviceDetailsWithArch,
  ]);

  return {
    isIotSketch,
    iotDevicesGroups,
    thingDeviceDetails,
    thingDeviceDetailsIsLoading,
    thingDeviceNotFound,
    refreshThingDeviceDetails,
  };
};

export function createIotPortBoardID(
  portName: IotPortName,
  id: string,
): string {
  return `${portName}-${id}`;
}

export type UseIotUploadQueries = (
  isUploading: boolean,
  thingDeviceDetailsIsLoading: boolean,
  verboseCompile: boolean,
  setOutput: React.Dispatch<React.SetStateAction<IotUploadOutput | undefined>>,
  normalizeOutput: (data: CompileSketch_Result) => void,
  setIsPending: React.Dispatch<React.SetStateAction<boolean>>,
  setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  createCompilation: (payload: CompilePayload) => void,
  thingId?: string,
  selectedIoTDeviceId?: string,
  commandParams?: CommandParams,
  enableGetOutput?: boolean,
  createdSketchCompilation?: ArduinoBuilderV2CompilationsResponse_BuilderApi & {
    sketchName?: string;
  },
) => {
  shouldCheckForOngoingOta: boolean;
  checkOngoingOta: () => Promise<
    QueryObserverResult<ListOtaV1_Response, unknown>
  >;
  startIotUpload: () => void;
  newOtaUpload: UseMutateAsyncFunction<
    | CreateOtaV1_Response
    | {
        errStatus: number;
      },
    unknown,
    IotUploadPayload,
    unknown
  >;
  resetUpload: () => void;
  isCreating: boolean;
  uploadHasError: boolean;
  abortPending: UseMutateFunction<CreateOtaV1_Response, unknown, void, unknown>;
  clearOtaState: () => void;
  isFetchingCompilationOutput: boolean;
  otaProgressData?: ShowOtaV1_Response;
};

export const useIotUploadQueries: UseIotUploadQueries = function (
  isUploading: boolean,
  thingDeviceDetailsIsLoading: boolean,
  verboseCompile: boolean,
  setOutput: React.Dispatch<React.SetStateAction<IotUploadOutput | undefined>>,
  normalizeOutput: (data: CompileSketch_Result) => void,
  setIsPending: React.Dispatch<React.SetStateAction<boolean>>,
  setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  createCompilation: (payload: CompilePayload) => void,
  thingId?: string,
  selectedIoTDeviceId?: string,
  commandParams?: CommandParams,
  enableGetOutput?: boolean,
  createdSketchCompilation?: ArduinoBuilderV2CompilationsResponse_BuilderApi & {
    sketchName?: string;
  },
): ReturnType<UseIotUploadQueries> {
  const { formatMessage } = useI18n();

  const [otaId, setOtaId] = useState<string>();
  const [hasCheckedForOngoingOta, setHasCheckedForOngoingOta] = useState(false);

  const shouldCheckForOngoingOta =
    thingDeviceDetailsIsLoading ||
    Boolean(selectedIoTDeviceId && !hasCheckedForOngoingOta);

  const { data: otaData, refetch: checkOngoingOta } = useQuery({
    queryKey: ['check-iot-in-progress', selectedIoTDeviceId],

    queryFn: () => {
      return selectedIoTDeviceId
        ? listDeviceOTA(selectedIoTDeviceId, {
            limit: 1,
            order: 'desc',
          })
        : Promise.reject('Cannot fetch IOT request from DB');
    },

    enabled: !!selectedIoTDeviceId && shouldCheckForOngoingOta,
  });

  // Handle successful OTA check
  useEffect(() => {
    if (!otaData) return;

    if (!otaData.ota?.length) {
      setHasCheckedForOngoingOta(true);
      return;
    }

    if (otaData.ota[0].status === 'in_progress') {
      //Set the ID
      setOtaId(otaData.ota[0].id);
      setUploading(true);

      setHasCheckedForOngoingOta(true);

      return;
    }

    if (otaData.ota[0].status === 'pending') {
      setIsPending(true);
      setOtaId(otaData.ota[0].id);
      setUploading(true);

      setHasCheckedForOngoingOta(true);

      return;
    }

    setHasCheckedForOngoingOta(true);
  }, [otaData]);

  // The check that is running, set in the same call that starts it. The
  // mutation's `isPending` reaches React one macrotask later, so a second
  // click before that re-render would still read `false`.
  const readinessCheckInFlight = useRef<IotReadinessTarget>();

  // A check started for another thing or device must not start a compile.
  // Changing the device resets the mutation observer, but the running
  // mutation still calls its own `onSuccess`.
  const currentReadinessTarget = useRef<IotReadinessTarget>({
    thingId,
    deviceId: selectedIoTDeviceId,
  });
  useEffect(() => {
    currentReadinessTarget.current = { thingId, deviceId: selectedIoTDeviceId };
  }, [thingId, selectedIoTDeviceId]);

  const isCurrentTarget = (target: IotReadinessTarget): boolean =>
    target.thingId === currentReadinessTarget.current.thingId &&
    target.deviceId === currentReadinessTarget.current.deviceId;

  // A mutation, not a disabled query with `refetch`: a repeat result equal
  // to the last one keeps the same query data reference, and the compile
  // must still start on every Upload click.
  const { data: iotUploadIsReady, mutate: checkIotUploadReady } = useMutation({
    mutationKey: ['iot-sketch-is-ready', thingId, selectedIoTDeviceId],

    mutationFn: (target: IotReadinessTarget) =>
      target.thingId && target.deviceId
        ? iotUploadReady(target.thingId, target.deviceId)
        : Promise.reject(
            'Cannot assert IoT upload readiness. No thingId or deviceId provided.',
          ),

    // Mutation-level, so it also runs when a device change resets the
    // observer during the check.
    onSettled: (_data, _error, target) => {
      if (readinessCheckInFlight.current === target) {
        readinessCheckInFlight.current = undefined;
      }
    },

    onError: (_error, target) => {
      if (!isCurrentTarget(target)) return;

      const msg = formatMessage(messages.iotUploadFailedUnknownIfReady);
      setOutput({
        stage: 'precompile',
        output: msg,
        stderr: msg,
        hasFailed: true,
      });
    },

    onSuccess: (data, target) => {
      if (!isCurrentTarget(target)) return;

      if (data.value === false) {
        const msg = formatMessage(getIotUploadNotReadyMsg(data));
        setOutput({
          stage: 'precompile',
          output: msg,
          stderr: msg,
          hasFailed: true,
        });

        return;
      }

      setOutput({
        stage: 'precompile',
        output: '',
        stdout: '',
        hasFailed: false,
      });

      if (!commandParams) return;

      const updatedCompilePayload = createUpdatedCompilePayload({
        fqbn: commandParams.selectedFqbn,
        sketchData: commandParams.initialSketchData,
        mainInoData: commandParams.initialInoData,
        isVerboseOutput: verboseCompile,
        filesData: commandParams.initialFilesData,
        isIot: true,
      });

      updatedCompilePayload.commandType = 'upload';
      updatedCompilePayload.shouldCache =
        !!commandParams.initialSketchData.fqbn || !!thingId;

      createCompilation(updatedCompilePayload);

      ga4Emitter({
        type: 'COMPILE',
        payload: { sketch_id: commandParams.initialSketchData.id },
      });
    },
  });

  // No upload flag is set until the compilation starts, so a second Upload
  // click during the readiness check would start a second compilation.
  const startIotUpload = useCallback(() => {
    const target = { thingId, deviceId: selectedIoTDeviceId };
    const running = readinessCheckInFlight.current;
    if (
      running &&
      running.thingId === target.thingId &&
      running.deviceId === target.deviceId
    ) {
      return;
    }

    readinessCheckInFlight.current = target;
    checkIotUploadReady(target);
  }, [checkIotUploadReady, selectedIoTDeviceId, thingId]);

  const onUploadError = useCallback(() => {
    const msg = formatMessage(messages.iotUploadRequestUnsuccessful);
    setOutput((prev) => ({
      ...prev,
      stage: 'upload',
      output: `${prev?.output ? `${prev.output}\n` : ''}${msg}`,
      stderr: `${prev?.stderr ? `${prev.stderr}\n` : ''}${msg}`,
      hasFailed: true,
    }));

    setIsPending(false);
  }, [formatMessage, setIsPending, setOutput]);

  const {
    data: otaUploadData,
    isPending: isCreating,
    reset: resetUpload,
    isError: uploadHasError,
    mutateAsync: newOtaUpload,
  } = useMutation({
    mutationKey: ['new-ota', iotUploadIsReady?.value],
    mutationFn: (payload: IotUploadPayload) => {
      return iotUploadIsReady?.value
        ? createOtaUpload(payload.deviceId, payload.binaryKey)
        : Promise.reject('Could not perform IoT upload, not ready.');
    },
    onError: onUploadError,
    onSuccess: (data: CreateOtaV1_Response | { errStatus: number }) => {
      if ('ota' in data) {
        const msg = formatMessage(messages.iotUploadRequestSuccessful);
        const timestamp = formatTimestamp(data.ota?.startedAt);
        setOutput((prev) => ({
          ...prev,
          stage: 'upload',
          output: `${
            prev?.output ? `${prev.output}\n` : ''
          }${timestamp} ${msg}`,
          stdout: `${
            prev?.stdout ? `${prev.stdout}\n` : ''
          }${timestamp} ${msg}`,
          hasFailed: false,
          otaStatus: data.ota?.status,
        }));

        //On success it sets OTA as pending
        setIsPending(true);
        setUploading(true);
        return;
      }

      if ('errStatus' in data) {
        if (data.errStatus === 409) {
          //409 Conflict means an Ota is already create, so we need to load it.
          checkOngoingOta();
          return;
        }
      }

      const msg = formatMessage(messages.iotUploadFailed);
      setOutput((prev) => ({
        ...prev,
        stage: 'upload',
        output: `${prev?.output ? `${prev.output}\n` : ''}${msg}`,
        stderr: `${prev?.stderr ? `${prev.stderr}\n` : ''}${msg}`,
        hasFailed: true,
        otaStatus: 'failed',
      }));
    },
  });

  const otaUploadReady = Boolean(otaUploadData || otaId);
  const currentOtaId =
    (otaUploadData && 'ota' in otaUploadData && otaUploadData?.ota?.id) ||
    otaId;

  const { mutate: abortPending, isPending: isAborting } = useMutation({
    mutationKey: ['abort-pending-iot-upload', currentOtaId],
    mutationFn: () => {
      return currentOtaId
        ? abortPendingOtaById(currentOtaId)
        : Promise.reject('No ID provided to abort pending OTA');
    },
    onSuccess(data) {
      let msg: string;

      if (data) {
        msg = formatMessage(messages.iotUploadAborted);
        const timestamp = formatTimestamp(data.ota?.endedAt);

        setOutput((prev) => ({
          ...prev,
          stage: 'upload',
          output: `${
            prev?.output ? `${prev.output}\n` : ''
          }${timestamp} ${msg}`,
          stdout: `${
            prev?.stdout ? `${prev.stdout}\n` : ''
          }${timestamp} ${msg}`,
          hasFailed: true,
          otaStatus: 'failed',
        }));
        setUploading(false);
        setIsPending(false);
        return;
      }
    },
    onError(error) {
      if (error && ((error as Error).cause as WretchError).status === 409) {
        return sendNotification({
          message: formatMessage(messages.notificationPendingFailed),
          mode: NotificationMode.Toast,
          type: NotificationType.Change,
          modeOptions: {
            toastType: ToastType.Passive,
            toastSize: ToastSize.Small,
          },
        });
      }

      sendNotification({
        message: formatMessage(messages.notificationFailed),
        mode: NotificationMode.Toast,
        type: NotificationType.Change,
        modeOptions: {
          toastType: ToastType.Passive,
          toastSize: ToastSize.Small,
        },
      });
    },
  });

  const { data: otaProgressData } = useQuery({
    queryKey: ['get-ota-progress', currentOtaId],
    queryFn: () => {
      return currentOtaId
        ? getOtaById(currentOtaId, { all_progress: true })
        : Promise.reject('No OTA ID provided.');
    },
    enabled: otaUploadReady && !!currentOtaId && isUploading && !isAborting,
    refetchInterval: (query) =>
      query.state.data?.ota?.status === 'pending' ? 1000 : 1500,
  });

  const clearOtaState = useCallback(() => {
    setOtaId(undefined);
    setIsPending(false);
    setUploading(false);
  }, [setIsPending, setUploading]);

  const verifyIoTSketchOnSuccess = useCallback(
    (data: CompileSketch_Result) => {
      normalizeOutput(data);
      if (selectedIoTDeviceId && data.otaKey && !data.failed) {
        newOtaUpload({
          deviceId: selectedIoTDeviceId,
          binaryKey: data.otaKey,
        });

        ga4Emitter({
          type: 'UPLOAD',
          payload: { sketch_id: commandParams?.initialSketchData.id || '' },
        });
      }
    },
    [
      commandParams?.initialSketchData.id,
      newOtaUpload,
      normalizeOutput,
      selectedIoTDeviceId,
    ],
  );

  // On getCompilationOutput, BE responds with extra_files on builderV2 instead of files like builderV1. On the function we modify the response
  const { data: compilationOutput, isFetching: isFetchingCompilationOutput } =
    useQuery({
      queryKey: ['get-compilation-output', createdSketchCompilation?.id],

      queryFn: () =>
        createdSketchCompilation?.id
          ? getCompilationOutput(createdSketchCompilation?.id)
          : Promise.reject(new Error('No sketch ID provided')),

      enabled: !!createdSketchCompilation?.id && enableGetOutput,
    });

  // One OTA request per compilation output. The effect also re-runs when
  // `verifyIoTSketchOnSuccess` changes (device selection), and cached output
  // must not start another upload then.
  const uploadedCompilationOutput = useRef<typeof compilationOutput>();

  useEffect(() => {
    if (!compilationOutput || !enableGetOutput) {
      return;
    }

    if (uploadedCompilationOutput.current === compilationOutput) {
      return;
    }

    uploadedCompilationOutput.current = compilationOutput;

    const derivatives = parseCompileData(
      compilationOutput.stdout,
      compilationOutput.stderr,
      createdSketchCompilation?.sketchName,
    );
    const result: CompileSketch_Result = {
      ...compilationOutput,
      ...derivatives,
    };
    verifyIoTSketchOnSuccess(result);
  }, [
    compilationOutput,
    enableGetOutput,
    verifyIoTSketchOnSuccess,
    createdSketchCompilation?.sketchName,
  ]);

  return {
    shouldCheckForOngoingOta,
    checkOngoingOta,
    startIotUpload,
    newOtaUpload,
    resetUpload,
    isCreating,
    uploadHasError,
    abortPending,
    clearOtaState,
    isFetchingCompilationOutput,
    otaProgressData,
  };
};

export const useIotUpload: UseIotUpload = function (
  verboseCompile: boolean,
  thingDeviceDetailsIsLoading: boolean,
  commandParams?: CommandParams,
  selectedIoTDeviceId?: string,
  thingId?: string,
): ReturnType<UseIotUpload> {
  const [output, setOutput] = useState<IotUploadOutput>();

  const [isPending, setIsPending] = useState<boolean>(false);
  const [isUploading, setUploading] = useState<boolean>(false);

  const normalizeOutput = useCallback((data: CompileSketch_Result): void => {
    const {
      output: compileOutput,
      stderr: _stderr,
      stdout: _stdout,
      failed,
      warnLineEnd,
      warnLineStart,
      outputLineEnd,
      settled,
    } = data;
    if (!compileOutput) return;

    const newLineRegEx = /\r\n|\r|\n/;
    setOutput((prev) => {
      // if prev stage was 'precompile', assign the prev strings vars here, and
      // then props in the output obj for concatenation with compile logs in subsequent
      // executions of this function.
      const prevStageWasPrecompile = prev?.stage === 'precompile';
      const preCompileOutput =
        prevStageWasPrecompile && prev.output ? prev.output : undefined;
      const preCompileStdout =
        prevStageWasPrecompile && prev.stdout ? prev.stdout : undefined;
      const preCompileStderr =
        prevStageWasPrecompile && prev.stderr ? prev.stderr : undefined;

      // Below we use the settled var to avoid calculating line counts if
      // compilation is not settled, the related props are not used
      // until after compile is complete.
      const preCompileOutputLines =
        settled && prev?.preCompileOutput
          ? prev?.preCompileOutput.split(newLineRegEx).length
          : 0;

      const stdout = settled
        ? _stdout &&
          `${
            prev?.preCompileStdout ? `${prev?.preCompileStdout}\n` : ''
          }${_stdout}`
        : prev?.stdout;

      const stderr = settled
        ? _stderr &&
          `${
            prev?.preCompileStderr ? `${prev?.preCompileStderr}\n` : ''
          }${_stderr}`
        : prev?.stderr;

      const preCompileOutputWithNewLine =
        prevStageWasPrecompile && preCompileOutput ? `${prev.output}\n` : '';

      return {
        stage: 'compile',
        output: `${preCompileOutputWithNewLine}${compileOutput}`,
        preCompileOutput,
        stdout,
        preCompileStdout,
        stderr,
        preCompileStderr,
        warnLineStart: warnLineStart
          ? warnLineStart + preCompileOutputLines
          : warnLineStart,
        warnLineEnd: warnLineEnd
          ? warnLineEnd + preCompileOutputLines
          : warnLineEnd,
        compileOutputLineEnd: outputLineEnd
          ? outputLineEnd + preCompileOutputLines
          : outputLineEnd,
        hasFailed: failed,
      };
    });
  }, []);

  const {
    isVerifying,
    reset: resetVerify,
    compileSketchResponseData,
    createdSketchCompilation,
    compileProgress,
    createCompilation,
    compileResultMessages,
    errorFiles,
  } = useVerifySketch();

  const {
    startIotUpload,
    isCreating,
    resetUpload,
    uploadHasError,
    abortPending,
    otaProgressData,
    clearOtaState,
    shouldCheckForOngoingOta,
    isFetchingCompilationOutput,
  } = useIotUploadQueries(
    isUploading,
    thingDeviceDetailsIsLoading,
    verboseCompile,
    setOutput,
    normalizeOutput,
    setIsPending,
    setUploading,
    createCompilation,
    thingId,
    selectedIoTDeviceId,
    commandParams,
    !isVerifying &&
      compileSketchResponseData?.settled &&
      !compileSketchResponseData?.failed,
    createdSketchCompilation,
  );

  useIotUploadData(setOutput, setIsPending, setUploading, otaProgressData);

  // On compileSketchResponse change update the output
  useEffect(() => {
    if (!compileSketchResponseData) return;
    normalizeOutput(compileSketchResponseData);
  }, [compileSketchResponseData, normalizeOutput]);

  return {
    startIotUpload,
    isVerifying,
    isUploading,
    isPending,
    abortPending,
    isCreating: isCreating || isFetchingCompilationOutput,
    uploadHasError,
    resetUpload,
    resetVerify,
    output,
    setOutput,
    compileErrors: compileSketchResponseData?.errors,
    clearOtaState,
    shouldCheckForOngoingOta,
    compileProgress,
    uploadOutputPostCompileLineStart: output?.compileOutputLineEnd
      ? output.compileOutputLineEnd + 1
      : undefined,
    compileResultMessages,
    errorFiles,
  };
};

function getIotUploadNotReadyMsg(iotUploadIsNotReady: {
  value: false;
  reason: UploadIotSketchNotReadyError;
}): MessageDescriptor {
  const iotUploadNotReadyReason =
    !iotUploadIsNotReady?.value && iotUploadIsNotReady?.reason;

  let message = messages.iotUploadFailed;
  if (!iotUploadNotReadyReason) return message;

  switch (iotUploadNotReadyReason) {
    case UploadIotSketchNotReadyError.UpdateRequired:
      message = messages.iotUploadNinaUpdateRequired;
      break;
    case UploadIotSketchNotReadyError.WrongDevice:
      message = messages.iotUploadWrongDevice;
      break;
    case UploadIotSketchNotReadyError.OTAUnavailable:
      message = messages.iotUploadOTAUnavailable;
      break;
    case UploadIotSketchNotReadyError.OTAIncompatible:
      message = messages.iotUploadOTAIncompatible;
      break;
  }

  return message;
}

type UseIotCertificateCheck = (
  uploadCommand: () => void,
  refreshThingDeviceDetails: () => void,
  thingId?: string,
  thingPropertiesPath?: string,
  thingSketchSecretsTS?: string,
  thingSketchFileContentTS?: string,
  bypassUpload?: boolean,
) => {
  checkThingCert: UseMutateFunction<
    CheckThingCert_Response,
    unknown,
    void,
    void
  >;
  cancel: () => void;
  isLoading: boolean;
  isMigrating: boolean;
};

export const useIotCertificateCheck: UseIotCertificateCheck = function (
  uploadCommand: () => void,
  refreshThingDeviceDetails: () => void,
  thingId?: string,
  thingPropertiesPath?: string,
  thingSketchSecretsTS?: string,
  thingSketchFileContentTS?: string,
  bypassUpload?: boolean,
): ReturnType<UseIotCertificateCheck> {
  const { formatMessage } = useI18n();

  const [isMigrating, setIsMigrating] = useState<boolean>(false);

  const [secretsBeforeThingCertCheck, setSecretsBeforeThingCertCheck] =
    useState<string>();
  const [contentBeforeThingCertCheck, setContentBeforeThingCertCheck] =
    useState<string>();
  const [secretsAfterThingCertCheck, setSecretsAfterThingCertCheck] =
    useState<string>();
  const [contentAfterThingCertCheck, setContentAfterThingCertCheck] =
    useState<string>();

  const {
    mutate,
    reset,
    isPending: isLoading,
    isError,
    data,
  } = useMutation({
    mutationKey: ['check-device-cert', thingId, thingPropertiesPath],
    onMutate: () => {
      setSecretsBeforeThingCertCheck(thingSketchSecretsTS);
      setContentBeforeThingCertCheck(thingSketchFileContentTS);
      setIsMigrating(true);
    },
    mutationFn: () => {
      return thingId && thingPropertiesPath
        ? checkThingCert(thingId)
        : Promise.reject('No thingId provided');
    },
    onSuccess: (data) => {
      const sketchRefreshRequired = data.requiredAction === 'RELOAD_SKETCH';
      if (sketchRefreshRequired) {
        refreshSketch();
        thingPropertiesPath && refreshFilesContents([thingPropertiesPath]);
      }
      refreshThingDeviceDetails();
    },
    onError: () => {
      sendNotification({
        message: formatMessage(messages.iotCertCheckFailed),
        mode: NotificationMode.Toast,
        type: NotificationType.Change,
        modeOptions: {
          toastType: ToastType.Passive,
          toastSize: ToastSize.Regular,
        },
      });
    },
  });

  const clearCertCheck = useCallback(() => {
    reset();
    setIsMigrating(false);
    setSecretsBeforeThingCertCheck(undefined);
    setContentBeforeThingCertCheck(undefined);
    setSecretsAfterThingCertCheck(undefined);
    setContentAfterThingCertCheck(undefined);
  }, [reset]);

  useEffect(() => {
    const sketchRefreshRequired = data?.requiredAction === 'RELOAD_SKETCH';
    if (sketchRefreshRequired && !isError) {
      setSecretsAfterThingCertCheck(thingSketchSecretsTS);
      setContentAfterThingCertCheck(thingSketchFileContentTS);
    }
  }, [data, isError, thingSketchFileContentTS, thingSketchSecretsTS]);

  useEffect(() => {
    if (isError) {
      clearCertCheck();
      return;
    }

    const opNotInProgress = !bypassUpload && !isLoading;

    const sketchRefreshWasNotTriggered = data?.requiredAction === 'NONE';

    const dataToCompareIsAvailable =
      secretsBeforeThingCertCheck &&
      contentBeforeThingCertCheck &&
      secretsAfterThingCertCheck &&
      contentAfterThingCertCheck;

    const secretsAndContentHaveChanged =
      secretsBeforeThingCertCheck !== secretsAfterThingCertCheck &&
      contentBeforeThingCertCheck !== contentAfterThingCertCheck;

    if (
      opNotInProgress &&
      data &&
      (sketchRefreshWasNotTriggered ||
        (dataToCompareIsAvailable && secretsAndContentHaveChanged))
    ) {
      clearCertCheck();
      uploadCommand();
    }
  }, [
    bypassUpload,
    clearCertCheck,
    contentAfterThingCertCheck,
    contentBeforeThingCertCheck,
    data,
    isError,
    isLoading,
    secretsAfterThingCertCheck,
    secretsBeforeThingCertCheck,
    uploadCommand,
  ]);

  return {
    checkThingCert: mutate,
    cancel: clearCertCheck,
    isLoading,
    isMigrating,
  };
};
