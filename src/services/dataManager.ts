import { generateUUID } from '../utils/uuid';
import { saveFileToOPFS, getFileFromOPFS, deleteFileFromOPFS, clearOPFS } from './fileSystem';
import * as db from './indexedDB';
import type { Record, MediaMetadata, FormData } from '../types';
import { saveAndQueueRecord } from './uploadManager';

export interface FileInput {
  blob: Blob;
  type: 'photo' | 'video' | 'file';
  thumbnail?: Blob;
  originalName?: string;
}

/**
 * Create a new record by saving files to OPFS and metadata to IndexedDB
 */
export async function createRecord(
  formData: FormData,
  files: FileInput[]
): Promise<Record> {
  const timestamp = Date.now();
  const mediaMetadata: MediaMetadata[] = [];
  let totalSize = 0;

  // 1. Save all files to OPFS first
  for (const file of files) {
    // Determine extension from mime type or default to bin
    const mimeParts = file.blob.type.split('/');
    const ext = mimeParts[1] ? mimeParts[1].split(';')[0] : 'bin';
    
    const fileName = await saveFileToOPFS(file.blob, ext);
    let thumbnailFileName: string | undefined;

    if (file.thumbnail) {
      thumbnailFileName = await saveFileToOPFS(file.thumbnail, 'jpg');
      totalSize += file.thumbnail.size;
    }

    totalSize += file.blob.size;

    mediaMetadata.push({
      mediaId: generateUUID(),
      type: file.type,
      mimeType: file.blob.type,
      size: file.blob.size,
      createdAt: timestamp,
      fileName,
      thumbnailFileName,
      originalName: file.originalName,
      // Note: Dimensions would be added here if available from the camera component
    });
  }

  // 2. Create record object
  const record: Record = {
    id: generateUUID(),
    timestamp,
    form: formData,
    media: mediaMetadata,
    synced: 0,
    sizeBytes: totalSize,
  };

  // 3. Save metadata and queue for upload
  await db.addRecord(record);
  await saveAndQueueRecord(record.id);
  
  return record;
}

/**
 * Helper to get a blob for a specific media item
 */
export async function getMediaBlob(fileName: string): Promise<Blob> {
  return getFileFromOPFS(fileName);
}

/**
 * Delete a record and all its associated files
 */
export async function removeRecord(recordId: string): Promise<void> {
  const record = await db.getRecord(recordId);
  if (!record) return;

  // Delete all associated files from OPFS
  for (const m of record.media) {
    if (m.fileName) {
      await deleteFileFromOPFS(m.fileName);
    }
    if (m.thumbnailFileName) {
      await deleteFileFromOPFS(m.thumbnailFileName);
    }
  }

  // Delete metadata
  await db.deleteRecordMetadata(recordId);
}

/**
 * Nuke everything (Factory Reset)
 */
export async function nukeAllData(): Promise<void> {
  await db.clearAllMetadata();
  await clearOPFS();
}