import { create } from 'zustand';

import { agentIsBusy } from './chatStore';

export interface PendingBoardSwitch {
  // Board the agent is working on, named in the warning — the one being switched away from.
  currentBoardName?: string;
  // Re-issues the switch the dialog held back.
  confirm: VoidFunction;
}

// How long a confirmation stands for the teardown it causes. A confirmed switch does not always reach
// Go — a network board parks at the password prompt, a vanished board fails outright — and a
// confirmation left behind would revive the agent under a later switch nobody was asked about.
const CONFIRMATION_TTL_MS = 30_000;

interface BoardSwitchStore {
  pending?: PendingBoardSwitch;
  // When the user last confirmed a switch, so the teardown it causes can skip the reconnect prompt.
  confirmedAt?: number;
  setPending: (pending?: PendingBoardSwitch) => void;
  // Answers the pending switch: records the confirmation and re-issues the switch.
  confirmPending: VoidFunction;
  // One-shot: whether the teardown being handled comes from a confirmation just given.
  consumeConfirmed: () => boolean;
}

export const useBoardSwitchStore = create<BoardSwitchStore>((set, get) => ({
  pending: undefined,
  confirmedAt: undefined,

  setPending: (pending?: PendingBoardSwitch): void => set({ pending }),

  confirmPending: (): void => {
    const { pending } = get();
    if (!pending) {
      return;
    }

    set({ pending: undefined, confirmedAt: Date.now() });
    pending.confirm();
  },

  consumeConfirmed: (): boolean => {
    const { confirmedAt } = get();
    set({ confirmedAt: undefined });

    return (
      confirmedAt !== undefined &&
      Date.now() - confirmedAt < CONFIRMATION_TTL_MS
    );
  },
}));

// Gate for a board switch: the agent is bound to one board, so the host tears it down on every switch and
// a turn in flight dies with it. Parks the switch behind SwitchBoardDialog while the agent works.
// Returns true when the caller may switch right away.
export const requestBoardSwitch = (pending: PendingBoardSwitch): boolean => {
  if (!agentIsBusy()) {
    return true;
  }
  useBoardSwitchStore.getState().setPending(pending);
  return false;
};
