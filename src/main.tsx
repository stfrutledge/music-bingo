import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';
import { seedDatabaseIfEmpty } from './lib/seedData';
import { getAllCustomPatterns } from './lib/db';
import { setCustomPatterns } from './lib/patterns';

// Register service worker
registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload?')) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

// Load persisted state before first render so synchronous pattern lookups
// (getPatternById) can resolve custom patterns throughout the game flow.
async function bootstrap() {
  await seedDatabaseIfEmpty();
  try {
    setCustomPatterns(await getAllCustomPatterns());
  } catch (e) {
    console.warn('Could not load custom patterns:', e);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
