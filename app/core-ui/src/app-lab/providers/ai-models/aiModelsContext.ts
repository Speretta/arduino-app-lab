import { AIModelItem, EIProject } from '@cloud-editor-mono/infrastructure';
import { ModelDownloadInfo } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { createContext, useContext } from 'react';

export type DownloadAIModelSSEOptions = {
  progressKey?: string;
  // Only for a user-linked download: the brick whose detail asked for it,
  // recorded once the download starts.
  linkedBrickId?: string;
  onStarted?: () => void;
  onError?: (error: Error) => void;
};

export type AiModelsContextValue = {
  currentDownloads: { [projectId: string]: ModelDownloadInfo } | null;
  clearDownload: (progressId: string) => void;
  installedModels: AIModelItem[];
  getInstalledModel: (
    modelId: string,
    impulseId?: string,
  ) => AIModelItem | undefined;
  getEIProjectsByBrickType: (brickType: string) => EIProject[];
  downloadImpulse: (
    projectId: string,
    impulseId: string,
  ) => Promise<AIModelItem>;
  enabledEIAutoRefresh: (enabled: boolean) => void;
  openAndAssociateToDevice: () => void;
  isModelOutdated: (modelId: string) => boolean;
  installAIModelSSE: (
    declaredId: string,
    options?: DownloadAIModelSSEOptions,
  ) => Promise<AIModelItem | undefined>;
  downloadAIModelSSE: (
    source: string,
    options?: DownloadAIModelSSEOptions & { mmprojUrl?: string },
  ) => Promise<AIModelItem | undefined>;
};

export const AiModelsContext = createContext<AiModelsContextValue | undefined>(
  undefined,
);

export const useAiModels = (): AiModelsContextValue => {
  const context = useContext(AiModelsContext);

  if (!context) {
    throw new Error(
      'useAiModels must be used within an AiModelsContextProvider',
    );
  }

  return context;
};
