import {
  getUploadQueue,
  getRecord,
  getMedia,
  updateRecord,
  addToUploadQueue,
  deleteUploadQueueItem,
} from './indexedDB';
import { UploadQueueItem, UploadResponse } from '../types';

const UPLOAD_ENDPOINT = '/api/upload'; // Configure your endpoint
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 second

// Upload manager class
class UploadManager {
  private isProcessing = false;
  private retryTimeouts: Map<string, number> = new Map();

  // Queue a record for upload
  async queueUpload(recordId: string): Promise<void> {
    const queueItem: UploadQueueItem = {
      recordId,
      timestamp: Date.now(),
      retryCount: 0,
    };

    await addToUploadQueue(queueItem);

    // Try immediate upload
    this.processQueue();

    // Register background sync if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('upload-queue');
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    }
  }

  // Process upload queue
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const queue = await getUploadQueue();
      
      for (const item of queue) {
        // Check if we should retry this item yet
        if (item.nextRetryAt && item.nextRetryAt > Date.now()) {
          continue;
        }

        if (item.retryCount >= MAX_RETRIES) {
          console.error('Max retries reached for record:', item.recordId);
          continue;
        }

        try {
          await this.uploadRecord(item.recordId);
          await deleteUploadQueueItem(item.recordId);
        } catch (error) {
          console.error('Upload failed for record:', item.recordId, error);
          
          // Update retry info with exponential backoff
          const nextRetryDelay = BASE_RETRY_DELAY * Math.pow(2, item.retryCount);
          item.retryCount++;
          item.nextRetryAt = Date.now() + nextRetryDelay;
          
          await addToUploadQueue(item);

          // Schedule retry
          this.scheduleRetry(item.recordId, nextRetryDelay);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Upload a single record
  private async uploadRecord(recordId: string): Promise<void> {
    const record = await getRecord(recordId);
    if (!record) {
      throw new Error('Record not found');
    }

    // Prepare form data
    const formData = new FormData();
    formData.append('recordId', record.id);
    formData.append('timestamp', record.timestamp.toString());
    formData.append('form', JSON.stringify(record.form));
    
    if (record.location) {
      formData.append('location', JSON.stringify(record.location));
    }

    // Add media files
    for (let i = 0; i < record.mediaIds.length; i++) {
      const mediaId = record.mediaIds[i];
      const media = await getMedia(mediaId);
      
      if (media) {
        const filename = `${media.type}_${i}.${media.mimeType.split('/')[1]}`;
        formData.append('media', media.blob, filename);
        
        // Add thumbnail for videos
        if (media.type === 'video' && media.thumbnailBlob) {
          formData.append('thumbnails', media.thumbnailBlob, `thumb_${i}.jpg`);
        }
      }
    }

    // Send to server
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
      headers: {
        // Don't set Content-Type, browser will set it with boundary
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errorText}`);
    }

    const result: UploadResponse = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // Mark record as synced
    record.synced = true;
    record.uploadAttempts = (record.uploadAttempts || 0) + 1;
    record.lastUploadAttempt = Date.now();
    delete record.error;
    
    await updateRecord(record);
  }

  // Schedule a retry
  private scheduleRetry(recordId: string, delay: number): void {
    // Clear existing timeout
    const existingTimeout = this.retryTimeouts.get(recordId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new retry
    const timeoutId = window.setTimeout(() => {
      this.processQueue();
      this.retryTimeouts.delete(recordId);
    }, delay);

    this.retryTimeouts.set(recordId, timeoutId);
  }

  // Cancel all pending retries
  cancelAllRetries(): void {
    for (const timeoutId of this.retryTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.retryTimeouts.clear();
  }

  // Check if upload is in progress
  isUploading(): boolean {
    return this.isProcessing;
  }
}

// Singleton instance
export const uploadManager = new UploadManager();

// Helper function to handle record save and queue
export async function saveAndQueueRecord(
  recordId: string
): Promise<void> {
  await uploadManager.queueUpload(recordId);
}

// Process queue on online event
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Network online, processing upload queue');
    uploadManager.processQueue();
  });
}