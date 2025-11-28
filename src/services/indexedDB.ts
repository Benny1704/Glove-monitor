import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Record, UploadQueueItem } from '../types';

interface MonitoringDB extends DBSchema {
  records: {
    key: string;
    value: Record;
    indexes: { 
      'by-timestamp': number; 
      'by-synced': number; 
    };
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
const DB_VERSION = 2; // Version bumped for schema changes

let dbInstance: IDBPDatabase<MonitoringDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<MonitoringDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<MonitoringDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('records')) {
        const recordStore = db.createObjectStore('records', { keyPath: 'id' });
        recordStore.createIndex('by-timestamp', 'timestamp');
        recordStore.createIndex('by-synced', 'synced');
      }

      if (!db.objectStoreNames.contains('uploads')) {
        const uploadsStore = db.createObjectStore('uploads', { keyPath: 'recordId' });
        uploadsStore.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
      
      // Clean up old media store from previous version if it exists
      if (db.objectStoreNames.contains('media' as any)) {
        db.deleteObjectStore('media' as any);
      }
    },
  });

  return dbInstance;
}

// --- Record Operations ---

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

export async function deleteRecordMetadata(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('records', id);
  await deleteUploadQueueItem(id).catch(() => {});
}

export async function getAllRecords(): Promise<Record[]> {
  const db = await initDB();
  return db.getAllFromIndex('records', 'by-timestamp');
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

// --- Upload Queue Operations ---

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

// --- Settings Operations ---

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await initDB();
  return db.get('settings', key);
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await initDB();
  await db.put('settings', value, key);
}

// --- Maintenance ---

export async function clearAllMetadata(): Promise<void> {
  const db = await initDB();
  await db.clear('records');
  await db.clear('uploads');
}