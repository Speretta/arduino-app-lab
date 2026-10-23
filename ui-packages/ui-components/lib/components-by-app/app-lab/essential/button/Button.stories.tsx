import { Meta } from '@storybook/react-vite';

import { Button, ButtonAppearance, ButtonSize, ButtonVariant } from './';

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 3.5V12.5M3.5 8H12.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default {
  title: 'App Lab Essential/Button',
  component: Button,
} as Meta<typeof Button>;

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#8a9499',
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  flexWrap: 'wrap',
};

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

// Every variant × appearance combination, plus a sizes and a states showcase.
const AllContent = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    {variants.map(({ variant, label: variantLabel }) => (
      <div
        key={variantLabel}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <span style={sectionLabelStyle}>{variantLabel}</span>
        <div style={rowStyle}>
          {appearances.map(({ appearance, label: appearanceLabel }) => (
            <Button
              key={appearanceLabel}
              variant={variant}
              appearance={appearance}
            >
              {appearanceLabel}
            </Button>
          ))}
        </div>
      </div>
    ))}

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Sizes</span>
      <div style={rowStyle}>
        {sizes.map(({ size, label }) => (
          <Button key={label} size={size}>
            {label}
          </Button>
        ))}
      </div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>States</span>
      <div style={rowStyle}>
        <Button>Default</Button>
        <Button Icon={PlusIcon} iconPosition="left">
          Icon left
        </Button>
        <Button Icon={PlusIcon} iconPosition="right">
          Icon right
        </Button>
        <Button uppercase>Uppercase</Button>
        <Button bold>Bold</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </div>
    </div>
  </div>
);

export const AllVariants = () => <AllContent />;
