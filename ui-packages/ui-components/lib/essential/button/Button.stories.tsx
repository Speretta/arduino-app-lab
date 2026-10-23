import { Meta } from '@storybook/react-vite';

import { TextSize } from '../../typography';
import { Button, ButtonType } from './';

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
  title: 'Essential/Button',
  component: Button,
} as Meta<typeof Button>;

// Every button type × its most relevant states
const types = [
  { type: ButtonType.Primary, label: 'Primary' },
  { type: ButtonType.Secondary, label: 'Secondary' },
  { type: ButtonType.Tertiary, label: 'Tertiary' },
  { type: ButtonType.Warning, label: 'Warning' },
];

const AllTypesContent = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    {types.map(({ type, label }) => (
      <div
        key={label}
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <span style={{ fontSize: '11px', color: '#8a9499', fontWeight: 600 }}>
          {label}
        </span>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Button type={type}>{label}</Button>
          <Button type={type} Icon={PlusIcon} iconPosition="left">
            {label}
          </Button>
          <Button type={type} Icon={PlusIcon} iconPosition="right">
            {label}
          </Button>
          <Button type={type} size={TextSize.XSmall}>
            {label} Small
          </Button>
          <Button type={type} uppercase={false}>
            {label}
          </Button>
          <Button type={type} loading>
            {label}
          </Button>
          <Button type={type} disabled>
            {label}
          </Button>
        </div>
      </div>
    ))}
  </div>
);

export const AllVariants = () => <AllTypesContent />;
