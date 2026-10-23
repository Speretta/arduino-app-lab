import { Banner } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';
import { useMemo } from 'react';

import { PublishContext } from './publishContext';
import { usePublish } from './publishContextProvider.logic';

interface PublishContextProviderProps {
  children?: React.ReactNode;
}

const PublishContextProvider: React.FC<PublishContextProviderProps> = (
  props: PublishContextProviderProps,
) => {
  const { children } = props;
  const { bannerProps, startPublish } = usePublish();

  const contextValue = useMemo(() => ({ startPublish }), [startPublish]);

  return (
    <PublishContext.Provider value={contextValue}>
      {bannerProps ? <Banner {...bannerProps} /> : null}
      {children}
    </PublishContext.Provider>
  );
};

export default PublishContextProvider;
