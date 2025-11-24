/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin, Queue } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope;

// Precache app shell and static assets
precacheAndRoute(self.__WB_MANIFEST);

// Cache images with CacheFirst strategy
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// Cache CSS and JS with StaleWhileRevalidate
registerRoute(
  ({ request }) =>
    request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Network-first for API calls with background sync fallback
const bgSyncPlugin = new BackgroundSyncPlugin('upload-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
});

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      bgSyncPlugin,
    ],
  })
);

// Background Sync - Process upload queue
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'upload-queue') {
    event.waitUntil(processUploadQueue());
  }
});

async function processUploadQueue() {
  console.log('Processing upload queue...');

  try {
    // Import the upload manager functionality
    // Note: In a real app, you'd need to implement this logic in the service worker
    // or use a library like idb to access IndexedDB from the service worker
    
    const queue = new Queue('upload-queue');
    await queue.replayRequests();
    
    console.log('Upload queue processed successfully');
  } catch (error) {
    console.error('Failed to process upload queue:', error);
    throw error; // Rethrow to trigger retry
  }
}

// Push notification handler
self.addEventListener('push', (event: PushEvent) => {
  console.log('Push notification received');

  let data: any = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      data = { title: 'New Notification', body: event.data.text() };
    }
  }

  const options: NotificationOptions = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Monitoring App', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data;

  event.waitUntil(
    (async () => {
      if (action === 'close') {
        return;
      }

      // Get all window clients
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Focus existing window or open new one
      if (clients.length > 0) {
        const client = clients[0];
        
        // Navigate to specific page if data contains URL
        if (data.url) {
          await client.navigate(data.url);
        }
        
        return client.focus();
      } else {
        const url = data.url || '/';
        return self.clients.openWindow(url);
      }
    })()
  );
});

// Skip waiting and claim clients
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    self.clients.claim();
  }
});

// Install event
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      const cacheWhitelist = ['images', 'static-resources', 'api'];
      
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.some((name) => cacheName.includes(name))) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      // Claim all clients
      return self.clients.claim();
    })()
  );
});

// Handle fetch errors gracefully
self.addEventListener('fetch', (event: FetchEvent) => {
  // Skip non-HTTP requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Try network first for navigation requests
        if (event.request.mode === 'navigate') {
          try {
            return await fetch(event.request);
          } catch (error) {
            // Return cached app shell on network failure
            const cache = await caches.open('workbox-precache-v2');
            return (await cache.match('/index.html')) || new Response('Offline');
          }
        }

        // For other requests, let Workbox handle it
        // This will use the strategies defined above
        return await fetch(event.request);
      } catch (error) {
        console.error('Fetch failed:', error);
        
        // Try to return cached version
        const cache = await caches.match(event.request);
        if (cache) {
          return cache;
        }

        // Return offline page or error
        return new Response('Network error occurred', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })()
  );
});

console.log('Service Worker loaded');