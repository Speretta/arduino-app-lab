import * as icons from '@cloud-editor-mono/images/assets/icons';
import { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';

import {
  ButtonAppearance,
  ButtonSize,
  ButtonVariant,
} from '../button/Button.type';
import { IconButton } from './';

// The full set of available icons, imported as a namespace so the Icon control's
// options/mapping stay in sync with `@cloud-editor-mono/images/assets/icons`.
// A component prop can't be a plain control value on its own, so serializable
// keys are mapped to the actual components. See
// https://storybook.js.org/docs/essentials/controls
const variants = [
  { variant: ButtonVariant.Primary, label: 'Primary' },
  { variant: ButtonVariant.Secondary, label: 'Secondary' },
  { variant: ButtonVariant.Tertiary, label: 'Tertiary' },
];

const appearances = [
  { appearance: ButtonAppearance.Action, label: 'Action' },
  { appearance: ButtonAppearance.Destructive, label: 'Destructive' },
  { appearance: ButtonAppearance.LowContrast, label: 'Low Contrast' },
];

const sizes = [
  { size: ButtonSize.XXSmall, label: 'XX-Small' },
  { size: ButtonSize.XSmall, label: 'X-Small' },
  { size: ButtonSize.Small, label: 'Small' },
  { size: ButtonSize.Large, label: 'Large' },
];

// Maps each option value to a capitalized display label for the select controls.
const variantLabels = Object.fromEntries(
  variants.map(({ variant, label }) => [variant, label]),
);
const appearanceLabels = Object.fromEntries(
  appearances.map(({ appearance, label }) => [appearance, label]),
);
const sizeLabels = Object.fromEntries(
  sizes.map(({ size, label }) => [size, label]),
);

export default {
  title: 'App Lab Essential/IconButton',
  component: IconButton,
  argTypes: {
    Icon: {
      options: Object.keys(icons),
      mapping: icons,
      control: { type: 'select' },
    },
    variant: {
      options: Object.values(ButtonVariant),
      control: { type: 'select', labels: variantLabels },
    },
    appearance: {
      options: Object.values(ButtonAppearance),
      control: { type: 'select', labels: appearanceLabels },
    },
    size: {
      options: Object.values(ButtonSize),
      control: { type: 'select', labels: sizeLabels },
    },
  },
} as Meta<typeof IconButton>;

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  flexWrap: 'wrap',
};

// Interactive story: pick the icon, variant, appearance, size and theme from
// the Controls panel.
export const AllVariantsAndSizes: StoryObj<typeof IconButton> = {
  args: {
    label: 'Icon button',
    Icon: 'ArduinoLogo' as unknown as React.FC<React.SVGProps<SVGSVGElement>>,
    variant: ButtonVariant.Primary,
    appearance: ButtonAppearance.Action,
    size: ButtonSize.Small,
    disabled: false,
    hideTooltip: false,
  },
  render: (args) => <AllContent {...args} />,
};

// Every variant × appearance combination, plus a sizes and a states showcase.
// hideTooltip keeps the matrix readable (the tooltip is demoed in the Tooltip story).
const AllContent = (args: StoryObj<typeof IconButton>['args']) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    {variants.map(({ variant, label: variantLabel }) => (
      <div
        key={variantLabel}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <span style={sectionLabelStyle}>{variantLabel}</span>
        <div style={rowStyle}>
          {appearances.map(({ appearance, label: appearanceLabel }) => (
            <IconButton
              key={appearanceLabel}
              label={`${variantLabel} ${appearanceLabel}`}
              Icon={args?.Icon || icons.ArduinoLogo}
              variant={variant}
              appearance={appearance}
              hideTooltip
            />
          ))}
        </div>
      </div>
    ))}

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Sizes</span>
      <div style={rowStyle}>
        {sizes.map(({ size, label }) => (
          <IconButton
            key={label}
            label={label}
            Icon={args?.Icon || icons.ArduinoLogo}
            size={size}
            hideTooltip
          />
        ))}
      </div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Disabled</span>
      <div style={rowStyle}>
        <IconButton
          label="Disabled"
          Icon={args?.Icon || icons.ArduinoLogo}
          disabled
          hideTooltip
        />
      </div>
    </div>
  </div>
);
