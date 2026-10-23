import { createContext } from 'react';

import { UseRelease } from './releaseContextProvider.logic';

export type ReleaseContextValue = Omit<
  ReturnType<UseRelease>,
  'bannerProps' | 'buildLog' | 'setBuildLog'
>;

const defaultValue: ReleaseContextValue = {} as ReleaseContextValue;

export const ReleaseContext = createContext<ReleaseContextValue>(defaultValue);
