import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReleaseNoteField } from './ReleaseNoteField';

const renderField = (
  props: Partial<React.ComponentProps<typeof ReleaseNoteField>> = {},
): ReturnType<typeof render> =>
  render(
    <ReleaseNoteField
      id="note"
      label="Release note"
      value=""
      onChange={vi.fn()}
      {...props}
    />,
  );

describe('ReleaseNoteField', () => {
  it('reports every keystroke', () => {
    const onChange = vi.fn();
    renderField({ onChange });

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '- [Fix] a thing' },
    });

    expect(onChange).toHaveBeenCalledWith('- [Fix] a thing');
  });

  it('shows only the editor, with no write or preview tabs', () => {
    renderField({ value: '# Corrections' });

    expect(screen.getByRole('textbox')).toHaveValue('# Corrections');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('points its label at the editor', () => {
    renderField();

    expect(
      screen.getByRole('textbox', { name: 'Release note' }),
    ).toHaveAttribute('id', 'note');
  });
});
