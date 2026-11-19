import 'leaflet/dist/leaflet.css';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Evict stale basemap or API caches and unregister any outdated service workers
if (typeof window !== 'undefined') {
  if ('caches' in window) {
    void caches.keys().then((names) => {
      for (const name of names) {
        if (name === 'skydeck-basemap-tiles' || name === 'skydeck-api-cache' || name === 'skydeck-rainviewer-radar') {
          void caches.delete(name);
        }
      }
    });
  }
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        void reg.unregister();
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(<App />);
