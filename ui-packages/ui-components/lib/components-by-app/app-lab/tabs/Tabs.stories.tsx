import { Meta } from '@storybook/react-vite';
import React from 'react';

import { Tabs } from './';

export default {
  title: 'App Lab/Tabs',
  component: Tabs,
} as Meta<typeof Tabs>;

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#8a9499',
  fontWeight: 600,
};

const tabs = ['Tab 1', 'Tab 2', 'Tab 3'] as const;

// Renames the raw tab values for display, the way a caller would label
// short internal keys.
const tabDictionary = (tab: 'write' | 'preview'): string =>
  tab === 'write' ? 'Write' : 'Preview';

// Both sizes, with and without a background, plus a labelled set.
const AllContent = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Default size</span>
      <Tabs tabs={tabs} size="default" />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>Small size</span>
      <Tabs tabs={tabs} size="small" />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>With background</span>
      <Tabs tabs={tabs} size="default" withBackground />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={sectionLabelStyle}>With tab dictionary</span>
      <Tabs
        tabs={['write', 'preview'] as const}
        size="default"
        withBackground
        tabDictionary={tabDictionary}
      />
    </div>
  </div>
);

export const AllDarkTheme = () => <AllContent />;

// Controlled mode: the active tab is owned by the caller.
export const Controlled = () => {
  const [activeTab, setActiveTab] = React.useState<string>('Tab 1');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Tabs
        tabs={['Tab 1', 'Tab 2', 'Tab 3', 'Tab 4']}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        size="default"
        withBackground
      />
      <span style={{ fontSize: '12px', color: '#8a9499' }}>
        Active tab: {activeTab}
      </span>
    </div>
  );
};
