import { describe, expect, it } from 'vitest';

import { CONSOLE_SOURCE_KEYS } from './multipleConsolePanel.type';
import { getOrderedConsoleTabs } from './utils';

const { STARTUP, PYTHON, SERIAL_MONITOR } = CONSOLE_SOURCE_KEYS;

// Brick tabs are keyed "brick_id [container_name]" and have no priority.
const BRICK = 'arduino:arduino_cloud [cloud]';
const OTHER_BRICK = 'arduino:video_object_detection [camera]';

describe('getOrderedConsoleTabs', () => {
  it.each([
    ['App launch only', [STARTUP], [STARTUP]],
    ['App launch and Python', [STARTUP, PYTHON], [STARTUP, PYTHON]],
    [
      'App launch, Python and Serial Monitor',
      [STARTUP, SERIAL_MONITOR, PYTHON],
      [STARTUP, PYTHON, SERIAL_MONITOR],
    ],
    [
      'the three known tabs and a brick tab',
      [STARTUP, BRICK, SERIAL_MONITOR, PYTHON],
      [STARTUP, PYTHON, SERIAL_MONITOR, BRICK],
    ],
    [
      'a brick tab and no Python',
      [BRICK, SERIAL_MONITOR, STARTUP],
      [STARTUP, SERIAL_MONITOR, BRICK],
    ],
  ])('orders %s', (_case, tabs, expected) => {
    expect(getOrderedConsoleTabs(tabs)).toEqual(expected);
  });

  it('keeps brick tabs in the order they were created', () => {
    expect(
      getOrderedConsoleTabs([OTHER_BRICK, PYTHON, BRICK, STARTUP]),
    ).toEqual([STARTUP, PYTHON, OTHER_BRICK, BRICK]);
  });

  it('does not change the array it is given', () => {
    const tabs = [SERIAL_MONITOR, PYTHON, STARTUP];

    getOrderedConsoleTabs(tabs);

    expect(tabs).toEqual([SERIAL_MONITOR, PYTHON, STARTUP]);
  });
});
