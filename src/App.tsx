import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Camera } from './components/Camera';
import { RecordList } from './components/RecordList';
import { RecordDetail } from './components/RecordDetail';
import { StorageSettings } from './components/StorageSettings';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AppProvider } from './context/AppContext';
import { initDB, addRecord, addMedia } from './services/indexedDB';
import { ensureStorageSpace, isStorageWarning } from './services/storageManager';
import { saveAndQueueRecord } from './services/uploadManager';
import { showLocalNotification, notificationTemplates } from './services/notificationService';
import { Record, Media, FormData as RecordFormData } from './types';
import { generateUUID } from './utils/uuid';
import { estimateMetadataSize } from './utils/compression';
import './index.css';

// Home page with camera
const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(false);
  const [formData, setFormData] = useState<RecordFormData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormChange = (key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handlePhotoCapture = async (blob: Blob, width: number, height: number) => {
    try {
      setIsSubmitting(true);

      // Calculate size
      const mediaSize = blob.size;
      const metadataSize = estimateMetadataSize(formData);
      const totalSize = mediaSize + metadataSize;

      // Check storage
      await ensureStorageSpace(totalSize);

      // Create media record
      const mediaId = generateUUID();
      const media: Media = {
        mediaId,
        type: 'photo',
        blob,
        mimeType: blob.type,
        size: blob.size,
        createdAt: Date.now(),
        width,
        height,
      };

      await addMedia(media);

      // Create record
      const record: Record = {
        id: generateUUID(),
        timestamp: Date.now(),
        form: { ...formData },
        mediaIds: [mediaId],
        synced: false,
        sizeBytes: totalSize,
      };

      await addRecord(record);

      // Queue for upload
      await saveAndQueueRecord(record.id);

      // Show notification
      await showLocalNotification(
        'Photo Captured',
        notificationTemplates.recordSaved(record.id)
      );

      // Reset form and close camera
      setFormData({});
      setShowCamera(false);

      // Navigate to records
      navigate('/records');
    } catch (error) {
      console.error('Failed to save photo:', error);
      alert('Failed to save photo: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVideoCapture = async (
    blob: Blob,
    thumbnailBlob: Blob,
    width: number,
    height: number
  ) => {
    try {
      setIsSubmitting(true);

      // Calculate size
      const mediaSize = blob.size + thumbnailBlob.size;
      const metadataSize = estimateMetadataSize(formData);
      const totalSize = mediaSize + metadataSize;

      // Check storage
      await ensureStorageSpace(totalSize);

      // Create media record
      const mediaId = generateUUID();
      const media: Media = {
        mediaId,
        type: 'video',
        blob,
        mimeType: blob.type,
        size: blob.size,
        createdAt: Date.now(),
        width,
        height,
        thumbnailBlob,
      };

      await addMedia(media);

      // Create record
      const record: Record = {
        id: generateUUID(),
        timestamp: Date.now(),
        form: { ...formData },
        mediaIds: [mediaId],
        synced: false,
        sizeBytes: totalSize,
      };

      await addRecord(record);

      // Queue for upload
      await saveAndQueueRecord(record.id);

      // Show notification
      await showLocalNotification(
        'Video Recorded',
        notificationTemplates.recordSaved(record.id)
      );

      // Reset form and close camera
      setFormData({});
      setShowCamera(false);

      // Navigate to records
      navigate('/records');
    } catch (error) {
      console.error('Failed to save video:', error);
      alert('Failed to save video: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCameraError = (error: Error) => {
    console.error('Camera error:', error);
    alert('Camera error: ' + error.message);
  };

  return (
    <div className="home-page">
      <div className="form-section">
        <h2>Monitoring Record</h2>
        
        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => handleFormChange('title', e.target.value)}
            placeholder="Enter record title"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => handleFormChange('description', e.target.value)}
            placeholder="Enter description"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Value (Number)</label>
          <input
            type="number"
            value={formData.value || ''}
            onChange={(e) => handleFormChange('value', parseFloat(e.target.value) || 0)}
            placeholder="Enter numeric value"
          />
        </div>

        <button
          className="capture-btn"
          onClick={() => setShowCamera(!showCamera)}
          disabled={isSubmitting}
        >
          {showCamera ? '📷 Hide Camera' : '📷 Open Camera'}
        </button>
      </div>

      {showCamera && (
        <div className="camera-section">
          <Camera
            onPhotoCapture={handlePhotoCapture}
            onVideoCapture={handleVideoCapture}
            onError={handleCameraError}
          />
        </div>
      )}

      {isSubmitting && (
        <div className="loading-overlay">
          <div className="spinner">Saving...</div>
        </div>
      )}
    </div>
  );
};

// Records page
const RecordsPage: React.FC = () => {
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

  return (
    <div className="records-page">
      <RecordList
        onRecordSelect={setSelectedRecord}
      />
      {selectedRecord && (
        <RecordDetail
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
};

// Settings page
const SettingsPage: React.FC = () => {
  return (
    <div className="settings-page">
      <StorageSettings />
    </div>
  );
};

// Main App component
function App() {
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    // Initialize database
    initDB().catch(console.error);

    // Check storage periodically
    const checkStorage = async () => {
      const warning = await isStorageWarning();
      setStorageWarning(warning);
    };

    checkStorage();
    const interval = setInterval(checkStorage, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app">
          <OfflineIndicator />

          {storageWarning && (
            <div className="storage-warning">
              ⚠️ Storage is running low. Consider clearing old data.
              <Link to="/settings">Go to Settings</Link>
            </div>
          )}

          <nav className="main-nav">
            <Link to="/" className="nav-link">
              📷 Capture
            </Link>
            <Link to="/records" className="nav-link">
              📁 Records
            </Link>
            <Link to="/settings" className="nav-link">
              ⚙️ Settings
            </Link>
          </nav>

          <main className="main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;