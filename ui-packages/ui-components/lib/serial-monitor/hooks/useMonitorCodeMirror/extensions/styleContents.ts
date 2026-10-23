import {
  RangeSet,
  StateEffect,
  StateField,
  TransactionSpec,
} from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import { reset } from './reset';

export type StyledContent = {
  from: number;
  textContent: string;
  className?: string;
  style?: string;
};

const addStyledContent = StateEffect.define<StyledContent>({
  map: ({ from, textContent, className, style }, change) => ({
    from: change.mapPos(from),
    textContent,
    className,
    style,
  }),
});

const styledHighlighting = (className?: string, style?: string): Decoration =>
  Decoration.mark({
    class: className,
    attributes: style ? { style } : undefined,
  });

export const styledContents = StateField.define<StyledContent[]>({
  create() {
    return [];
  },
  update(styledContents, tr) {
    for (const e of tr.effects)
      if (e.is(addStyledContent)) {
        styledContents = [
          ...styledContents,
          {
            from: e.value.from,
            textContent: e.value.textContent,
            className: e.value.className,
            style: e.value.style,
          },
        ];
      } else if (e.is(reset)) styledContents = [];
    return styledContents;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (values) =>
      RangeSet.of(
        values.map(({ from, textContent, className, style }) =>
          styledHighlighting(className, style).range(
            from,
            from + textContent.length,
          ),
        ),
        true,
      ),
    ),
  ],
});

export function addStyledContentEffect(
  tr: TransactionSpec,
  from: number,
  textContent: string,
  className?: string,
  style?: string,
): void {
  // Mark decorations may not be empty, and an unstyled range is a no-op.
  if (textContent.length === 0 || (!className && !style)) return;
  if (!tr.effects) {
    tr.effects = [];
  }
  (tr.effects as StateEffect<any>[]).push(
    addStyledContent.of({
      from,
      textContent,
      className,
      style,
    }),
  );
}
