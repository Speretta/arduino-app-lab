export type SwapRunningAppDialogLogic = () => {
  open: boolean;
  setOpen: (open: boolean) => void;
  runningAppName: string;
  newAppName: string;
  runningAppIsDefault: boolean;
  handleSwap: () => void;
};
