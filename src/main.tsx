import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { TierLimitsProvider } from './context/TierLimitsContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TierLimitsProvider>
      <App />
    </TierLimitsProvider>
  </StrictMode>
);

// Offline app shell (TE-82). Production only: in dev the worker would cache the
// Vite shell and hide HMR updates. Registered after load so it never competes with
// the first paint.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('[sw] registration failed:', err));
  });
}
