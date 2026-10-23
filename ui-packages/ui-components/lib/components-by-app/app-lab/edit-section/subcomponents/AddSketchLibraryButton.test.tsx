/**
 * The disabled "Add sketch library" button and its popover, driven from the
 * keyboard. The popover is portaled to the end of `body`, so Tab into and out
 * of it is moved by the component.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddSketchLibraryButton } from './AddSketchLibraryButton';

const popover = (
  onAction = vi.fn(),
): Parameters<typeof AddSketchLibraryButton>[0]['popover'] => ({
  text: 'To add a sketch library, your App must include a sketch folder containing:',
  listItems: ['sketch.ino', 'sketch.yaml'],
  actionLabel: 'Add sketch folder',
  onAction,
});

const renderButton = (
  props: Partial<Parameters<typeof AddSketchLibraryButton>[0]> = {},
): ReturnType<typeof render> =>
  render(
    <>
      <button>before</button>
      <AddSketchLibraryButton
        label="Add sketch library"
        onClick={vi.fn()}
        popover={popover()}
        {...props}
      />
      <button>after</button>
    </>,
  );

const trigger = (): HTMLElement =>
  screen.getByRole('button', { name: 'Add sketch library' });
const action = (): HTMLElement =>
  screen.getByRole('button', { name: 'Add sketch folder', hidden: true });
const isOpen = (): boolean =>
  trigger().getAttribute('aria-expanded') === 'true';

// Starts with focus on the button before the trigger.
const focusBefore = (): void => {
  act(() => screen.getByRole('button', { name: 'before' }).focus());
};

describe('AddSketchLibraryButton', () => {
  it('is an ordinary button without a popover', async () => {
    const onClick = vi.fn();
    renderButton({ popover: undefined, onClick });

    await userEvent.click(trigger());

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger()).not.toHaveAttribute('aria-disabled');
  });

  it('stays focusable but inert with a popover', async () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    renderButton({ onClick, popover: popover(onAction) });
    const user = userEvent.setup();
    focusBefore();

    await user.tab();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('opens on focus and is described by the popover text', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();

    await user.tab();

    expect(isOpen()).toBe(true);
    const description = document.getElementById(
      trigger().getAttribute('aria-describedby') as string,
    );
    expect(description).toHaveTextContent('sketch.ino');
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute(
      'aria-label',
      'To add a sketch library, your App must include a sketch folder containing: sketch.ino sketch.yaml',
    );
  });

  it('moves Tab into the popover and Shift+Tab back, staying open', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();

    await user.tab();
    expect(action()).toHaveFocus();
    expect(isOpen()).toBe(true);

    await user.tab({ shift: true });
    expect(trigger()).toHaveFocus();
    expect(isOpen()).toBe(true);
  });

  it('closes on Escape from the popover and returns focus without reopening', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();
    await user.tab();

    await user.keyboard('{Escape}');

    expect(trigger()).toHaveFocus();
    expect(isOpen()).toBe(false);
  });

  it('closes on Escape from the trigger', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();

    await user.keyboard('{Escape}');

    expect(trigger()).toHaveFocus();
    expect(isOpen()).toBe(false);
  });

  it('runs the action on Enter, closes, and returns focus without reopening', async () => {
    const onAction = vi.fn();
    renderButton({ popover: popover(onAction) });
    const user = userEvent.setup();
    focusBefore();
    await user.tab();
    await user.tab();

    await user.keyboard('{Enter}');

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveFocus();
    expect(isOpen()).toBe(false);
  });

  it('closes on Tab out of the popover', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();
    await user.tab();

    await user.tab();

    expect(isOpen()).toBe(false);
    expect(action()).not.toHaveFocus();
  });

  it('closes when focus leaves both', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();

    act(() => screen.getByRole('button', { name: 'after' }).focus());

    expect(isOpen()).toBe(false);
  });

  it('stays open, focus kept on the trigger, when the popover is pressed with the mouse', async () => {
    renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();

    const text = document.getElementById(
      trigger().getAttribute('aria-describedby') as string,
    ) as HTMLElement;
    await user.pointer({ keys: '[MouseLeft>]', target: text });

    expect(trigger()).toHaveFocus();
    expect(isOpen()).toBe(true);
  });

  it('keeps the same focused button when the popover goes away', async () => {
    const { rerender } = renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();
    const focused = trigger();

    rerender(
      <>
        <button>before</button>
        <AddSketchLibraryButton label="Add sketch library" onClick={vi.fn()} />
        <button>after</button>
      </>,
    );

    expect(trigger()).toBe(focused);
    expect(trigger()).toHaveFocus();
  });

  it('closes on mouse leave after the popover went away and came back while focused', async () => {
    const { rerender } = renderButton();
    const user = userEvent.setup();
    focusBefore();
    await user.tab();
    const withPopover = (
      <>
        <button>before</button>
        <AddSketchLibraryButton
          label="Add sketch library"
          onClick={vi.fn()}
          popover={popover()}
        />
        <button>after</button>
      </>
    );

    rerender(
      <>
        <button>before</button>
        <AddSketchLibraryButton label="Add sketch library" onClick={vi.fn()} />
        <button>after</button>
      </>,
    );
    act(() => screen.getByRole('button', { name: 'after' }).focus());
    rerender(withPopover);

    await user.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await user.unhover(trigger());

    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it('keeps an unavailable button focusable and inert', async () => {
    const onClick = vi.fn();
    renderButton({ popover: undefined, unavailable: true, onClick });

    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).not.toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
