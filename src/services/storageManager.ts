import type { StorageStats, StorageSettings } from '../types';
import { getSetting, setSetting, getOldestRecords } from './indexedDB';
import { removeRecord } from './dataManager';

const DEFAULT_SETTINGS: StorageSettings = {
  maxStoragePercent: 80, 
  warnThresholdPercent: 80,
  autoEvict: true,
};

export async function getStorageEstimate(): Promise<StorageStats> {
  let usage = 0;
  let quota = 0;

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    usage = estimate.usage || 0;
    quota = estimate.quota || 0;
  }

  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

  return {
    usage,
    quota,
    percentUsed,
  };
}

export async function getStorageSettings(): Promise<StorageSettings> {
  const settings = await getSetting<StorageSettings>('storageSettings');
  return settings || DEFAULT_SETTINGS;
}

export async function updateStorageSettings(settings: Partial<StorageSettings>): Promise<void> {
  const current = await getStorageSettings();
  const updated = { ...current, ...settings };
  await setSetting('storageSettings', updated);
}

export async function isStorageWarning(): Promise<boolean> {
  const stats = await getStorageEstimate();
  const settings = await getStorageSettings();
  return stats.percentUsed >= settings.warnThresholdPercent;
}

export async function ensureStorageSpace(requiredBytes: number): Promise<void> {
  const stats = await getStorageEstimate();
  const settings = await getStorageSettings();
  const projectedUsage = stats.usage + requiredBytes;

  // Calculate limit
  let maxAllowedBytes = stats.quota;
  if (settings.maxStorageMB) {
    maxAllowedBytes = settings.maxStorageMB * 1024 * 1024;
  } else if (settings.maxStoragePercent) {
    maxAllowedBytes = (stats.quota * settings.maxStoragePercent) / 100;
  }

  if (projectedUsage <= maxAllowedBytes) {
    return; 
  }

  if (!settings.autoEvict) {
    throw new Error(
      `Storage limit exceeded. Need ${requiredBytes} bytes but only ${
        maxAllowedBytes - stats.usage
      } bytes available.`
    );
  }

  // Eviction logic
  const bytesToFree = projectedUsage - maxAllowedBytes + (requiredBytes * 0.1); // 10% buffer
  let freedBytes = 0;
  let evictedCount = 0;

  const oldestRecords = await getOldestRecords(50);
  
  for (const record of oldestRecords) {
    if (freedBytes >= bytesToFree) break;

    // Prefer deleting synced records, but will delete unsynced if necessary to save app
    // from crashing or being unable to work
    await removeRecord(record.id);
    freedBytes += record.sizeBytes;
    evictedCount++;
  }

  console.log(`Evicted ${evictedCount} records, freed ${freedBytes} bytes`);

  // Double check
  const updatedStats = await getStorageEstimate();
  if (updatedStats.usage + requiredBytes > maxAllowedBytes) {
    throw new Error('Could not free enough storage space. Please delete items manually.');
  }
}

export async function clearCaches(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    return await navigator.storage.persist();
  }
  return false;
}

export async function isStoragePersisted(): Promise<boolean> {
  if ('storage' in navigator && 'persisted' in navigator.storage) {
    return await navigator.storage.persisted();
  }
  return false;
}