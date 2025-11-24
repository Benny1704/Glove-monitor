import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// Register service worker
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (confirm('New version available! Reload to update?')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
  });
}

// Request notification permission on startup
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().then((permission) => {
    console.log('Notification permission:', permission);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);