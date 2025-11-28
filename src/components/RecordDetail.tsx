import React, { useState, useEffect } from 'react';
import type { Record } from '../types';
import { getMediaBlob } from '../services/dataManager';
import { formatBytes } from '../utils/compression';

interface RecordDetailProps {
  record: Record;
  onClose: () => void;
}

export const RecordDetail: React.FC<RecordDetailProps> = ({ record, onClose }) => {
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMedia = async () => {
      setIsLoading(true);
      const urls: string[] = [];
      try {
        for (const media of record.media) {
          const blob = await getMediaBlob(media.fileName);
          urls.push(URL.createObjectURL(blob));
        }
        setMediaUrls(urls);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadMedia();
    return () => {
      mediaUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [record.id]);

  const currentMedia = record.media[selectedIndex];
  const currentUrl = mediaUrls[selectedIndex];

  const handleDownload = () => {
    if (!currentMedia || !currentUrl) return;
    const a = document.createElement('a');
    a.href = currentUrl;
    a.download = currentMedia.originalName || `file_${record.id}_${selectedIndex}.${currentMedia.mimeType.split('/')[1]}`;
    a.click();
  };

  return (
    <div className="record-detail-overlay" onClick={onClose}>
      <div className="record-detail" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <h2>Details</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="detail-content">
          <div className="metadata-grid">
            <div><strong>ID:</strong> {record.id.slice(0,8)}</div>
            <div><strong>Date:</strong> {new Date(record.timestamp).toLocaleString()}</div>
            <div><strong>Status:</strong> {record.synced ? 'Synced' : 'Unsynced'}</div>
          </div>

          <div className="form-data">
            {Object.entries(record.form).map(([k, v]) => (
              <div key={k} className="form-item">
                <label>{k}</label>
                <div>{String(v)}</div>
              </div>
            ))}
          </div>

          {isLoading ? <div className="loading">Loading files...</div> : record.media.length > 0 && (
            <div className="media-section">
              <div className="media-viewer">
                {currentMedia.type === 'photo' ? (
                  <img src={currentUrl} alt="View" />
                ) : currentMedia.type === 'video' ? (
                  <video src={currentUrl} controls />
                ) : (
                  <div className="file-preview">
                    <span>📄 {currentMedia.originalName || 'Attached File'}</span>
                  </div>
                )}
              </div>
              
              <div className="media-controls">
                <span>{formatBytes(currentMedia.size)}</span>
                <button onClick={handleDownload}>Download</button>
              </div>

              <div className="media-thumbnails">
                {record.media.map((m, i) => (
                  <button 
                    key={i} 
                    className={`thumb-btn ${i === selectedIndex ? 'active' : ''}`}
                    onClick={() => setSelectedIndex(i)}
                  >
                    {m.type === 'photo' ? '📷' : m.type === 'video' ? '🎥' : '📄'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .record-detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .record-detail { background: white; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; border-radius: 8px; padding: 20px; }
        .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .close-btn { background: none; border: none; font-size: 24px; cursor: pointer; }
        .metadata-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 14px; }
        .form-data { margin-bottom: 20px; background: #f9f9f9; padding: 10px; border-radius: 4px; }
        .form-item { margin-bottom: 8px; }
        .form-item label { font-weight: bold; font-size: 12px; color: #666; }
        .media-viewer { background: #000; min-height: 200px; display: flex; justify-content: center; align-items: center; border-radius: 4px; overflow: hidden; }
        .media-viewer img, .media-viewer video { max-width: 100%; max-height: 50vh; }
        .file-preview { color: white; font-size: 18px; padding: 40px; }
        .media-controls { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
        .media-thumbnails { display: flex; gap: 5px; margin-top: 10px; overflow-x: auto; padding-bottom: 5px; }
        .thumb-btn { padding: 10px; border: 1px solid #ddd; background: white; cursor: pointer; border-radius: 4px; }
        .thumb-btn.active { background: #e3f2fd; border-color: #2196f3; }
      `}</style>
    </div>
  );
};