export interface AnsiSegment {
  text: string;
  className?: string;
  style?: string;
}

const ESC = '\u001b';
const BEL = '\u0007';

// A truncated escape sequence is held back until the rest arrives; past this
// many characters we assume it is not an escape after all and emit it as text.
const MAX_PENDING = 128;

const COLOR_NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
];

type AnsiColor = { name: string } | { css: string };

interface SgrState {
  fg?: AnsiColor;
  bg?: AnsiColor;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  blink: boolean;
  reverse: boolean;
  strike: boolean;
}

function resetState(state: SgrState): void {
  state.fg = undefined;
  state.bg = undefined;
  state.bold = false;
  state.dim = false;
  state.italic = false;
  state.underline = false;
  state.blink = false;
  state.reverse = false;
  state.strike = false;
}

function newState(): SgrState {
  const state = {} as SgrState;
  resetState(state);
  return state;
}

function namedColor(index: number): AnsiColor {
  return index >= 8
    ? { name: `bright-${COLOR_NAMES[index - 8]}` }
    : { name: COLOR_NAMES[index] };
}

function hex(r: number, g: number, b: number): string {
  const channel = (v: number): string =>
    Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Maps an xterm 256-color index onto a palette name or a concrete hex color. */
function xterm256(n: number): AnsiColor {
  if (n < 16) return namedColor(n);
  if (n < 232) {
    const i = n - 16;
    const level = (v: number): number => (v === 0 ? 0 : 55 + v * 40);
    return {
      css: hex(
        level(Math.floor(i / 36)),
        level(Math.floor(i / 6) % 6),
        level(i % 6),
      ),
    };
  }
  const grey = 8 + (n - 232) * 10;
  return { css: hex(grey, grey, grey) };
}

function parseParams(raw: string): number[] {
  if (raw === '') return [];
  const params: number[] = [];
  for (const part of raw.split(';')) {
    // Some emitters use colons for the sub-parameters of 38/48.
    if (part.includes(':')) {
      for (const sub of part.split(':')) {
        if (sub !== '') params.push(Number(sub) || 0);
      }
    } else {
      params.push(part === '' ? 0 : Number(part) || 0);
    }
  }
  return params;
}

/** Reads the extended color at `i` (38/48), and how many params it consumed. */
function extendedColor(
  params: number[],
  i: number,
): { color: AnsiColor; consumed: number } | undefined {
  if (params[i + 1] === 5 && i + 2 < params.length) {
    return { color: xterm256(params[i + 2]), consumed: 2 };
  }
  if (params[i + 1] === 2 && i + 4 < params.length) {
    return {
      color: { css: hex(params[i + 2], params[i + 3], params[i + 4]) },
      consumed: 4,
    };
  }
  return undefined;
}

function applySgr(state: SgrState, params: number[]): void {
  const codes = params.length === 0 ? [0] : params;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];

    if (code === 38 || code === 48) {
      const extended = extendedColor(codes, i);
      // Malformed extended color: the rest of the sequence is unusable.
      if (!extended) return;
      if (code === 38) state.fg = extended.color;
      else state.bg = extended.color;
      i += extended.consumed;
      continue;
    }

    if (code >= 30 && code <= 37) state.fg = namedColor(code - 30);
    else if (code >= 40 && code <= 47) state.bg = namedColor(code - 40);
    else if (code >= 90 && code <= 97) state.fg = namedColor(code - 90 + 8);
    else if (code >= 100 && code <= 107) state.bg = namedColor(code - 100 + 8);
    else {
      switch (code) {
        case 0:
          resetState(state);
          break;
        case 1:
          state.bold = true;
          break;
        case 2:
          state.dim = true;
          break;
        case 3:
          state.italic = true;
          break;
        case 4:
          state.underline = true;
          break;
        case 5:
        case 6:
          state.blink = true;
          break;
        case 7:
          state.reverse = true;
          break;
        case 9:
          state.strike = true;
          break;
        case 21:
        case 22:
          state.bold = false;
          state.dim = false;
          break;
        case 23:
          state.italic = false;
          break;
        case 24:
          state.underline = false;
          break;
        case 25:
          state.blink = false;
          break;
        case 27:
          state.reverse = false;
          break;
        case 29:
          state.strike = false;
          break;
        case 39:
          state.fg = undefined;
          break;
        case 49:
          state.bg = undefined;
          break;
        default:
          break;
      }
    }
  }
}

function attributesFor(state: SgrState): {
  className?: string;
  style?: string;
} {
  const classNames: string[] = [];
  const styles: string[] = [];

  let { fg, bg } = state;
  if (state.reverse) {
    const foreground = bg ?? { css: 'var(--ansi-default-bg, #ffffff)' };
    const background = fg ?? { css: 'var(--ansi-default-fg, #000000)' };
    fg = foreground;
    bg = background;
  }

  if (fg) {
    if ('name' in fg) classNames.push(`ansi-fg-${fg.name}`);
    else styles.push(`color:${fg.css}`);
  }
  if (bg) {
    if ('name' in bg) classNames.push(`ansi-bg-${bg.name}`);
    else styles.push(`background-color:${bg.css}`);
  }

  if (state.bold) classNames.push('ansi-bold');
  if (state.dim) classNames.push('ansi-dim');
  if (state.italic) classNames.push('ansi-italic');
  if (state.underline) classNames.push('ansi-underline');
  if (state.blink) classNames.push('ansi-blink');
  if (state.strike) classNames.push('ansi-strike');

  return {
    className: classNames.length ? classNames.join(' ') : undefined,
    style: styles.length ? `${styles.join(';')};` : undefined,
  };
}

/**
 * Reads the escape sequence starting at `start`.
 * Returns `undefined` when the sequence is truncated and needs more input.
 */
function readEscape(
  raw: string,
  start: number,
): { length: number; sgr?: number[] } | undefined {
  if (start + 1 >= raw.length) return undefined;
  const introducer = raw[start + 1];

  if (introducer === '[') {
    let i = start + 2;
    // Parameter bytes, then intermediate bytes, then a single final byte.
    while (
      i < raw.length &&
      raw.charCodeAt(i) >= 0x30 &&
      raw.charCodeAt(i) <= 0x3f
    )
      i++;
    while (
      i < raw.length &&
      raw.charCodeAt(i) >= 0x20 &&
      raw.charCodeAt(i) <= 0x2f
    )
      i++;
    if (i >= raw.length) return undefined;

    const length = i - start + 1;
    if (raw[i] !== 'm') return { length };
    return { length, sgr: parseParams(raw.slice(start + 2, i)) };
  }

  // OSC and the other string sequences run until BEL or ST.
  if ([']', 'P', 'X', '^', '_'].includes(introducer)) {
    for (let i = start + 2; i < raw.length; i++) {
      if (raw[i] === BEL) return { length: i - start + 1 };
      if (raw[i] === ESC && raw[i + 1] === '\\')
        return { length: i - start + 2 };
    }
    return undefined;
  }

  return { length: 2 };
}

/**
 * Stateful ANSI SGR parser. Serial and log output arrives in arbitrary chunks,
 * so both the active style and a truncated escape sequence have to survive
 * across calls to {@link AnsiParser.push}.
 */
export class AnsiParser {
  private pending = '';
  private state = newState();

  reset(): void {
    this.pending = '';
    this.state = newState();
  }

  push(chunk: string): AnsiSegment[] {
    const raw = this.pending + chunk;
    this.pending = '';

    const segments: AnsiSegment[] = [];
    const emit = (text: string): void => {
      if (text === '') return;
      const { className, style } = attributesFor(this.state);
      const previous = segments[segments.length - 1];
      if (
        previous &&
        previous.className === className &&
        previous.style === style
      ) {
        previous.text += text;
      } else {
        segments.push({ text, className, style });
      }
    };

    let i = 0;
    while (i < raw.length) {
      const start = raw.indexOf(ESC, i);
      if (start === -1) {
        emit(raw.slice(i));
        break;
      }
      emit(raw.slice(i, start));

      const escape = readEscape(raw, start);
      if (!escape) {
        const truncated = raw.slice(start);
        if (truncated.length > MAX_PENDING) emit(truncated);
        else this.pending = truncated;
        break;
      }

      if (escape.sgr) applySgr(this.state, escape.sgr);
      i = start + escape.length;
    }

    return segments;
  }
}

/** Parses a self-contained string. Use {@link AnsiParser} for streamed input. */
export function parseAnsi(raw: string): AnsiSegment[] {
  return new AnsiParser().push(raw);
}

/** Returns the raw string with all ANSI escape codes stripped. */
export function stripAnsi(raw: string): string {
  return parseAnsi(raw)
    .map((s) => s.text)
    .join('');
}
