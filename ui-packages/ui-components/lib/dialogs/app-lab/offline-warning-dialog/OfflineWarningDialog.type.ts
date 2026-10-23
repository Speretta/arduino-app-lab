export type OfflineWarningDialogLogic = () => {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  onNetworkSettings: () => void;
};
