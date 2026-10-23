import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The modal's scrollable body observes its parent, which jsdom has no API for.
vi.hoisted(() => {
  const noop = (): void => undefined;

  globalThis.ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  } as unknown as typeof ResizeObserver;
});

import {
  CreateReleaseDialog,
  CreateReleaseDialogLogic,
  ReleaseDraft,
} from './CreateReleaseDialog';

const app = { id: 'app-1', name: 'Magic Storyteller', icon: '🏰' };

const targets = [
  { id: 'unoq', label: 'Arduino UNO Q' },
  { id: 'ventunoq', label: 'Arduino VENTUNO Q' },
];

const renderDialog = (
  overrides: Partial<ReturnType<CreateReleaseDialogLogic>> = {},
): { confirmAction: ReturnType<typeof vi.fn> } => {
  const confirmAction = vi.fn().mockResolvedValue(true);
  const logic: CreateReleaseDialogLogic = () => ({
    open: true,
    app,
    targets,
    defaultTarget: 'unoq',
    appIsRunning: false,
    confirmAction,
    onOpenChange: vi.fn(),
    ...overrides,
  });
  render(<CreateReleaseDialog logic={logic} />);
  return { confirmAction };
};

const submit = async (
  confirmAction: ReturnType<typeof vi.fn>,
): Promise<void> => {
  fireEvent.click(screen.getByText('Save and download'));
  await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
};

describe('CreateReleaseDialog', () => {
  it('composes the rows of the design', () => {
    renderDialog();

    expect(screen.getByText('Magic Storyteller')).toBeInTheDocument();
    expect(
      screen.getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
    ).toBeInTheDocument();
    expect(screen.getByText('Release label')).toBeInTheDocument();
    expect(screen.getByLabelText('Target')).toHaveDisplayValue('Arduino UNO Q');
    expect(screen.getByText('Release note')).toBeInTheDocument();
    expect(
      screen.getByText('Include data associated with the App'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Save to')).not.toBeInTheDocument();
  });

  it('sends the defaults: board target, no label, no note, no data', async () => {
    const { confirmAction } = renderDialog();

    await submit(confirmAction);

    const [draft, ...rest] = confirmAction.mock.calls[0] as [ReleaseDraft];
    expect(draft).toEqual({
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
      label: undefined,
      target: 'unoq',
      note: undefined,
      includeData: false,
    });
    expect(rest).toEqual([]);
  });

  it('sends the label and the note once they are written', async () => {
    const { confirmAction } = renderDialog();

    fireEvent.change(screen.getByLabelText(/Release label/), {
      target: { value: ' 1.0 ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Release note/ }), {
      target: { value: '- [Fix] a thing' },
    });
    await submit(confirmAction);

    const draft = confirmAction.mock.calls[0][0] as ReleaseDraft;
    expect(draft.label).toBe('1.0');
    expect(draft.note).toBe('- [Fix] a thing');
  });

  it('turns the data toggle off while the App runs', async () => {
    const { confirmAction } = renderDialog({ appIsRunning: true });

    expect(
      screen.getByRole('button', {
        name: 'Include data associated with the App',
      }),
    ).toBeDisabled();

    await submit(confirmAction);
    expect((confirmAction.mock.calls[0][0] as ReleaseDraft).includeData).toBe(
      false,
    );
  });

  it('holds the dialog open in its building state until the copy is done', async () => {
    let releaseCopy: (started: boolean) => void = () => undefined;
    const onOpenChange = vi.fn();
    const confirmAction = vi.fn(
      () => new Promise<boolean>((resolve) => (releaseCopy = resolve)),
    );
    renderDialog({ confirmAction, onOpenChange });

    fireEvent.click(screen.getByText('Save and download'));
    await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());

    // no close button, and both footer buttons are disabled
    await vi.waitFor(() =>
      expect(screen.getByText('Building…')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Save and download')).not.toBeInTheDocument();
    expect(screen.getByText('Building…').closest('button')).toBeDisabled();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
    expect(screen.getByLabelText(/Release label/)).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();

    releaseCopy(true);

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open when the build does not start', async () => {
    const onOpenChange = vi.fn();
    const confirmAction = vi.fn().mockResolvedValue(false);
    renderDialog({ confirmAction, onOpenChange });

    await submit(confirmAction);

    await vi.waitFor(() =>
      expect(screen.getByText('Save and download')).toBeInTheDocument(),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
