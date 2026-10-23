import { Meta } from '@storybook/react-vite';
import React from 'react';

import { Toggle } from './';

export default {
  title: 'App Lab Essential/Toggle',
  component: Toggle,
} as Meta<typeof Toggle>;

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#8a9499',
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'center',
  flexWrap: 'wrap',
};

// Off / On (uncontrolled via defaultSelected) and their disabled counterparts.
const AllContent = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Enabled</span>
      <div style={rowStyle}>
        <Toggle aria-label="Toggle off" />
        <Toggle aria-label="Toggle on" defaultSelected />
      </div>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Disabled</span>
      <div style={rowStyle}>
        <Toggle aria-label="Toggle off disabled" isDisabled />
        <Toggle aria-label="Toggle on disabled" defaultSelected isDisabled />
      </div>
    </div>
  </div>
);

export const AllVariants = () => <AllContent />;
