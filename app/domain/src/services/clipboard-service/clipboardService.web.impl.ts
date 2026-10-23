import { Config } from '@cloud-editor-mono/common';

export const readText = async (): Promise<string | null> => {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
};

export const writeText = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    if (Config.MODE === 'development') {
      console.error('Failed to write to clipboard:', error);
    }
  }
};
