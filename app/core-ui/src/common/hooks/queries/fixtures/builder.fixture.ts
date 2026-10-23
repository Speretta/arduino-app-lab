import { CompleteExample } from '@cloud-editor-mono/domain';
import { ExamplesFolder } from '@cloud-editor-mono/ui-components';

type MockType = {
  examples: CompleteExample[];
};

export const MOCK_EMPTY_EXAMPLES_RESPONSE: MockType = {
  examples: [],
};

export const EXPECTED_EMPTY_EXAMPLES_FOLDERS: ExamplesFolder[] = [];
export const MOCK_BASICS_EXAMPLES_RESPONSE: MockType = {
  examples: [
    {
      files: [
        {
          name: 'Blink.txt',
          path: '01.Basics/Blink/Blink.txt',
        },
      ],
      ino: {
        name: 'Blink.ino',
        path: '01.Basics/Blink/Blink.ino',
      },
      name: 'Blink',
      path: '01.Basics/Blink',
    },
    {
      files: [
        {
          name: 'AnalogReadSerial.txt',
          path: '01.Basics/AnalogReadSerial/AnalogReadSerial.txt',
        },
        {
          name: 'layout.png',
          path: '01.Basics/AnalogReadSerial/layout.png',
        },
        {
          name: 'schematic.png',
          path: '01.Basics/AnalogReadSerial/schematic.png',
        },
      ],
      ino: {
        name: 'AnalogReadSerial.ino',
        path: '01.Basics/AnalogReadSerial/AnalogReadSerial.ino',
      },
      name: 'AnalogReadSerial',
      path: '01.Basics/AnalogReadSerial',
    },
    {
      files: [
        {
          name: 'ReadAnalogVoltage.txt',
          path: '01.Basics/ReadAnalogVoltage/ReadAnalogVoltage.txt',
        },
        {
          name: 'layout.png',
          path: '01.Basics/ReadAnalogVoltage/layout.png',
        },
        {
          name: 'schematic.png',
          path: '01.Basics/ReadAnalogVoltage/schematic.png',
        },
      ],
      ino: {
        name: 'ReadAnalogVoltage.ino',
        path: '01.Basics/ReadAnalogVoltage/ReadAnalogVoltage.ino',
      },
      name: 'ReadAnalogVoltage',
      path: '01.Basics/ReadAnalogVoltage',
    },
  ],
};

export const EXPECTED_BASICS_EXAMPLES_FOLDERS: ExamplesFolder[] = [
  {
    name: '01.Basics',
    examples: [
      {
        files: [
          {
            name: 'AnalogReadSerial.txt',
            path: '01.Basics/AnalogReadSerial/AnalogReadSerial.txt',
          },
          {
            name: 'layout.png',
            path: '01.Basics/AnalogReadSerial/layout.png',
          },
          {
            name: 'schematic.png',
            path: '01.Basics/AnalogReadSerial/schematic.png',
          },
        ],
        ino: {
          name: 'AnalogReadSerial.ino',
          path: '01.Basics/AnalogReadSerial/AnalogReadSerial.ino',
        },
        name: 'AnalogReadSerial',
        path: '01.Basics/AnalogReadSerial',
      },

      {
        files: [
          {
            name: 'Blink.txt',
            path: '01.Basics/Blink/Blink.txt',
          },
        ],
        ino: {
          name: 'Blink.ino',
          path: '01.Basics/Blink/Blink.ino',
        },
        name: 'Blink',
        path: '01.Basics/Blink',
      },
      {
        files: [
          {
            name: 'ReadAnalogVoltage.txt',
            path: '01.Basics/ReadAnalogVoltage/ReadAnalogVoltage.txt',
          },
          {
            name: 'layout.png',
            path: '01.Basics/ReadAnalogVoltage/layout.png',
          },
          {
            name: 'schematic.png',
            path: '01.Basics/ReadAnalogVoltage/schematic.png',
          },
        ],
        ino: {
          name: 'ReadAnalogVoltage.ino',
          path: '01.Basics/ReadAnalogVoltage/ReadAnalogVoltage.ino',
        },
        name: 'ReadAnalogVoltage',
        path: '01.Basics/ReadAnalogVoltage',
      },
    ],
    examplesNumber: 3,
  },
];

export const MOCK_DIGITAL_EXAMPLES_RESPONSE: MockType = {
  examples: [
    {
      files: [
        {
          name: 'DigitalInputPullup.txt',
          path: '02.Digital/DigitalInputPullup/DigitalInputPullup.txt',
        },
        {
          name: 'layout.png',
          path: '02.Digital/DigitalInputPullup/layout.png',
        },
        {
          name: 'schematic.png',
          path: '02.Digital/DigitalInputPullup/schematic.png',
        },
      ],
      ino: {
        name: 'DigitalInputPullup.ino',
        path: '02.Digital/DigitalInputPullup/DigitalInputPullup.ino',
      },
      name: 'DigitalInputPullup',
      path: '02.Digital/DigitalInputPullup',
    },
  ],
};

export const EXPECTED_DIGITAL_EXAMPLES_FOLDERS: ExamplesFolder[] = [
  {
    name: '02.Digital',
    examples: [
      {
        files: [
          {
            name: 'DigitalInputPullup.txt',
            path: '02.Digital/DigitalInputPullup/DigitalInputPullup.txt',
          },
          {
            name: 'layout.png',
            path: '02.Digital/DigitalInputPullup/layout.png',
          },
          {
            name: 'schematic.png',
            path: '02.Digital/DigitalInputPullup/schematic.png',
          },
        ],
        ino: {
          name: 'DigitalInputPullup.ino',
          path: '02.Digital/DigitalInputPullup/DigitalInputPullup.ino',
        },
        name: 'DigitalInputPullup',
        path: '02.Digital/DigitalInputPullup',
      },
    ],
    examplesNumber: 1,
  },
];

export const MOCK_USB_EXAMPLES_RESPONSE: MockType = {
  examples: [
    {
      files: [
        {
          name: 'ButtonMouseControl.txt',
          path: '09.USB/Mouse/ButtonMouseControl/ButtonMouseControl.txt',
        },
        {
          name: 'layout.png',
          path: '09.USB/Mouse/ButtonMouseControl/layout.png',
        },
        {
          name: 'schematic.png',
          path: '09.USB/Mouse/ButtonMouseControl/schematic.png',
        },
      ],
      ino: {
        name: 'ButtonMouseControl.ino',
        path: '09.USB/Mouse/ButtonMouseControl/ButtonMouseControl.ino',
      },
      name: 'ButtonMouseControl',
      path: '09.USB/Mouse/ButtonMouseControl',
    },
    {
      files: [
        {
          name: 'KeyboardLogout.txt',
          path: '09.USB/Keyboard/KeyboardLogout/KeyboardLogout.txt',
        },
      ],
      ino: {
        name: 'KeyboardLogout.ino',
        path: '09.USB/Keyboard/KeyboardLogout/KeyboardLogout.ino',
      },
      name: 'KeyboardLogout',
      path: '09.USB/Keyboard/KeyboardLogout',
    },
    {
      files: [
        {
          name: 'KeyboardAndMouseControl.txt',
          path: '09.USB/KeyboardAndMouseControl/KeyboardAndMouseControl.txt',
        },
        {
          name: 'layout.png',
          path: '09.USB/KeyboardAndMouseControl/layout.png',
        },
        {
          name: 'schematic.png',
          path: '09.USB/KeyboardAndMouseControl/schematic.png',
        },
      ],
      ino: {
        name: 'KeyboardAndMouseControl.ino',
        path: '09.USB/KeyboardAndMouseControl/KeyboardAndMouseControl.ino',
      },
      name: 'KeyboardAndMouseControl',
      path: '09.USB/KeyboardAndMouseControl',
    },
    {
      files: [
        {
          name: 'JoystickMouseControl.txt',
          path: '09.USB/Mouse/JoystickMouseControl/JoystickMouseControl.txt',
        },
        {
          name: 'layout.png',
          path: '09.USB/Mouse/JoystickMouseControl/layout.png',
        },
        {
          name: 'schematic.png',
          path: '09.USB/Mouse/JoystickMouseControl/schematic.png',
        },
      ],
      ino: {
        name: 'JoystickMouseControl.ino',
        path: '09.USB/Mouse/JoystickMouseControl/JoystickMouseControl.ino',
      },
      name: 'JoystickMouseControl',
      path: '09.USB/Mouse/JoystickMouseControl',
    },
  ],
};

export const EXPECTED_USB_EXAMPLES_FOLDERS: ExamplesFolder[] = [
  {
    name: '09.USB',
    examples: [
      {
        name: 'Keyboard',
        examples: [
          {
            files: [
              {
                name: 'KeyboardLogout.txt',
                path: '09.USB/Keyboard/KeyboardLogout/KeyboardLogout.txt',
              },
            ],
            ino: {
              name: 'KeyboardLogout.ino',
              path: '09.USB/Keyboard/KeyboardLogout/KeyboardLogout.ino',
            },
            name: 'KeyboardLogout',
            path: '09.USB/Keyboard/KeyboardLogout',
          },
        ],
        examplesNumber: 1,
      },
      {
        files: [
          {
            name: 'KeyboardAndMouseControl.txt',
            path: '09.USB/KeyboardAndMouseControl/KeyboardAndMouseControl.txt',
          },
          {
            name: 'layout.png',
            path: '09.USB/KeyboardAndMouseControl/layout.png',
          },
          {
            name: 'schematic.png',
            path: '09.USB/KeyboardAndMouseControl/schematic.png',
          },
        ],
        ino: {
          name: 'KeyboardAndMouseControl.ino',
          path: '09.USB/KeyboardAndMouseControl/KeyboardAndMouseControl.ino',
        },
        name: 'KeyboardAndMouseControl',
        path: '09.USB/KeyboardAndMouseControl',
      },
      {
        name: 'Mouse',
        examples: [
          {
            files: [
              {
                name: 'ButtonMouseControl.txt',
                path: '09.USB/Mouse/ButtonMouseControl/ButtonMouseControl.txt',
              },
              {
                name: 'layout.png',
                path: '09.USB/Mouse/ButtonMouseControl/layout.png',
              },
              {
                name: 'schematic.png',
                path: '09.USB/Mouse/ButtonMouseControl/schematic.png',
              },
            ],
            ino: {
              name: 'ButtonMouseControl.ino',
              path: '09.USB/Mouse/ButtonMouseControl/ButtonMouseControl.ino',
            },
            name: 'ButtonMouseControl',
            path: '09.USB/Mouse/ButtonMouseControl',
          },
          {
            files: [
              {
                name: 'JoystickMouseControl.txt',
                path: '09.USB/Mouse/JoystickMouseControl/JoystickMouseControl.txt',
              },
              {
                name: 'layout.png',
                path: '09.USB/Mouse/JoystickMouseControl/layout.png',
              },
              {
                name: 'schematic.png',
                path: '09.USB/Mouse/JoystickMouseControl/schematic.png',
              },
            ],
            ino: {
              name: 'JoystickMouseControl.ino',
              path: '09.USB/Mouse/JoystickMouseControl/JoystickMouseControl.ino',
            },
            name: 'JoystickMouseControl',
            path: '09.USB/Mouse/JoystickMouseControl',
          },
        ],
        examplesNumber: 2,
      },
    ],
    examplesNumber: 4,
  },
];

export const MOCK_FULL_EXAMPLES_RESPONSE: MockType = {
  examples: [
    ...MOCK_BASICS_EXAMPLES_RESPONSE.examples,
    ...MOCK_DIGITAL_EXAMPLES_RESPONSE.examples,
    ...MOCK_USB_EXAMPLES_RESPONSE.examples,
  ],
};

export const EXPECTED_FULL_EXAMPLES_FOLDERS: ExamplesFolder[] = [
  ...EXPECTED_BASICS_EXAMPLES_FOLDERS,
  ...EXPECTED_DIGITAL_EXAMPLES_FOLDERS,
  ...EXPECTED_USB_EXAMPLES_FOLDERS,
];
