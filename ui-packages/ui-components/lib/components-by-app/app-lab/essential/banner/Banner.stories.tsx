import { Meta } from '@storybook/react-vite';

import { Banner } from './';

export default {
  title: 'App Lab Essential/Banner',
  component: Banner,
} as Meta<typeof Banner>;

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#8a9499',
  fontWeight: 600,
};

// All banner types: waiting, loading (indeterminate), loading with progress.
export const Waiting = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <span style={sectionLabelStyle}>Waiting</span>
    <Banner
      type="waiting"
      title="Waiting for board"
      description="Please connect your board to continue."
    />
  </div>
);

export const Loading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <span style={sectionLabelStyle}>Loading (indeterminate)</span>
    <Banner type="loading" title="Loading…" />
  </div>
);
export const LoadingWithProgress = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <span style={sectionLabelStyle}>Loading (with progress)</span>
    <Banner type="loading" title="Uploading sketch" progress={45} />
  </div>
);
