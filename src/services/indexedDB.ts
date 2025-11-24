import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Record, Media, UploadQueueItem } from '../types';
import { estimateMetadataSize } from '../utils/compression';

// Database schema definition
interface MonitoringDB extends DBSchema {
  records: {
    key: string;
    value: Record;
    indexes: { 
      'by-timestamp': number; 
      'by-synced': number; // Changed to number
      'by-timestamp-synced': [number, number]; // Changed to [number, number]
    };
  };
  media: {
    key: string;
    value: Media;
    indexes: { 'by-created': number };
  };
  uploads: {
    key: string;
    value: UploadQueueItem;
    indexes: { 'by-timestamp': number };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'monitoring-app-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<MonitoringDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<MonitoringDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<MonitoringDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('records')) {
        const recordStore = db.createObjectStore('records', { keyPath: 'id' });
        recordStore.createIndex('by-timestamp', 'timestamp');
        recordStore.createIndex('by-synced', 'synced');
        recordStore.createIndex('by-timestamp-synced', ['timestamp', 'synced']);
      }

      if (!db.objectStoreNames.contains('media')) {
        const mediaStore = db.createObjectStore('media', { keyPath: 'mediaId' });
        mediaStore.createIndex('by-created', 'createdAt');
      }

      if (!db.objectStoreNames.contains('uploads')) {
        const uploadsStore = db.createObjectStore('uploads', { keyPath: 'recordId' });
        uploadsStore.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
    blocked() {
      console.warn('Database upgrade blocked. Please close other tabs.');
    },
    blocking() {
      console.warn('This tab is blocking a database upgrade.');
    },
  });

  return dbInstance;
}

export async function addRecord(record: Record): Promise<void> {
  const db = await initDB();
  await db.add('records', record);
}

export async function getRecord(id: string): Promise<Record | undefined> {
  const db = await initDB();
  return db.get('records', id);
}

export async function updateRecord(record: Record): Promise<void> {
  const db = await initDB();
  await db.put('records', record);
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await initDB();
  const record = await db.get('records', id);
  
  if (record) {
    for (const mediaId of record.mediaIds) {
      await deleteMedia(mediaId);
    }
    await deleteUploadQueueItem(id).catch(() => {});
    await db.delete('records', id);
  }
}

export async function getAllRecords(): Promise<Record[]> {
  const db = await initDB();
  return db.getAllFromIndex('records', 'by-timestamp');
}

export async function getUnsyncedRecords(): Promise<Record[]> {
  const db = await initDB();
  const tx = db.transaction('records', 'readonly');
  const index = tx.store.index('by-synced');
  // Query for 0 (unsynced) instead of false
  return index.getAll(0);
}

export async function getOldestRecords(limit: number): Promise<Record[]> {
  const db = await initDB();
  const tx = db.transaction('records', 'readonly');
  const index = tx.store.index('by-timestamp');
  
  const records: Record[] = [];
  let cursor = await index.openCursor();
  
  while (cursor && records.length < limit) {
    records.push(cursor.value);
    cursor = await cursor.continue();
  }
  
  return records;
}

export async function addMedia(media: Media): Promise<void> {
  const db = await initDB();
  await db.add('media', media);
}

export async function getMedia(mediaId: string): Promise<Media | undefined> {
  const db = await initDB();
  return db.get('media', mediaId);
}

export async function deleteMedia(mediaId: string): Promise<void> {
  const db = await initDB();
  await db.delete('media', mediaId);
}

export async function getAllMedia(): Promise<Media[]> {
  const db = await initDB();
  return db.getAll('media');
}

export async function addToUploadQueue(item: UploadQueueItem): Promise<void> {
  const db = await initDB();
  await db.put('uploads', item);
}

export async function getUploadQueue(): Promise<UploadQueueItem[]> {
  const db = await initDB();
  return db.getAllFromIndex('uploads', 'by-timestamp');
}

export async function deleteUploadQueueItem(recordId: string): Promise<void> {
  const db = await initDB();
  await db.delete('uploads', recordId);
}

export async function clearUploadQueue(): Promise<void> {
  const db = await initDB();
  await db.clear('uploads');
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await initDB();
  return db.get('settings', key);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await initDB();
  await db.put('settings', value, key);
}

export async function calculateStorageSize(): Promise<number> {
  const db = await initDB();
  let totalSize = 0;

  const allMedia = await db.getAll('media');
  for (const media of allMedia) {
    totalSize += media.size;
    if (media.thumbnailBlob) {
      totalSize += media.thumbnailBlob.size;
    }
  }

  const allRecords = await db.getAll('records');
  for (const record of allRecords) {
    totalSize += estimateMetadataSize(record);
  }

  const uploadQueue = await db.getAll('uploads');
  totalSize += estimateMetadataSize(uploadQueue);

  return totalSize;
}

export async function clearAllData(): Promise<void> {
  const db = await initDB();
  await db.clear('records');
  await db.clear('media');
  await db.clear('uploads');
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}