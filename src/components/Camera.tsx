import React, { useRef, useState, useEffect } from 'react';
import {
  getCameraDevices,
  getCameraStream,
  getCameraCapabilities,
  applyZoom,
  toggleTorch,
  capturePhotoFromStream,
  VideoRecorder,
  generateVideoThumbnail,
} from '../services/cameraService';
import { DeviceInfo, CameraCapabilities } from '../types';

interface CameraProps {
  onPhotoCapture: (blob: Blob, width: number, height: number) => void;
  onVideoCapture: (blob: Blob, thumbnailBlob: Blob, width: number, height: number) => void;
  onError: (error: Error) => void;
}

export const Camera: React.FC<CameraProps> = ({
  onPhotoCapture,
  onVideoCapture,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [capabilities, setCapabilities] = useState<CameraCapabilities>({});
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  
  const videoRecorderRef = useRef<VideoRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  // Initialize camera
  useEffect(() => {
    initializeCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initializeCamera = async () => {
    try {
      // Get available devices
      const availableDevices = await getCameraDevices();
      setDevices(availableDevices);

      // Try to get back camera first, fallback to any camera
      const backCamera = availableDevices.find((d) =>
        d.label.toLowerCase().includes('back')
      );
      const deviceId = backCamera?.deviceId || availableDevices[0]?.deviceId;

      if (deviceId) {
        await startCamera(deviceId);
      } else {
        // Try with facingMode if no deviceId
        await startCamera(undefined, 'environment');
      }
    } catch (error) {
      onError(error as Error);
    }
  };

  const startCamera = async (
    deviceId?: string,
    facingMode?: 'user' | 'environment'
  ) => {
    try {
      stopCamera();

      const newStream = await getCameraStream(deviceId, facingMode);
      setStream(newStream);
      setSelectedDeviceId(deviceId || '');

      // Get capabilities
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        const caps = getCameraCapabilities(videoTrack);
        setCapabilities(caps);
      }
    } catch (error) {
      onError(error as Error);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const switchCamera = async () => {
    const currentIndex = devices.findIndex(
      (d) => d.deviceId === selectedDeviceId
    );
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];

    if (nextDevice) {
      await startCamera(nextDevice.deviceId);
    }
  };

  const handleZoomChange = async (value: number) => {
    setZoom(value);
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      try {
        await applyZoom(videoTrack, value);
      } catch (error) {
        console.warn('Zoom not supported or failed:', error);
      }
    }
  };

  const handleTorchToggle = async () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      try {
        const newTorchState = !torchEnabled;
        await toggleTorch(videoTrack, newTorchState);
        setTorchEnabled(newTorchState);
      } catch (error) {
        console.warn('Torch not supported or failed:', error);
      }
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !stream) return;

    try {
      const blob = await capturePhotoFromStream(videoRef.current, 0.8);
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;
      onPhotoCapture(blob, width, height);
    } catch (error) {
      onError(error as Error);
    }
  };

  const startRecording = () => {
    if (!stream) return;

    try {
      videoRecorderRef.current = new VideoRecorder(stream);
      videoRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (error) {
      onError(error as Error);
    }
  };

  const pauseRecording = () => {
    if (videoRecorderRef.current) {
      videoRecorderRef.current.pause();
      setIsPaused(true);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (videoRecorderRef.current) {
      videoRecorderRef.current.resume();
      setIsPaused(false);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    }
  };

  const stopRecording = async () => {
    if (!videoRecorderRef.current || !videoRef.current) return;

    try {
      const videoBlob = await videoRecorderRef.current.stop();
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;

      // Generate thumbnail
      const thumbnailBlob = await generateVideoThumbnail(videoBlob);

      onVideoCapture(videoBlob, thumbnailBlob, width, height);

      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    } catch (error) {
      onError(error as Error);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  return (
    <div className="camera-container">
      <div className="camera-preview">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video"
        />

        {/* Recording indicator */}
        {isRecording && (
          <div className="recording-indicator">
            <span className="recording-dot" />
            <span>{formatTime(recordingTime)}</span>
          </div>
        )}

        {/* Top controls */}
        <div className="camera-top-controls">
          {/* Mode switcher */}
          <div className="mode-switcher">
            <button
              className={mode === 'photo' ? 'active' : ''}
              onClick={() => !isRecording && setMode('photo')}
              disabled={isRecording}
            >
              Photo
            </button>
            <button
              className={mode === 'video' ? 'active' : ''}
              onClick={() => !isRecording && setMode('video')}
              disabled={isRecording}
            >
              Video
            </button>
          </div>

          {/* Torch button */}
          {capabilities.torch && (
            <button
              className={`icon-button ${torchEnabled ? 'active' : ''}`}
              onClick={handleTorchToggle}
              title="Toggle Flash"
            >
              ⚡
            </button>
          )}

          {/* Switch camera */}
          {devices.length > 1 && (
            <button
              className="icon-button"
              onClick={switchCamera}
              disabled={isRecording}
              title="Switch Camera"
            >
              🔄
            </button>
          )}
        </div>

        {/* Bottom controls */}
        <div className="camera-bottom-controls">
          {/* Zoom slider */}
          {capabilities.zoom && (
            <div className="zoom-control">
              <label>Zoom: {zoom.toFixed(1)}x</label>
              <input
                type="range"
                min="1"
                max="10"
                step="0.1"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                disabled={isRecording}
              />
            </div>
          )}

          {/* Capture buttons */}
          <div className="capture-controls">
            {mode === 'photo' && !isRecording && (
              <button className="capture-button photo" onClick={capturePhoto}>
                📷
              </button>
            )}

            {mode === 'video' && !isRecording && (
              <button className="capture-button video" onClick={startRecording}>
                ⏺
              </button>
            )}

            {mode === 'video' && isRecording && !isPaused && (
              <>
                <button className="control-button" onClick={pauseRecording}>
                  ⏸
                </button>
                <button className="control-button stop" onClick={stopRecording}>
                  ⏹
                </button>
              </>
            )}

            {mode === 'video' && isRecording && isPaused && (
              <>
                <button className="control-button" onClick={resumeRecording}>
                  ▶️
                </button>
                <button className="control-button stop" onClick={stopRecording}>
                  ⏹
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .camera-container {
          position: relative;
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
        }

        .camera-preview {
          position: relative;
          width: 100%;
          aspect-ratio: 4/3;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .camera-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .recording-indicator {
          position: absolute;
          top: 16px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255, 0, 0, 0.8);
          color: white;
          border-radius: 20px;
          font-weight: bold;
        }

        .recording-dot {
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .camera-top-controls {
          position: absolute;
          top: 16px;
          right: 16px;
          display: flex;
          gap: 8px;
          flex-direction: column;
          align-items: flex-end;
        }

        .mode-switcher {
          display: flex;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 20px;
          padding: 4px;
        }

        .mode-switcher button {
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: white;
          border-radius: 16px;
          cursor: pointer;
          font-size: 14px;
        }

        .mode-switcher button.active {
          background: rgba(255, 255, 255, 0.3);
        }

        .icon-button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .icon-button.active {
          background: rgba(255, 255, 0, 0.6);
        }

        .camera-bottom-controls {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .zoom-control {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: rgba(0, 0, 0, 0.6);
          padding: 8px 16px;
          border-radius: 20px;
          color: white;
        }

        .zoom-control input {
          width: 200px;
        }

        .capture-controls {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .capture-button {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 4px solid white;
          background: rgba(255, 255, 255, 0.3);
          color: white;
          font-size: 40px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s;
        }

        .capture-button:active {
          transform: scale(0.95);
        }

        .capture-button.video {
          background: rgba(255, 0, 0, 0.6);
        }

        .control-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: 3px solid white;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          font-size: 30px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-button.stop {
          background: rgba(255, 0, 0, 0.6);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};