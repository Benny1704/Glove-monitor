import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera as CameraIcon, FileText, X, ArrowLeft } from 'lucide-react';
import { Camera } from './Camera';
import { FileUploader } from './FileUploader';
import { createRecord } from '../services/dataManager';
import { ensureStorageSpace } from '../services/storageManager';
import { showLocalNotification, notificationTemplates } from '../services/notificationService';
import type { FormData as RecordFormData } from '../types';
import { estimateMetadataSize } from '../utils/compression';

export const CaptureView: React.FC = () => {
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(false);
  const [formData, setFormData] = useState<RecordFormData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormChange = (key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const processFiles = async (files: Array<{ blob: Blob; type: 'photo' | 'video' | 'file'; thumbnail?: Blob; originalName?: string }>) => {
    try {
      setIsSubmitting(true);
      
      let totalSize = estimateMetadataSize(formData);
      files.forEach(f => totalSize += f.blob.size + (f.thumbnail?.size || 0));

      await ensureStorageSpace(totalSize);

      const record = await createRecord(formData, files);

      await showLocalNotification(
        'Record Saved',
        notificationTemplates.recordSaved(record.id)
      );

      setFormData({});
      setShowCamera(false);
      navigate('/');
    } catch (error) {
      console.error('Failed to save record:', error);
      alert('Failed to save record: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhotoCapture = async (blob: Blob) => {
    await processFiles([{ blob, type: 'photo' }]);
  };

  const handleVideoCapture = async (blob: Blob, thumbnailBlob: Blob) => {
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
    <motion.div 
      className="capture-view page-content"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {isSubmitting && (
        <div className="loading-overlay">
          <motion.div 
            className="spinner"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {!showCamera ? (
          <motion.div 
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className="form-container"
          >
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                className="form-control"
                value={String(formData.title || '')}
                onChange={(e) => handleFormChange('title', e.target.value)}
                placeholder="e.g., Equipment Check"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                value={String(formData.description || '')}
                onChange={(e) => handleFormChange('description', e.target.value)}
                placeholder="Add details about this record..."
                rows={4}
                style={{ resize: 'none' }}
              />
            </div>

            <div className="form-group">
              <label>Value</label>
              <input
                type="number"
                className="form-control"
                value={String(formData.value || '')}
                onChange={(e) => handleFormChange('value', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '32px' }}>
              <motion.button
                className="btn btn-primary"
                onClick={() => setShowCamera(true)}
                disabled={isSubmitting}
                whileTap={{ scale: 0.98 }}
              >
                <CameraIcon size={20} />
                Open Camera
              </motion.button>
              
              <div className="file-upload-wrapper">
                <FileUploader onFileSelect={handleFileUpload} disabled={isSubmitting} />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="camera"
            className="camera-wrapper"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <button 
              className="camera-close-btn"
              onClick={() => setShowCamera(false)}
            >
              <X size={24} color="white" />
            </button>
            <Camera
              onPhotoCapture={handlePhotoCapture}
              onVideoCapture={handleVideoCapture}
              onError={(e) => alert(e.message)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .camera-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: black;
          z-index: 100;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .camera-close-btn {
          position: absolute;
          top: max(20px, env(safe-area-inset-top));
          left: 20px;
          z-index: 110;
          background: rgba(0,0,0,0.5);
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        /* Hide standard file uploader styling to integrate cleanly */
        .file-upload-wrapper .file-uploader { margin-top: 0; }
        .file-upload-wrapper .upload-btn {
          background: white;
          color: var(--text-primary);
          border: 1px solid var(--border);
        }
        .loading-overlay {
          position: fixed;
          inset: 0;
          background: rgba(255,255,255,0.8);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--primary);
          border-radius: 50%;
        }
      `}</style>
    </motion.div>
  );
};