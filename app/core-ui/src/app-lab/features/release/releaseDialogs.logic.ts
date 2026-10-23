import { AppInfo } from '@cloud-editor-mono/infrastructure';
import {
  CreateReleaseDialogLogic,
  CreateReleaseIntroDialogLogic,
  ReleaseDraft,
  useI18n,
} from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { get, set } from 'idb-keyval';
import { useCallback, useContext, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { RELEASE_INTRO_ACKNOWLEDGED } from '../../constants';
import { ReleaseContext } from '../../providers/release/releaseContext';
import { RuntimeContext } from '../../providers/runtime/runtimeContext';
import { useBoardLifecycleStore } from '../../store/boardLifecycle';
import { useReleaseDialogStore } from '../../store/releaseDialog';
import { releaseMessages } from './messages';
import {
  boardReleaseTarget,
  RELEASE_TARGETS,
  releaseDisplayName,
  releaseFileName,
} from './releaseApp';

type UseCreateReleaseTrigger = () => {
  openCreateRelease: (app: AppInfo) => void;
  // Set for an App that already has a release being built: the action stays in
  // the menu, disabled, with this as its explanation.
  disabledReason: (appId?: string) => string | undefined;
};

// The entry point shared by the app list and the app detail header. It decides
// between the one-time explainer and the form, so neither caller has to.
export const useCreateReleaseTrigger: UseCreateReleaseTrigger = () => {
  const { formatMessage } = useI18n();
  const { isBuildingApp } = useContext(ReleaseContext);
  const openFor = useReleaseDialogStore((state) => state.openFor);

  const openCreateRelease = useCallback(
    (app: AppInfo): void => {
      if (app.id && isBuildingApp?.(app.id)) return;
      void get(RELEASE_INTRO_ACKNOWLEDGED).then((acknowledged) =>
        openFor(app, Boolean(acknowledged)),
      );
    },
    [isBuildingApp, openFor],
  );

  const disabledReason = useCallback(
    (appId?: string): string | undefined =>
      appId && isBuildingApp?.(appId)
        ? formatMessage(releaseMessages.createReleaseBusy)
        : undefined,
    [formatMessage, isBuildingApp],
  );

  return {
    openCreateRelease,
    disabledReason,
  };
};

export const useCreateReleaseIntroDialogLogic =
  (): CreateReleaseIntroDialogLogic => {
    const { open, step, setOpen, showForm } = useReleaseDialogStore(
      useShallow((state) => ({
        open: state.open,
        step: state.step,
        setOpen: state.setOpen,
        showForm: state.showForm,
      })),
    );
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const onContinue = useCallback((): void => {
      if (dontShowAgain) {
        void set(RELEASE_INTRO_ACKNOWLEDGED, true);
      }
      showForm();
    }, [dontShowAgain, showForm]);

    return () => ({
      open: open && step === 'intro',
      dontShowAgain,
      setDontShowAgain,
      onContinue,
      onOpenChange: setOpen,
    });
  };

export const useCreateReleaseDialogLogic = (): CreateReleaseDialogLogic => {
  const { startReleaseBuild } = useContext(ReleaseContext);
  // The stored App is a snapshot from when the form opened; the running App is live.
  const { appsStatus } = useContext(RuntimeContext);
  const { app, open, step, setOpen } = useReleaseDialogStore(
    useShallow((state) => ({
      app: state.app,
      open: state.open,
      step: state.step,
      setOpen: state.setOpen,
    })),
  );
  const boardFqbn = useBoardLifecycleStore(
    (state) => state.selectedConnectedBoard?.fqbn,
  );

  // The form stays up for as long as the build is copying the source App, so
  // the App cannot be edited out from under the copy. The corner card takes the
  // job over once the copy is done.
  const confirmAction = useCallback(
    async (draft: ReleaseDraft): Promise<boolean> => {
      if (!app?.id) return false;
      const appName = app.name ?? '';
      await startReleaseBuild({
        appId: app.id,
        releaseName: releaseDisplayName(appName, draft.createdAt),
        fileName: releaseFileName(appName, draft.createdAt, draft.label),
        body: {
          target: draft.target,
          include_data: draft.includeData,
          notes: draft.note,
          release_label: draft.label,
        },
      });
      return true;
    },
    [app?.id, app?.name, startReleaseBuild],
  );

  return () => ({
    open: open && step === 'form',
    app,
    targets: RELEASE_TARGETS,
    defaultTarget: boardReleaseTarget(boardFqbn),
    appIsRunning: !!app?.id && appsStatus?.runningApp?.id === app.id,
    confirmAction,
    onOpenChange: setOpen,
  });
};
