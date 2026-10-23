import * as domain from '@cloud-editor-mono/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { CommandParams } from '../../../cloud-editor/features/main/main.type';
import { useIotUploadQueries } from './iot';

vi.mock('@cloud-editor-mono/domain', async () => {
  const mod = await vi.importActual<typeof import('@cloud-editor-mono/domain')>(
    '@cloud-editor-mono/domain',
  );

  return {
    ...mod,
    getAccessToken: vi.fn(),
    getAuthAccessToken: vi.fn(),
    createOtaUpload: vi.fn(),
    ga4Emitter: vi.fn(),
    getCompilationOutput: vi.fn(),
    iotUploadReady: vi.fn(),
    listDeviceOTA: vi.fn(),
  };
});

vi.mock('../../../cloud-editor/features/main/utils', async () => {
  const mod = await vi.importActual<
    typeof import('../../../cloud-editor/features/main/utils')
  >('../../../cloud-editor/features/main/utils');

  return {
    ...mod,
    createUpdatedCompilePayload: vi.fn(() => ({
      fqbn: 'arduino:samd:mkrwifi1010',
      sketch: { name: 'iot_sketch' },
    })),
  };
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <IntlProvider locale="en">{children}</IntlProvider>
  </QueryClientProvider>
);

const THING_ID = 'thing-id';
const DEVICE_ID = 'device-id';

const commandParams = {
  selectedFqbn: 'arduino:samd:mkrwifi1010',
  initialSketchData: { id: 'sketch-id', fqbn: 'arduino:samd:mkrwifi1010' },
  initialInoData: { path: 'sketch/sketch.ino' },
  initialFilesData: [],
} as unknown as CommandParams;

function renderIotUploadQueries(): {
  createCompilation: ReturnType<typeof vi.fn>;
  setOutput: ReturnType<typeof vi.fn>;
  result: ReturnType<
    typeof renderHook<ReturnType<typeof useIotUploadQueries>, unknown>
  >['result'];
} {
  const createCompilation = vi.fn();
  const setOutput = vi.fn();

  const { result } = renderHook(
    () =>
      useIotUploadQueries(
        false,
        false,
        false,
        setOutput,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        createCompilation,
        THING_ID,
        DEVICE_ID,
        commandParams,
        false,
        undefined,
      ),
    { wrapper },
  );

  return { createCompilation, setOutput, result };
}

describe('IoT upload hooks', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(domain.listDeviceOTA).mockResolvedValue({ ota: [] });
  });

  afterEach(() => {
    vi.mocked(domain.iotUploadReady).mockReset();
    vi.mocked(domain.listDeviceOTA).mockReset();
    vi.mocked(domain.ga4Emitter).mockReset();
    vi.mocked(domain.getCompilationOutput).mockReset();
    vi.mocked(domain.createOtaUpload).mockReset();
  });

  describe('call startIotUpload', () => {
    describe('when the device is ready', () => {
      beforeEach(() => {
        vi.mocked(domain.iotUploadReady).mockResolvedValue({ value: true });
      });

      it('should start a compilation on every call', async () => {
        const { createCompilation, result } = renderIotUploadQueries();

        await act(async () => {
          result.current.startIotUpload();
        });
        await waitFor(() => expect(createCompilation).toHaveBeenCalledTimes(1));

        await act(async () => {
          result.current.startIotUpload();
        });
        await waitFor(() => expect(createCompilation).toHaveBeenCalledTimes(2));

        expect(domain.iotUploadReady).toHaveBeenCalledTimes(2);
        expect(domain.iotUploadReady).toHaveBeenCalledWith(THING_ID, DEVICE_ID);
        expect(createCompilation).toHaveBeenLastCalledWith(
          expect.objectContaining({ commandType: 'upload' }),
        );
      });

      it('should ignore a second call while the readiness check is in flight', async () => {
        let resolveReady: (result: { value: true }) => void = () => undefined;
        vi.mocked(domain.iotUploadReady).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveReady = resolve;
            }),
        );

        const { createCompilation, result } = renderIotUploadQueries();

        await act(async () => {
          result.current.startIotUpload();
        });
        await act(async () => {
          result.current.startIotUpload();
        });

        await act(async () => {
          resolveReady({ value: true });
        });
        await waitFor(() => expect(createCompilation).toHaveBeenCalledTimes(1));

        expect(domain.iotUploadReady).toHaveBeenCalledTimes(1);
      });

      it('should not compile for a device that was switched away from during the check', async () => {
        const resolvers: ((result: { value: true }) => void)[] = [];
        vi.mocked(domain.iotUploadReady).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolvers.push(resolve);
            }),
        );
        const createCompilation = vi.fn();

        const { result, rerender } = renderHook(
          ({ deviceId }: { deviceId: string }) =>
            useIotUploadQueries(
              false,
              false,
              false,
              vi.fn(),
              vi.fn(),
              vi.fn(),
              vi.fn(),
              createCompilation,
              THING_ID,
              deviceId,
              commandParams,
              false,
              undefined,
            ),
          { wrapper, initialProps: { deviceId: DEVICE_ID } },
        );

        await act(async () => {
          result.current.startIotUpload();
        });
        rerender({ deviceId: 'other-device' });

        await act(async () => {
          resolvers[0]({ value: true });
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(createCompilation).not.toHaveBeenCalled();

        await act(async () => {
          result.current.startIotUpload();
        });
        expect(domain.iotUploadReady).toHaveBeenLastCalledWith(
          THING_ID,
          'other-device',
        );
        await act(async () => {
          resolvers[1]({ value: true });
        });
        await waitFor(() => expect(createCompilation).toHaveBeenCalledTimes(1));
      });
    });

    describe('when the readiness check fails', () => {
      beforeEach(() => {
        vi.mocked(domain.iotUploadReady).mockRejectedValue(new Error('down'));
      });

      it('should report the failure on every call and not compile', async () => {
        const { createCompilation, setOutput, result } =
          renderIotUploadQueries();

        const failedOutputs = (): number =>
          setOutput.mock.calls.filter(([output]) => output?.hasFailed === true)
            .length;

        await act(async () => {
          result.current.startIotUpload();
        });
        await waitFor(() => expect(failedOutputs()).toBe(1));

        await act(async () => {
          result.current.startIotUpload();
        });
        await waitFor(() => expect(failedOutputs()).toBe(2));

        expect(createCompilation).not.toHaveBeenCalled();
      });
    });
  });

  describe('when the OTA upload request fails', () => {
    it('should report the failure and stop the pending state', async () => {
      vi.mocked(domain.iotUploadReady).mockResolvedValue({ value: true });
      vi.mocked(domain.createOtaUpload).mockRejectedValue(new Error('down'));
      const setOutput = vi.fn();
      const setIsPending = vi.fn();

      const { result } = renderHook(
        () =>
          useIotUploadQueries(
            false,
            false,
            false,
            setOutput,
            vi.fn(),
            setIsPending,
            vi.fn(),
            vi.fn(),
            THING_ID,
            DEVICE_ID,
            commandParams,
            false,
            undefined,
          ),
        { wrapper },
      );

      await act(async () => {
        result.current.startIotUpload();
      });
      await waitFor(() => expect(domain.iotUploadReady).toHaveBeenCalled());

      await act(async () => {
        await result.current
          .newOtaUpload({ deviceId: DEVICE_ID, binaryKey: 'ota-key' })
          .catch(() => undefined);
      });

      const uploadOutputs = setOutput.mock.calls
        .map(([output]) =>
          typeof output === 'function' ? output(undefined) : output,
        )
        .filter((output) => output?.stage === 'upload');
      expect(uploadOutputs).toEqual([
        expect.objectContaining({ hasFailed: true, stage: 'upload' }),
      ]);
      expect(uploadOutputs[0].output).not.toBe('');
      expect(setIsPending).toHaveBeenCalledWith(false);
    });
  });

  describe('when the compilation output is retrieved', () => {
    const compilation = { id: 'compilation-id', sketchName: 'iot_sketch' };

    beforeEach(() => {
      vi.mocked(domain.iotUploadReady).mockResolvedValue({ value: true });
      vi.mocked(domain.getCompilationOutput).mockResolvedValue({
        name: 'iot_sketch',
        otaKey: 'ota-key',
      } as unknown as Awaited<ReturnType<typeof domain.getCompilationOutput>>);
      vi.mocked(domain.createOtaUpload).mockResolvedValue({
        ota: { id: 'ota-id', status: 'pending' },
      } as unknown as Awaited<ReturnType<typeof domain.createOtaUpload>>);
    });

    it('should request one OTA upload per output, also after the device changes', async () => {
      const normalizeOutput = vi.fn();

      const { result, rerender } = renderHook(
        ({
          deviceId,
          enableGetOutput,
        }: {
          deviceId: string;
          enableGetOutput: boolean;
        }) =>
          useIotUploadQueries(
            false,
            false,
            false,
            vi.fn(),
            normalizeOutput,
            vi.fn(),
            vi.fn(),
            vi.fn(),
            THING_ID,
            deviceId,
            commandParams,
            enableGetOutput,
            compilation,
          ),
        {
          wrapper,
          initialProps: { deviceId: DEVICE_ID, enableGetOutput: false },
        },
      );

      await act(async () => {
        result.current.startIotUpload();
      });
      await waitFor(() => expect(domain.iotUploadReady).toHaveBeenCalled());

      rerender({ deviceId: DEVICE_ID, enableGetOutput: true });

      await waitFor(() =>
        expect(domain.createOtaUpload).toHaveBeenCalledTimes(1),
      );
      expect(domain.createOtaUpload).toHaveBeenCalledWith(DEVICE_ID, 'ota-key');
      expect(normalizeOutput).toHaveBeenCalledTimes(1);

      rerender({ deviceId: 'other-device', enableGetOutput: true });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(domain.createOtaUpload).toHaveBeenCalledTimes(1);
      expect(normalizeOutput).toHaveBeenCalledTimes(1);
      expect(domain.getCompilationOutput).toHaveBeenCalledTimes(1);
    });
  });
});
