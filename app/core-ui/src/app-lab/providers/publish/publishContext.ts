import { createContext } from 'react';

import { UsePublish } from './publishContextProvider.logic';

export type PublishContextValue = Omit<ReturnType<UsePublish>, 'bannerProps'>;

const PublishContextValue: PublishContextValue = {} as PublishContextValue;

export const PublishContext =
  createContext<PublishContextValue>(PublishContextValue);
