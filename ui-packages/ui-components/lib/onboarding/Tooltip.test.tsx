import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipRenderProps } from 'react-joyride';
import { describe, expect, it, vi } from 'vitest';

import Tooltip from './Tooltip';

const clickProps = (
  label: string,
  action: string,
  onClick: TooltipRenderProps['backProps']['onClick'],
): TooltipRenderProps['backProps'] => ({
  'aria-label': label,
  'data-action': action,
  onClick,
  role: 'button',
  title: label,
});

const renderTooltip = (): {
  onBack: ReturnType<typeof vi.fn>;
  onPrimary: ReturnType<typeof vi.fn>;
} => {
  const onBack = vi.fn((e) => e.preventDefault());
  const onPrimary = vi.fn((e) => e.preventDefault());
  const props = {
    index: 1,
    size: 3,
    isLastStep: false,
    continuous: true,
    step: { title: 'Title', content: 'Content' },
    backProps: clickProps('Back', 'back', onBack),
    primaryProps: clickProps('Next', 'primary', onPrimary),
    closeProps: clickProps('Close', 'close', vi.fn()),
    skipProps: clickProps('Skip', 'skip', vi.fn()),
    tooltipProps: { 'aria-modal': true, ref: vi.fn(), role: 'alertdialog' },
  } as unknown as TooltipRenderProps;
  render(<Tooltip {...props} />);
  return { onBack, onPrimary };
};

describe('onboarding Tooltip', () => {
  it('calls the joyride handlers once on click', async () => {
    const { onBack, onPrimary } = renderTooltip();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('calls the joyride handlers once on Enter', async () => {
    const { onBack, onPrimary } = renderTooltip();

    screen.getByRole('button', { name: 'Back' }).focus();
    await userEvent.keyboard('{Enter}');
    screen.getByRole('button', { name: 'Next' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });
});
