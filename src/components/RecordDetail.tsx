import React, { useState, useEffect } from 'react';
import { Record, Media } from '../types';
import { getMedia } from '../services/indexedDB';
import { formatBytes } from '../utils/compression';

interface RecordDetailProps {
  record: Record;
  onClose: () => void;
}

export const RecordDetail: React.FC<RecordDetailProps> = ({
  record,
  onClose,
}) => {
  const [mediaFiles, setMediaFiles] = useState<Media[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMedia();
    
    return () => {
      // Cleanup URLs
      mediaUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [record.id]);

  const loadMedia = async () => {
    setIsLoading(true);
    try {
      const files: Media[] = [];
      const urls: string[] = [];

      for (const mediaId of record.mediaIds) {
        const media = await getMedia(mediaId);
        if (media) {
          files.push(media);
          const url = URL.createObjectURL(media.blob);
          urls.push(url);
        }
      }

      setMediaFiles(files);
      setMediaUrls(urls);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const handleDownload = (index: number) => {
    const media = mediaFiles[index];
    const url = mediaUrls[index];

    if (media && url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${media.type}_${record.id}_${index}.${
        media.mimeType.split('/')[1]
      }`;
      a.click();
    }
  };

  return (
    <div className="record-detail-overlay" onClick={onClose}>
      <div className="record-detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <h2>Record Details</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="detail-content">
          {/* Metadata */}
          <section className="metadata-section">
            <h3>Metadata</h3>
            <div className="metadata-grid">
              <div className="metadata-item">
                <label>Record ID:</label>
                <span>{record.id}</span>
              </div>
              <div className="metadata-item">
                <label>Timestamp:</label>
                <span>{formatDate(record.timestamp)}</span>
              </div>
              <div className="metadata-item">
                <label>Status:</label>
                <span className={record.synced ? 'synced' : 'unsynced'}>
                  {record.synced ? '✓ Synced' : '⏳ Not Synced'}
                </span>
              </div>
              <div className="metadata-item">
                <label>Size:</label>
                <span>{formatBytes(record.sizeBytes)}</span>
              </div>
              <div className="metadata-item">
                <label>Media Files:</label>
                <span>{record.mediaIds.length}</span>
              </div>
              {record.location && (
                <div className="metadata-item">
                  <label>Location:</label>
                  <span>
                    {record.location.lat.toFixed(6)}, {record.location.lon.toFixed(6)}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Form Data */}
          {Object.keys(record.form).length > 0 && (
            <section className="form-section">
              <h3>Form Data</h3>
              <div className="form-data">
                {Object.entries(record.form).map(([key, value]) => (
                  <div key={key} className="form-item">
                    <label>{key}:</label>
                    <span>{String(value)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Media Gallery */}
          {isLoading ? (
            <div className="loading">Loading media...</div>
          ) : mediaFiles.length > 0 ? (
            <section className="media-section">
              <h3>Media ({mediaFiles.length})</h3>

              {/* Main media viewer */}
              <div className="media-viewer">
                {mediaFiles[selectedMediaIndex]?.type === 'photo' ? (
                  <img
                    src={mediaUrls[selectedMediaIndex]}
                    alt="Photo"
                    className="media-main"
                  />
                ) : (
                  <video
                    src={mediaUrls[selectedMediaIndex]}
                    controls
                    className="media-main"
                  />
                )}

                <div className="media-info">
                  <span>
                    {mediaFiles[selectedMediaIndex]?.type} -{' '}
                    {formatBytes(mediaFiles[selectedMediaIndex]?.size || 0)}
                  </span>
                  <button
                    onClick={() => handleDownload(selectedMediaIndex)}
                    className="download-btn"
                  >
                    ⬇ Download
                  </button>
                </div>
              </div>

              {/* Thumbnails */}
              {mediaFiles.length > 1 && (
                <div className="media-thumbnails">
                  {mediaFiles.map((media, index) => (
                    <div
                      key={index}
                      className={`thumbnail ${
                        index === selectedMediaIndex ? 'active' : ''
                      }`}
                      onClick={() => setSelectedMediaIndex(index)}
                    >
                      {media.type === 'photo' ? (
                        <img src={mediaUrls[index]} alt={`Media ${index + 1}`} />
                      ) : (
                        <div className="video-thumb">
                          {media.thumbnailBlob ? (
                            <img
                              src={URL.createObjectURL(media.thumbnailBlob)}
                              alt={`Video ${index + 1}`}
                            />
                          ) : (
                            <span>🎥</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>

      <style>{`
        .record-detail-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .record-detail {
          background: white;
          border-radius: 12px;
          max-width: 900px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #eee;
          position: sticky;
          top: 0;
          background: white;
          z-index: 1;
        }

        .detail-header h2 {
          margin: 0;
        }

        .close-btn {
          width: 36px;
          height: 36px;
          border: none;
          background: #f5f5f5;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: #e0e0e0;
        }

        .detail-content {
          padding: 20px;
        }

        section {
          margin-bottom: 24px;
        }

        section h3 {
          margin-top: 0;
          margin-bottom: 12px;
          color: #333;
        }

        .metadata-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .metadata-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px;
          background: #f5f5f5;
          border-radius: 6px;
        }

        .metadata-item label {
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }

        .metadata-item span {
          font-size: 14px;
          color: #333;
          word-break: break-all;
        }

        .metadata-item .synced {
          color: #4caf50;
          font-weight: 600;
        }

        .metadata-item .unsynced {
          color: #ff9800;
          font-weight: 600;
        }

        .form-data {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-item {
          display: flex;
          gap: 8px;
          padding: 8px 12px;
          background: #f5f5f5;
          border-radius: 6px;
        }

        .form-item label {
          font-weight: 500;
          color: #666;
          min-width: 120px;
        }

        .form-item span {
          color: #333;
          flex: 1;
        }

        .media-viewer {
          background: #000;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .media-main {
          width: 100%;
          max-height: 500px;
          object-fit: contain;
          display: block;
        }

        .media-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f5f5f5;
          color: #333;
          font-size: 14px;
        }

        .download-btn {
          padding: 8px 16px;
          border: none;
          background: #2196f3;
          color: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .media-thumbnails {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 8px 0;
        }

        .thumbnail {
          width: 80px;
          height: 80px;
          border-radius: 6px;
          overflow: hidden;
          cursor: pointer;
          border: 3px solid transparent;
          flex-shrink: 0;
          transition: border-color 0.2s;
        }

        .thumbnail:hover {
          border-color: #2196f3;
        }

        .thumbnail.active {
          border-color: #2196f3;
        }

        .thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .video-thumb {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #333;
          font-size: 32px;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }
      `}</style>
    </div>
  );
};