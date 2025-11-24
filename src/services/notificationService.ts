import { PushSubscriptionData } from '../types';

const VAPID_PUBLIC_KEY = 'BPgXBqqmKPo43Cj8-CK4uKWML49lec4Cgab1OPQlzwHPKLtiJ5E6sMDUMV4e8Jdh086u7YPHmzUxCK3h7bFLBrI';
const PUSH_SERVER_ENDPOINT = '/api/push/subscribe'; // Configure your endpoint

// Check if notifications are supported
export function areNotificationsSupported(): boolean {
  return 'Notification' in window;
}

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!areNotificationsSupported()) {
    throw new Error('Notifications not supported');
  }

  return Notification.requestPermission();
}

// Show a local notification
export async function showLocalNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  const permission = await requestNotificationPermission();

  if (permission === 'granted') {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [200, 100, 200],
        ...options,
      });
    } else {
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        ...options,
      });
    }
  }
}

// Subscribe to push notifications
export async function subscribeToPush(
  vapidPublicKey: string
): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported');
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // Convert to JSON
    const subscriptionJSON = subscription.toJSON();
    
    const pushData: PushSubscriptionData = {
      endpoint: subscriptionJSON.endpoint || '',
      keys: {
        p256dh: subscriptionJSON.keys?.p256dh || '',
        auth: subscriptionJSON.keys?.auth || '',
      },
    };

    // Send subscription to server
    await fetch(PUSH_SERVER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pushData),
    });

    return pushData;
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
    throw error;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      
      // Notify server
      await fetch(PUSH_SERVER_ENDPOINT, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
  } catch (error) {
    console.error('Failed to unsubscribe from push:', error);
    throw error;
  }
}

// Check current push subscription status
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('Failed to get push subscription:', error);
    return null;
  }
}

// Helper: Convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Notification templates
export const notificationTemplates = {
  recordSaved: (recordId: string) => ({
    title: 'Record Saved',
    body: `Record ${recordId.slice(0, 8)} saved successfully`,
    tag: `record-${recordId}`,
    data: { recordId, action: 'view' },
  }),

  uploadComplete: (recordId: string) => ({
    title: 'Upload Complete',
    body: `Record ${recordId.slice(0, 8)} synced to server`,
    tag: `upload-${recordId}`,
    data: { recordId, action: 'view' },
  }),

  uploadFailed: (recordId: string) => ({
    title: 'Upload Failed',
    body: `Failed to sync record ${recordId.slice(0, 8)}. Will retry.`,
    tag: `upload-fail-${recordId}`,
    data: { recordId, action: 'retry' },
  }),

  storageWarning: (percentUsed: number) => ({
    title: 'Storage Warning',
    body: `Storage is ${percentUsed.toFixed(0)}% full. Consider clearing old data.`,
    tag: 'storage-warning',
    data: { action: 'settings' },
  }),

  syncComplete: (count: number) => ({
    title: 'Sync Complete',
    body: `${count} record(s) synced successfully`,
    tag: 'sync-complete',
  }),
};