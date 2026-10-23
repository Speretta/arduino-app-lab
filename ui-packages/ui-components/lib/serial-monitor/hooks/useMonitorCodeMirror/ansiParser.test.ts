/**
 * Unit tests for the ANSI SGR parser used to colorize console/log output.
 *
 * Coverage:
 *  - parseAnsi: plain text, colors, character attributes, extended colors,
 *    reset codes, non-SGR sequences, edge cases.
 *  - AnsiParser: style and truncated sequences carried across chunks, which is
 *    how serial data actually arrives.
 *  - stripAnsi: removal of all escape codes while preserving text.
 */

import { describe, expect, it } from 'vitest';

import { AnsiParser, parseAnsi, stripAnsi } from './ansiParser';

const ESC = '\u001b';

describe('parseAnsi', () => {
  it('returns a single plain segment for text without escape codes', () => {
    expect(parseAnsi('hello world')).toEqual([{ text: 'hello world' }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseAnsi('')).toEqual([]);
  });

  it('annotates a colored segment with the matching foreground class', () => {
    expect(parseAnsi(`${ESC}[33mwarning${ESC}[0m`)).toEqual([
      { text: 'warning', className: 'ansi-fg-yellow' },
    ]);
  });

  it('keeps leading plain text uncolored before a color code', () => {
    expect(parseAnsi(`plain${ESC}[31mred`)).toEqual([
      { text: 'plain' },
      { text: 'red', className: 'ansi-fg-red' },
    ]);
  });

  it('resets the color on code 0', () => {
    expect(parseAnsi(`${ESC}[32mgreen${ESC}[0m normal`)).toEqual([
      { text: 'green', className: 'ansi-fg-green' },
      { text: ' normal' },
    ]);
  });

  it('treats an empty SGR code as a reset', () => {
    expect(parseAnsi(`${ESC}[34mblue${ESC}[mafter`)).toEqual([
      { text: 'blue', className: 'ansi-fg-blue' },
      { text: 'after' },
    ]);
  });

  it('merges adjacent runs that share the same style', () => {
    expect(parseAnsi(`${ESC}[36ma${ESC}[36mb${ESC}[0mc`)).toEqual([
      { text: 'ab', className: 'ansi-fg-cyan' },
      { text: 'c' },
    ]);
  });

  it('supports bright foreground colors', () => {
    expect(parseAnsi(`${ESC}[92mbright`)).toEqual([
      { text: 'bright', className: 'ansi-fg-bright-green' },
    ]);
  });

  it('supports background colors', () => {
    expect(parseAnsi(`${ESC}[41;97mwhite on red`)).toEqual([
      {
        text: 'white on red',
        className: 'ansi-fg-bright-white ansi-bg-red',
      },
    ]);
  });

  it('applies character attributes alongside colors', () => {
    expect(parseAnsi(`${ESC}[1;4;33mbold underlined yellow`)).toEqual([
      {
        text: 'bold underlined yellow',
        className: 'ansi-fg-yellow ansi-bold ansi-underline',
      },
    ]);
  });

  it('clears a single attribute without clearing the color', () => {
    expect(parseAnsi(`${ESC}[1;31ma${ESC}[22mb`)).toEqual([
      { text: 'a', className: 'ansi-fg-red ansi-bold' },
      { text: 'b', className: 'ansi-fg-red' },
    ]);
  });

  it('resets the foreground to default on code 39', () => {
    expect(parseAnsi(`${ESC}[31mred${ESC}[39mdefault`)).toEqual([
      { text: 'red', className: 'ansi-fg-red' },
      { text: 'default' },
    ]);
  });

  it('maps a 256-color index below 16 onto the named palette', () => {
    expect(parseAnsi(`${ESC}[38;5;9mbright red`)).toEqual([
      { text: 'bright red', className: 'ansi-fg-bright-red' },
    ]);
  });

  it('renders a 256-color cube index as an inline color', () => {
    // 31 is a cube color, not the red named by SGR 31.
    expect(parseAnsi(`${ESC}[38;5;31mteal`)).toEqual([
      { text: 'teal', style: 'color:#0087af;' },
    ]);
  });

  it('renders a 256-color greyscale index as an inline color', () => {
    expect(parseAnsi(`${ESC}[48;5;240mgrey bg`)).toEqual([
      { text: 'grey bg', style: 'background-color:#585858;' },
    ]);
  });

  it('renders a 24-bit color as an inline color', () => {
    expect(parseAnsi(`${ESC}[38;2;255;128;0morange`)).toEqual([
      { text: 'orange', style: 'color:#ff8000;' },
    ]);
  });

  it('swaps foreground and background on reverse video', () => {
    expect(parseAnsi(`${ESC}[31;7mreversed`)).toEqual([
      {
        text: 'reversed',
        className: 'ansi-bg-red',
        style: 'color:var(--ansi-default-bg, #ffffff);',
      },
    ]);
  });

  it('drops non-SGR escape sequences instead of emitting them as text', () => {
    expect(parseAnsi(`${ESC}[2K${ESC}[Hcleared${ESC}[?25l`)).toEqual([
      { text: 'cleared' },
    ]);
  });

  it('drops OSC sequences terminated by BEL', () => {
    expect(parseAnsi(`${ESC}]0;window title\u0007text`)).toEqual([
      { text: 'text' },
    ]);
  });

  it('preserves line separators inside a colored segment', () => {
    expect(parseAnsi(`${ESC}[33mline1\r\nline2${ESC}[0m`)).toEqual([
      { text: 'line1\r\nline2', className: 'ansi-fg-yellow' },
    ]);
  });

  it('ignores unknown codes and keeps the previous state', () => {
    expect(parseAnsi(`${ESC}[31mred${ESC}[99mstill red`)).toEqual([
      { text: 'redstill red', className: 'ansi-fg-red' },
    ]);
  });

  it('handles a trailing escape code with no following text', () => {
    expect(parseAnsi(`text${ESC}[0m`)).toEqual([{ text: 'text' }]);
  });
});

describe('AnsiParser', () => {
  it('carries the active style into the next chunk', () => {
    const parser = new AnsiParser();

    expect(parser.push(`${ESC}[32m`)).toEqual([]);
    expect(parser.push('green text')).toEqual([
      { text: 'green text', className: 'ansi-fg-green' },
    ]);
    expect(parser.push(`${ESC}[0mplain`)).toEqual([{ text: 'plain' }]);
  });

  it('reassembles an escape sequence split across chunks', () => {
    const parser = new AnsiParser();

    expect(parser.push(`${ESC}[3`)).toEqual([]);
    expect(parser.push('3mdelayed')).toEqual([
      { text: 'delayed', className: 'ansi-fg-yellow' },
    ]);
  });

  it('reassembles a sequence split one character at a time', () => {
    const parser = new AnsiParser();
    const segments = [...`${ESC}[31mred`].flatMap((c) => parser.push(c));

    expect(segments.map((s) => s.text).join('')).toBe('red');
    expect(segments.every((s) => s.className === 'ansi-fg-red')).toBe(true);
  });

  it('gives up on a sequence that never terminates and emits it as text', () => {
    const parser = new AnsiParser();
    const filler = '9'.repeat(200);

    expect(parser.push(`${ESC}[`)).toEqual([]);
    expect(
      parser
        .push(filler)
        .map((s) => s.text)
        .join(''),
    ).toBe(`${ESC}[${filler}`);
  });

  it('drops style and pending input on reset', () => {
    const parser = new AnsiParser();

    parser.push(`${ESC}[31mred${ESC}[3`);
    parser.reset();

    expect(parser.push('3mplain')).toEqual([{ text: '3mplain' }]);
  });
});

describe('stripAnsi', () => {
  it('removes all escape codes while preserving text', () => {
    expect(stripAnsi(`${ESC}[33m[RUN]${ESC}[0m starting`)).toBe(
      '[RUN] starting',
    );
  });

  it('returns the input unchanged when there are no escape codes', () => {
    expect(stripAnsi('no codes here')).toBe('no codes here');
  });

  it('preserves line separators', () => {
    expect(stripAnsi(`${ESC}[32ma\r\nb${ESC}[0m`)).toBe('a\r\nb');
  });
});
