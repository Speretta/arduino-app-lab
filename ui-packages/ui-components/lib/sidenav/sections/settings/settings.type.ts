import { MessageDescriptor } from 'react-intl';
import { ValueOf } from 'type-fest';

export enum SettingsItemId {
  Appearance = 'Appearance',
  Sketch = 'Sketch',
  Device = 'Device',
  VerifyAndUpload = 'VerifyAndUpload',
}

export interface SettingsItem {
  label: MessageDescriptor;
  Icon: React.FC;
}

export type SettingsItemRecord = Record<SettingsItemId, SettingsItem>;

export type SettingsItemWithId = SettingsItem & { id: SettingsItemId };

export type SettingsSections = {
  [Property in SettingsItemId]: () => JSX.Element;
};

export interface SettingsSection<T extends SettingsItemWithId> {
  item: T;
  render: SettingsSections[T['id']];
}

export enum Preferences {
  FontSize = 'fontSize',
  AutoSave = 'autoSave',
  SaveOnVerifyingUploading = 'saveOnVerifyingUploading',
  BoardAutoSelection = 'boardAutoSelection',
  ConsoleOutput = 'consoleOutput',
}

export enum ConsoleOutput {
  Concise = 'Concise',
  Verbose = 'Verbose',
}

export type PreferenceValue = ValueOf<typeof defaultPreferences>;

const DEFAULT_FONT_SIZE = 12;
export const defaultPreferences = {
  [Preferences.FontSize]: DEFAULT_FONT_SIZE,
  [Preferences.AutoSave]: true,
  [Preferences.SaveOnVerifyingUploading]: false,
  [Preferences.BoardAutoSelection]: true,
  [Preferences.ConsoleOutput]: ConsoleOutput.Concise,
};
