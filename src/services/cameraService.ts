import type { CameraCapabilities, DeviceInfo } from './../types/index';

// Check if camera is supported
export function isCameraSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

// Get available camera devices
export async function getCameraDevices(): Promise<DeviceInfo[]> {
  if (!isCameraSupported()) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.slice(0, 5)}`,
        kind: device.kind,
        groupId: device.groupId,
      }));
  } catch (error) {
    console.error('Error enumerating devices:', error);
    return [];
  }
}

// Get camera stream with constraints
export async function getCameraStream(
  deviceId?: string,
  facingMode?: 'user' | 'environment'
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      ...(facingMode && !deviceId ? { facingMode: { ideal: facingMode } } : {}),
    },
    audio: false,
  };

  return navigator.mediaDevices.getUserMedia(constraints);
}

// Get camera capabilities from track
export function getCameraCapabilities(
  track: MediaStreamTrack
): CameraCapabilities {
  const capabilities = track.getCapabilities?.() || {};

  return {
    zoom: 'zoom' in capabilities,
    torch: 'torch' in capabilities,
    focusMode: 'focusMode' in capabilities,
    exposureMode: 'exposureMode' in capabilities,
    whiteBalanceMode: 'whiteBalanceMode' in capabilities,
  };
}

// Apply zoom to camera track
export async function applyZoom(
  track: MediaStreamTrack,
  zoomLevel: number
): Promise<void> {
  const capabilities = track.getCapabilities?.() as any;
  
  if (capabilities && 'zoom' in capabilities) {
    const { min = 1, max = 1 } = capabilities.zoom;
    const clampedZoom = Math.max(min, Math.min(max, zoomLevel));
    
    await track.applyConstraints({
      // @ts-ignore - zoom is not in standard types yet
      advanced: [{ zoom: clampedZoom }],
    });
  }
}

// Toggle torch (flash)
export async function toggleTorch(
  track: MediaStreamTrack,
  enabled: boolean
): Promise<void> {
  const capabilities = track.getCapabilities?.() as any;
  
  if (capabilities && 'torch' in capabilities) {
    await track.applyConstraints({
      // @ts-ignore - torch is not in standard types yet
      advanced: [{ torch: enabled }],
    });
  }
}

// Capture photo from video stream
export async function capturePhotoFromStream(
  videoElement: HTMLVideoElement,
  quality: number = 0.8
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(videoElement, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to capture photo'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

// Start video recording
export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start(): void {
    if (!this.stream) {
      throw new Error('No stream available');
    }

    // Try different MIME types for compatibility
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];

    let selectedMimeType = '';
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }

    if (!selectedMimeType) {
      throw new Error('No supported video MIME type found');
    }

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: selectedMimeType,
    });

    this.chunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recorder available'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: this.mediaRecorder?.mimeType || 'video/webm',
        });
        resolve(blob);
      };

      this.mediaRecorder.onerror = (error) => {
        reject(error);
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  getState(): string {
    return this.mediaRecorder?.state || 'inactive';
  }
}

// Generate video thumbnail from blob
export async function generateVideoThumbnail(
  videoBlob: Blob
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);

    video.onloadeddata = () => {
      video.currentTime = 0.1; // Seek to 0.1 seconds
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(video, 0, 0);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate thumbnail'));
          }
        },
        'image/jpeg',
        0.7
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };

    video.src = url;
    video.load();
  });
}