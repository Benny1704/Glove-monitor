import type { StorageStats, StorageSettings, StorageBreakdown, Record } from '../types';
import { getSetting, setSetting, getOldestRecords, getAllRecords } from './indexedDB';
import { removeRecord } from './dataManager';
import { getOPFSStats } from './fileSystem';
import { estimateMetadataSize } from '../utils/compression';

const DEFAULT_SETTINGS: StorageSettings = {
  maxStorageMB: 0, // 0 = unlimited
  warnThresholdPercent: 80,
  autoEvict: false,
  retentionDays: 0, // 0 = forever
  deleteSyncedOnly: true,
  imageCompressionQuality: 0.8,
  videoThumbnailQuality: 0.7,
};

export async function getStorageEstimate(): Promise<StorageStats> {
  let usage = 0;
  let quota = 0;
  let opfsStats = { size: 0, count: 0 };
  let recordCount = 0;
  let idbBytes = 0;

  // Get Browser Estimate
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    usage = estimate.usage || 0;
    quota = estimate.quota || 0;
  }

  // Get Specific Breakdowns
  try {
    const [opfs, records] = await Promise.all([
      getOPFSStats(),
      getAllRecords()
    ]);
    
    opfsStats = opfs;
    recordCount = records.length;
    
    // Estimate IDB size based on JSON size of records
    idbBytes = estimateMetadataSize(records);
  } catch (e) {
    console.warn('Failed to get detailed stats', e);
  }

  // Calculate Cache Storage (Service Worker caches)
  let cacheBytes = 0;
  if ('caches' in window) {
    // Note: detailed cache size is tricky without iterating everything, 
    // we deduce it from total usage - (opfs + idb) as an approximation
    // or usageDetails if available (Chrome specific)
    cacheBytes = Math.max(0, usage - (opfsStats.size + idbBytes));
  }

  const breakdown: StorageBreakdown = {
    opfsBytes: opfsStats.size,
    idbBytes: idbBytes,
    cacheBytes: cacheBytes,
    systemBytes: Math.max(0, usage - (opfsStats.size + idbBytes + cacheBytes))
  };

  return {
    usage,
    quota,
    percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
    breakdown,
    recordCount,
    fileCount: opfsStats.count
  };
}

export async function getStorageSettings(): Promise<StorageSettings> {
  const settings = await getSetting<StorageSettings>('storageSettings');
  return { ...DEFAULT_SETTINGS, ...settings };
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

/**
 * Runs the eviction policy based on settings.
 * Can be called manually or before adding new files.
 */
export async function applyRetentionPolicy(): Promise<number> {
  const settings = await getStorageSettings();
  let deletedCount = 0;

  // 1. Retention Days Policy
  if (settings.retentionDays > 0) {
    const cutoffDate = Date.now() - (settings.retentionDays * 24 * 60 * 60 * 1000);
    const allRecords = await getAllRecords();
    
    for (const record of allRecords) {
      // Skip if sync-only delete is enabled and record isn't synced
      if (settings.deleteSyncedOnly && !record.synced) continue;

      if (record.timestamp < cutoffDate) {
        await removeRecord(record.id);
        deletedCount++;
      }
    }
  }

  return deletedCount;
}

export async function ensureStorageSpace(requiredBytes: number): Promise<void> {
  const stats = await getStorageEstimate();
  const settings = await getStorageSettings();
  const projectedUsage = stats.usage + requiredBytes;

  // 1. Determine the effective limit
  let maxAllowedBytes = stats.quota;
  if (settings.maxStorageMB > 0) {
    const userLimit = settings.maxStorageMB * 1024 * 1024;
    maxAllowedBytes = Math.min(stats.quota, userLimit);
  }

  // 2. Check if we are within limits
  if (projectedUsage <= maxAllowedBytes) {
    return; 
  }

  if (!settings.autoEvict) {
    throw new Error(
      `Storage limit exceeded. Need ${requiredBytes} bytes but only ${
        Math.max(0, maxAllowedBytes - stats.usage)
      } bytes available (User Limit: ${settings.maxStorageMB > 0 ? settings.maxStorageMB + 'MB' : 'Browser Quota'}).`
    );
  }

  // 3. Eviction Logic
  const bytesToFree = projectedUsage - maxAllowedBytes + (requiredBytes * 0.2); // 20% buffer
  let freedBytes = 0;
  
  // Run retention policy first as it's the safest delete
  await applyRetentionPolicy();
  
  // If we still need space, start deleting oldest
  const oldestRecords = await getOldestRecords(100);
  
  for (const record of oldestRecords) {
    if (freedBytes >= bytesToFree) break;

    // Protection: If strict sync delete is on, never delete unsynced even if full
    if (settings.deleteSyncedOnly && !record.synced) continue;

    await removeRecord(record.id);
    freedBytes += record.sizeBytes;
  }

  // Final check
  const updatedStats = await getStorageEstimate();
  if (updatedStats.usage + requiredBytes > maxAllowedBytes) {
    throw new Error('Storage full. Auto-eviction could not free enough space (protected unsynced records).');
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
    const isPersisted = await navigator.storage.persisted();
    if (isPersisted) return true;
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