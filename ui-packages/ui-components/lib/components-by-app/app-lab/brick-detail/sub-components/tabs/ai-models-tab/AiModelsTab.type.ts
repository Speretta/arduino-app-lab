import { BrickDetailLogic } from '../../../BrickDetail.type';

export type BrickModelActions = Pick<
  ReturnType<BrickDetailLogic>,
  | 'diskUsageWarning'
  | 'downloadEIModel'
  | 'downloadGenericModel'
  | 'getDownloadInfo'
  | 'removeModel'
  | 'openModelPage'
  | 'isModelUninstalling'
  | 'isModelInstalledInApp'
>;
