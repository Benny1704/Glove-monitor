import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Camera } from './components/Camera';
import { RecordList } from './components/RecordList';
import { RecordDetail } from './components/RecordDetail';
import { StorageSettings } from './components/StorageSettings';
import { OfflineIndicator } from './components/OfflineIndicator';
import { FileUploader } from './components/FileUploader'; // New import
import { AppProvider } from './context/AppContext';
import { initDB } from './services/indexedDB';
import { ensureStorageSpace, isStorageWarning } from './services/storageManager';
import { createRecord } from './services/dataManager'; // New import
import { showLocalNotification, notificationTemplates } from './services/notificationService';
import type { Record, FormData as RecordFormData } from './types';
import { estimateMetadataSize } from './utils/compression';
import './index.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(false);
  const [formData, setFormData] = useState<RecordFormData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormChange = (key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Unified handler for all file types
  const processFiles = async (files: Array<{ blob: Blob; type: 'photo' | 'video' | 'file'; thumbnail?: Blob; originalName?: string }>) => {
    try {
      setIsSubmitting(true);
      
      // Calculate total size required
      let totalSize = estimateMetadataSize(formData);
      files.forEach(f => totalSize += f.blob.size + (f.thumbnail?.size || 0));

      // Ensure we have space in OPFS
      await ensureStorageSpace(totalSize);

      // Save everything using the new Data Manager
      const record = await createRecord(formData, files);

      await showLocalNotification(
        'Record Saved',
        notificationTemplates.recordSaved(record.id)
      );

      setFormData({});
      setShowCamera(false);
      navigate('/records');
    } catch (error) {
      console.error('Failed to save record:', error);
      alert('Failed to save record: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoCapture = async (blob: Blob, _width: number, _height: number) => {
    await processFiles([{ blob, type: 'photo' }]);
  };

  const handleVideoCapture = async (blob: Blob, thumbnailBlob: Blob, _width: number, _height: number) => {
    await processFiles([{ blob, type: 'video', thumbnail: thumbnailBlob }]);
  };

  const handleFileUpload = async (fileList: FileList) => {
    const files = Array.from(fileList).map(file => ({
      blob: file,
      type: 'file' as const,
      originalName: file.name
    }));
    await processFiles(files);
  };

  return (
    <div className="home-page">
      <div className="form-section">
        <h2>Monitoring Record</h2>
        
        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={String(formData.title || '')}
            onChange={(e) => handleFormChange('title', e.target.value)}
            placeholder="Enter record title"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={String(formData.description || '')}
            onChange={(e) => handleFormChange('description', e.target.value)}
            placeholder="Enter description"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Value (Number)</label>
          <input
            type="number"
            value={String(formData.value || '')}
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

        <FileUploader onFileSelect={handleFileUpload} disabled={isSubmitting} />
      </div>

      {showCamera && (
        <div className="camera-section">
          <Camera
            onPhotoCapture={handlePhotoCapture}
            onVideoCapture={handleVideoCapture}
            onError={(e) => alert(e.message)}
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

const RecordsPage: React.FC = () => {
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

  return (
    <div className="records-page">
      <RecordList onRecordSelect={setSelectedRecord} />
      {selectedRecord && (
        <RecordDetail
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
};

const SettingsPage: React.FC = () => (
  <div className="settings-page">
    <StorageSettings />
  </div>
);

function App() {
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    initDB().catch(console.error);
    const checkStorage = async () => {
      const warning = await isStorageWarning();
      setStorageWarning(warning);
    };
    checkStorage();
    const interval = setInterval(checkStorage, 60000); 
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
            <Link to="/" className="nav-link">📷 Capture</Link>
            <Link to="/records" className="nav-link">📁 Records</Link>
            <Link to="/settings" className="nav-link">⚙️ Settings</Link>
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