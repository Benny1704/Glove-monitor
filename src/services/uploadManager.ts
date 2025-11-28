import { getUploadQueue, getRecord, addToUploadQueue, deleteUploadQueueItem, updateRecord } from './indexedDB';
import { getMediaBlob } from './dataManager';
import type { UploadQueueItem, UploadResponse } from '../types';

const UPLOAD_ENDPOINT = '/api/upload'; 
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; 

class UploadManager {
  private isProcessing = false;
  private retryTimeouts: Map<string, number> = new Map();

  async queueUpload(recordId: string): Promise<void> {
    const queueItem: UploadQueueItem = {
      recordId,
      timestamp: Date.now(),
      retryCount: 0,
    };

    await addToUploadQueue(queueItem);
    this.processQueue();

    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('upload-queue');
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    }
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const queue = await getUploadQueue();
      
      for (const item of queue) {
        if (item.nextRetryAt && item.nextRetryAt > Date.now()) continue;
        if (item.retryCount >= MAX_RETRIES) {
          console.error('Max retries reached for record:', item.recordId);
          continue;
        }

        try {
          await this.uploadRecord(item.recordId);
          await deleteUploadQueueItem(item.recordId);
        } catch (error) {
          console.error('Upload failed for record:', item.recordId, error);
          
          const nextRetryDelay = BASE_RETRY_DELAY * Math.pow(2, item.retryCount);
          item.retryCount++;
          item.nextRetryAt = Date.now() + nextRetryDelay;
          
          await addToUploadQueue(item);
          this.scheduleRetry(item.recordId, nextRetryDelay);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async uploadRecord(recordId: string): Promise<void> {
    const record = await getRecord(recordId);
    if (!record) throw new Error('Record not found');

    const formData = new FormData();
    formData.append('recordId', record.id);
    formData.append('timestamp', record.timestamp.toString());
    formData.append('form', JSON.stringify(record.form));
    
    if (record.location) {
      formData.append('location', JSON.stringify(record.location));
    }

    // Read files from OPFS and append to FormData
    for (let i = 0; i < record.media.length; i++) {
      const meta = record.media[i];
      try {
        const blob = await getMediaBlob(meta.fileName);
        // Use original name if available, otherwise generate one based on type and index
        const filename = meta.originalName || `${meta.type}_${i}.${meta.mimeType.split('/')[1]}`;
        formData.append('media', blob, filename);

        if (meta.thumbnailFileName) {
          const thumbBlob = await getMediaBlob(meta.thumbnailFileName);
          formData.append('thumbnails', thumbBlob, `thumb_${i}.jpg`);
        }
      } catch (err) {
        console.error(`Failed to load file ${meta.fileName} for upload`, err);
        throw new Error(`Media file missing: ${meta.fileName}`);
      }
    }

    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    const result: UploadResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // Update record status
    record.synced = 1;
    record.uploadAttempts = (record.uploadAttempts || 0) + 1;
    record.lastUploadAttempt = Date.now();
    delete record.error;
    
    await updateRecord(record);
  }

  private scheduleRetry(recordId: string, delay: number): void {
    const existingTimeout = this.retryTimeouts.get(recordId);
    if (existingTimeout) clearTimeout(existingTimeout);

    const timeoutId = window.setTimeout(() => {
      this.processQueue();
      this.retryTimeouts.delete(recordId);
    }, delay);

    this.retryTimeouts.set(recordId, timeoutId);
  }
}

export const uploadManager = new UploadManager();

export async function saveAndQueueRecord(recordId: string): Promise<void> {
  await uploadManager.queueUpload(recordId);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Network online, processing upload queue');
    uploadManager.processQueue();
  });
}