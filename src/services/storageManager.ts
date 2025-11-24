import { StorageStats, StorageSettings } from '../types';
import {
  calculateStorageSize,
  getSetting,
  setSetting,
  getOldestRecords,
  deleteRecord,
} from './indexedDB';

const DEFAULT_SETTINGS: StorageSettings = {
  maxStoragePercent: 80, // Use up to 80% of available quota
  warnThresholdPercent: 80,
  autoEvict: true,
};

// Get storage estimate from browser
export async function getStorageEstimate(): Promise<StorageStats> {
  let usage = 0;
  let quota = 0;

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    usage = estimate.usage || 0;
    quota = estimate.quota || 0;
  }

  // Calculate IndexedDB size
  const indexedDBSize = await calculateStorageSize();

  // Estimate cache size (iterate through caches)
  let cacheSize = 0;
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            cacheSize += blob.size;
          }
        }
      }
    } catch (error) {
      console.warn('Could not calculate cache size:', error);
    }
  }

  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

  return {
    usage,
    quota,
    indexedDBSize,
    cacheSize,
    percentUsed,
  };
}

// Get storage settings
export async function getStorageSettings(): Promise<StorageSettings> {
  const settings = await getSetting<StorageSettings>('storageSettings');
  return settings || DEFAULT_SETTINGS;
}

// Update storage settings
export async function updateStorageSettings(
  settings: Partial<StorageSettings>
): Promise<void> {
  const current = await getStorageSettings();
  const updated = { ...current, ...settings };
  await setSetting('storageSettings', updated);
}

// Check if storage is approaching limit
export async function isStorageWarning(): Promise<boolean> {
  const stats = await getStorageEstimate();
  const settings = await getStorageSettings();
  
  return stats.percentUsed >= settings.warnThresholdPercent;
}

// Calculate maximum allowed storage based on settings
export async function getMaxAllowedStorage(): Promise<number> {
  const stats = await getStorageEstimate();
  const settings = await getStorageSettings();

  if (settings.maxStorageMB) {
    return settings.maxStorageMB * 1024 * 1024; // Convert MB to bytes
  }

  if (settings.maxStoragePercent && stats.quota > 0) {
    return (stats.quota * settings.maxStoragePercent) / 100;
  }

  return stats.quota; // No limit
}

// Check if new data can fit within storage limits
export async function canStoreData(sizeBytes: number): Promise<boolean> {
  const stats = await getStorageEstimate();
  const maxAllowed = await getMaxAllowedStorage();
  const settings = await getStorageSettings();

  if (!settings.autoEvict) {
    return stats.usage + sizeBytes <= maxAllowed;
  }

  // With auto-evict enabled, we can always store if we can evict enough
  return true;
}

// Evict oldest records to free up space (LRU strategy)
export async function evictOldRecords(
  targetBytes: number
): Promise<{ evicted: number; freedBytes: number }> {
  let freedBytes = 0;
  let evicted = 0;

  // Get oldest records first
  const oldestRecords = await getOldestRecords(100); // Fetch in batches

  for (const record of oldestRecords) {
    if (freedBytes >= targetBytes) {
      break;
    }

    // Skip synced records if possible, delete unsynced as last resort
    if (!record.synced) {
      console.warn('Evicting unsynced record:', record.id);
    }

    await deleteRecord(record.id);
    freedBytes += record.sizeBytes;
    evicted++;
  }

  return { evicted, freedBytes };
}

// Ensure storage space before adding new data
export async function ensureStorageSpace(requiredBytes: number): Promise<void> {
  const stats = await getStorageEstimate();
  const maxAllowed = await getMaxAllowedStorage();
  const settings = await getStorageSettings();

  const projectedUsage = stats.usage + requiredBytes;

  if (projectedUsage <= maxAllowed) {
    return; // Enough space available
  }

  if (!settings.autoEvict) {
    throw new Error(
      `Storage limit exceeded. Need ${requiredBytes} bytes but only ${
        maxAllowed - stats.usage
      } bytes available.`
    );
  }

  // Calculate how much to evict
  const bytesToFree = projectedUsage - maxAllowed + requiredBytes * 0.1; // Add 10% buffer

  const result = await evictOldRecords(bytesToFree);
  
  console.log(
    `Evicted ${result.evicted} records, freed ${result.freedBytes} bytes`
  );

  // Verify we have enough space now
  const updatedStats = await getStorageEstimate();
  if (updatedStats.usage + requiredBytes > maxAllowed) {
    throw new Error('Could not free enough storage space');
  }
}

// Clear browser caches
export async function clearCaches(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
}

// Request persistent storage (Chrome/Edge)
export async function requestPersistentStorage(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    const isPersisted = await navigator.storage.persist();
    return isPersisted;
  }
  return false;
}

// Check if storage is persisted
export async function isStoragePersisted(): Promise<boolean> {
  if ('storage' in navigator && 'persisted' in navigator.storage) {
    return navigator.storage.persisted();
  }
  return false;
}