import './style.css';

import { createRoot } from 'react-dom/client';

import App from './App';
import { registerCspViolationLogging } from './csp/cspViolations';
import { registerUIZoomShortcuts } from './zoom/uiZoom';

// Before anything renders, so no request the policy refuses goes unreported.
registerCspViolationLogging();
registerUIZoomShortcuts().catch((err: unknown) => {
  console.error('[zoom] could not register the zoom shortcuts', err);
});

const container = document.getElementById('root');

const root = createRoot(container!);

root.render(<App />);
