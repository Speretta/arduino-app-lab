import {
  Banner,
  BuildLogDialog,
  BuildLogDialogLogic,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useCallback, useMemo } from 'react';
import { useCopyToClipboard } from 'react-use';

import styles from './release-context-provider.module.scss';
import { ReleaseContext, ReleaseContextValue } from './releaseContext';
import { useRelease } from './releaseContextProvider.logic';

interface ReleaseContextProviderProps {
  children?: React.ReactNode;
}

// Owns the corner cards for builds and dependency downloads, so a job keeps
// running and reporting after the dialog that started it has closed.
const ReleaseContextProvider: React.FC<ReleaseContextProviderProps> = ({
  children,
}: ReleaseContextProviderProps) => {
  const {
    bannerProps,
    buildLog,
    setBuildLog,
    startReleaseBuild,
    isBuildingApp,
    startPreparation,
  } = useRelease();
  const [, copyToClipboard] = useCopyToClipboard();

  const contextValue = useMemo(
    (): ReleaseContextValue => ({
      startReleaseBuild,
      isBuildingApp,
      startPreparation,
    }),
    [startReleaseBuild, isBuildingApp, startPreparation],
  );

  const buildLogDialogLogic = useCallback(
    (): ReturnType<BuildLogDialogLogic> => ({
      open: !!buildLog,
      lines: buildLog ?? [],
      onCopy: (): void =>
        copyToClipboard((buildLog ?? []).map((line) => line.text).join('\n')),
      onOpenChange: (open): void => {
        if (!open) setBuildLog(undefined);
      },
    }),
    [buildLog, copyToClipboard, setBuildLog],
  );

  return (
    <ReleaseContext.Provider value={contextValue}>
      {bannerProps.length > 0 ? (
        <div className={styles['stack']}>
          {bannerProps.map((banner) => (
            <Banner
              key={banner.title}
              {...banner}
              className={styles['stacked']}
            />
          ))}
        </div>
      ) : null}
      <BuildLogDialog logic={buildLogDialogLogic} />
      {children}
    </ReleaseContext.Provider>
  );
};

export default ReleaseContextProvider;
