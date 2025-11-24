// Core data types for the monitoring application

export interface Media {
  mediaId: string;
  type: 'photo' | 'video';
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  deviceId?: string;
  width?: number;
  height?: number;
  thumbnailBlob?: Blob; // For video thumbnails
}

export interface FormData {
  [key: string]: string | number;
}

export interface Location {
  lat: number;
  lon: number;
  accuracy?: number;
}

export interface Record {
  id: string;
  timestamp: number;
  form: FormData;
  mediaIds: string[];
  location?: Location;
  synced: boolean;
  sizeBytes: number;
  uploadAttempts?: number;
  lastUploadAttempt?: number;
  error?: string;
}

export interface UploadQueueItem {
  recordId: string;
  timestamp: number;
  retryCount: number;
  nextRetryAt?: number;
}

export interface StorageStats {
  usage: number;
  quota: number;
  indexedDBSize: number;
  cacheSize: number;
  percentUsed: number;
}

export interface StorageSettings {
  maxStorageMB?: number;
  maxStoragePercent?: number;
  warnThresholdPercent: number;
  autoEvict: boolean;
}

export interface CameraConstraints {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  aspectRatio?: number;
}

export interface CameraCapabilities {
  zoom?: boolean;
  torch?: boolean;
  focusMode?: boolean;
  exposureMode?: boolean;
  whiteBalanceMode?: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Service Worker message types
export interface SWMessage {
  type: 'SKIP_WAITING' | 'CLIENTS_CLAIM' | 'CACHE_URLS' | 'CLEAR_CACHE';
  payload?: any;
}

// Upload response from server
export interface UploadResponse {
  success: boolean;
  recordId: string;
  message?: string;
  error?: string;
}