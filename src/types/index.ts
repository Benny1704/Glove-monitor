export interface MediaMetadata {
  mediaId: string;
  type: 'photo' | 'video' | 'file';
  mimeType: string;
  size: number;
  createdAt: number;
  fileName: string; // Reference to OPFS file
  thumbnailFileName?: string; // Reference to OPFS file for video/image thumbs
  originalName?: string; // Original filename for uploads
  width?: number;
  height?: number;
}

export interface FormData {
  [key: string]: string | number | boolean | null;
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
  media: MediaMetadata[]; // Embedded metadata
  location?: Location;
  synced: number; // 0 = false, 1 = true
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
  percentUsed: number;
}

export interface StorageSettings {
  maxStorageMB?: number;
  maxStoragePercent?: number;
  warnThresholdPercent: number;
  autoEvict: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId: string;
}

export interface CameraCapabilities {
  zoom?: boolean;
  torch?: boolean;
  focusMode?: boolean;
  exposureMode?: boolean;
  whiteBalanceMode?: boolean;
}

export interface UploadResponse {
  success: boolean;
  recordId: string;
  message?: string;
  error?: string;
}