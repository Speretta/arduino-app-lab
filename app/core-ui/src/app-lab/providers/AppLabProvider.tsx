import { SnackbarProvider } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { HelmetProvider } from 'react-helmet-async';

import QueryProvider from '../../common/providers/data-fetching/QueryProvider';
import { I18nProvider } from '../../common/providers/i18n/I18nContextProvider';
import { BoardResourcesStream } from '../hooks/useBoardResourcesStream';
import { BoardScopedQueryReset } from '../hooks/useBoardScopedQueryReset';
import { OpenFilesGarbageCollector } from '../hooks/useOpenFilesGarbageCollector';
import AiModelsContextProvider from './ai-models/AiModelsContextProvider';
import AuthContextProvider from './auth/AuthContextProvider';
import BoardConfigurationContextProvider from './board-configuration/BoardConfigurationContextProvider';
import CloudConnectorContextProvider from './cloud-connector/CloudConnectorContextProvider';
import EdgeImpulseContextProvider from './edge-impulse/EdgeImpulseContextProvider';
import FooterNotificationsContextProvider from './footer-notifications/FooterNotificationsContextProvider';
import LanguageServerContextProvider from './language-server/LanguageServerContextProvider';
import LinuxCredentialsContextProvider from './linux-credentials/LinuxCredentialsContextProvider';
import NetworkContextProvider from './network/NetworkContextProvider';
import PublishContextProvider from './publish/PublishContextProvider';
import ReleaseContextProvider from './release/ReleaseContextProvider';
import RuntimeContextProvider from './runtime/runtimeContextProvider';
import SetupContextProvider from './setup/SetupContextProvider';
import AppLabThemeProvider from './theme/AppLabThemeProvider';
import UpdaterContextProvider from './updater/UpdaterContextProvider';

interface AppLabProviderProps {
  children?: React.ReactNode;
}

const AppLabProvider: React.FC<AppLabProviderProps> = (
  props: AppLabProviderProps,
) => {
  const { children } = props;

  return (
    <DndProvider backend={HTML5Backend}>
      <QueryProvider>
        <BoardScopedQueryReset />
        <BoardResourcesStream />
        <OpenFilesGarbageCollector />
        <I18nProvider>
          <FooterNotificationsContextProvider>
            <EdgeImpulseContextProvider>
              <AuthContextProvider>
                <SetupContextProvider>
                  <BoardConfigurationContextProvider>
                    <NetworkContextProvider>
                      <LinuxCredentialsContextProvider>
                        <AiModelsContextProvider>
                          <RuntimeContextProvider>
                            <UpdaterContextProvider>
                              <CloudConnectorContextProvider>
                                <LanguageServerContextProvider>
                                  <AppLabThemeProvider>
                                    <SnackbarProvider />
                                    <PublishContextProvider>
                                      <ReleaseContextProvider>
                                        <HelmetProvider>
                                          {children}
                                        </HelmetProvider>
                                      </ReleaseContextProvider>
                                    </PublishContextProvider>
                                  </AppLabThemeProvider>
                                </LanguageServerContextProvider>
                              </CloudConnectorContextProvider>
                            </UpdaterContextProvider>
                          </RuntimeContextProvider>
                        </AiModelsContextProvider>
                      </LinuxCredentialsContextProvider>
                    </NetworkContextProvider>
                  </BoardConfigurationContextProvider>
                </SetupContextProvider>
              </AuthContextProvider>
            </EdgeImpulseContextProvider>
          </FooterNotificationsContextProvider>
        </I18nProvider>
      </QueryProvider>
    </DndProvider>
  );
};

export default AppLabProvider;
