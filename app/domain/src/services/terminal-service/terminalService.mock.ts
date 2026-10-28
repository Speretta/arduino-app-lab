import type { TerminalCatalog, TerminalService } from './terminal-service.type';

const mockTerminals: TerminalCatalog = {
  supported: true,
  terminals: [
    { id: 'alacritty', label: 'Alacritty', path: '/usr/bin/alacritty' },
    { id: 'ghostty', label: 'Ghostty', path: '/usr/bin/ghostty' },
  ],
};

let preference = '';

export const MockTerminalService: TerminalService = {
  async listTerminals(): Promise<TerminalCatalog> {
    return { ...mockTerminals, terminals: [...mockTerminals.terminals] };
  },

  async getTerminalPreference(): Promise<string> {
    return preference;
  },

  async setTerminalPreference(value: string): Promise<void> {
    preference = value;
  },
};
