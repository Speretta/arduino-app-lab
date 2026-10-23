import { Config } from '@cloud-editor-mono/common';

import { ClipboardGetText, ClipboardSetText } from '../../wailsjs/runtime';

export const readText = async (): Promise<string | null> => {
  try {
    return await ClipboardGetText();
  } catch {
    return null;
  }
};

export const writeText = async (text: string): Promise<void> => {
  try {
    await ClipboardSetText(text);
  } catch (error) {
    if (Config.MODE === 'development') {
      console.error('Failed to write to clipboard:', error);
    }
  }
};
