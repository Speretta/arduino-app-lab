import { defineMessages } from 'react-intl';

export const messages = defineMessages({
  updateAvailable: {
    id: 'footer.update-available',
    defaultMessage: 'New App Lab version! Update now',
    description: 'Label for the update available notification',
  },
  updateAvailableTooltip: {
    id: 'footer.update-available-tooltip',
    defaultMessage: 'Version {v} is available. Click to update.',
    description: 'Label for the update available tooltip',
  },
  cpu: {
    id: 'footer.cpu',
    defaultMessage: 'CPU: {used}%',
    description: 'Label for the cpu used percentage',
  },
  npu: {
    id: 'footer.npu',
    defaultMessage: 'NPU: {used}%',
    description: 'Label for the npu used percentage',
  },
  memory: {
    id: 'footer.memory',
    defaultMessage: 'RAM: {used} used of {total} GB',
    description: 'Label for the memory usage',
  },
  disk: {
    id: 'footer.disk',
    defaultMessage: '{path}: {used}/{total} GB',
    description: 'Label for the disk space usage',
  },
});
