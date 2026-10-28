import { TerminalInfo } from '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab';

export type { TerminalInfo };

export type TerminalCatalog = {
  // supported is false on the platforms where the terminal emulator is fixed
  // (Windows and macOS), in that case the user cannot pick one.
  supported: boolean;
  // terminals are the detected terminal emulators, in the order they are tried.
  terminals: TerminalInfo[];
};

export interface TerminalService {
  // listTerminals returns the terminal emulators available on the system.
  listTerminals(): Promise<TerminalCatalog>;
  // getTerminalPreference returns the terminal selected by the user, an empty
  // value means that the terminal is detected automatically.
  getTerminalPreference(): Promise<string>;
  // setTerminalPreference persists the terminal selected by the user, an empty
  // value restores the automatic detection.
  setTerminalPreference(value: string): Promise<void>;
}
