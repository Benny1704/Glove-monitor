import React, { useState, useEffect } from 'react';
import type { Record, Media } from '../types';
import { getAllRecords, getMedia, deleteRecord } from '../services/indexedDB';
import { formatBytes } from '../utils/compression';

interface RecordListProps {
  onRecordSelect: (record: Record) => void;
  onRefresh?: () => void;
}

export const RecordList: React.FC<RecordListProps> = ({
  onRecordSelect,
  onRefresh,
}) => {
  const [records, setRecords] = useState<Record[]>([]);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'synced' | 'unsynced'>('all');

  useEffect(() => {
    loadRecords();
  }, [filter]);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const allRecords = await getAllRecords();
      
      // Apply filter
      let filtered = allRecords;
      if (filter === 'synced') {
        filtered = allRecords.filter((r) => r.synced);
      } else if (filter === 'unsynced') {
        filtered = allRecords.filter((r) => !r.synced);
      }

      // Sort by timestamp descending (newest first)
      filtered.sort((a, b) => b.timestamp - a.timestamp);

      setRecords(filtered);

      // Load thumbnails for records with media
      const thumbMap = new Map<string, string>();
      for (const record of filtered) {
        if (record.mediaIds.length > 0) {
          const media = await getMedia(record.mediaIds[0]);
          if (media) {
            const thumbBlob = media.type === 'video' && media.thumbnailBlob
              ? media.thumbnailBlob
              : media.blob;
            const url = URL.createObjectURL(thumbBlob);
            thumbMap.set(record.id, url);
          }
        }
      }
      setThumbnails(thumbMap);

      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (recordId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!confirm('Delete this record? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteRecord(recordId);
      
      // Revoke thumbnail URL
      const url = thumbnails.get(recordId);
      if (url) {
        URL.revokeObjectURL(url);
      }

      await loadRecords();
    } catch (error) {
      console.error('Failed to delete record:', error);
      alert('Failed to delete record');
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  };

  if (isLoading) {
    return <div className="loading">Loading records...</div>;
  }

  return (
    <div className="record-list">
      <div className="list-header">
        <h2>Records ({records.length})</h2>
        <div className="filters">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'synced' ? 'active' : ''}
            onClick={() => setFilter('synced')}
          >
            Synced
          </button>
          <button
            className={filter === 'unsynced' ? 'active' : ''}
            onClick={() => setFilter('unsynced')}
          >
            Unsynced
          </button>
        </div>
        <button onClick={loadRecords} className="refresh-btn">
          🔄
        </button>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <p>No records found</p>
          <p className="hint">Capture photos or videos to get started</p>
        </div>
      ) : (
        <div className="grid">
          {records.map((record) => (
            <div
              key={record.id}
              className="record-card"
              onClick={() => onRecordSelect(record)}
            >
              {thumbnails.has(record.id) ? (
                <img
                  src={thumbnails.get(record.id)}
                  alt="Preview"
                  className="thumbnail"
                />
              ) : (
                <div className="thumbnail-placeholder">📄</div>
              )}

              <div className="record-info">
                <div className="record-header">
                  <span className="record-date">{formatDate(record.timestamp)}</span>
                  <div className="record-badges">
                    {!record.synced && (
                      <span className="badge unsynced" title="Not synced">
                        ☁️
                      </span>
                    )}
                    {record.mediaIds.length > 0 && (
                      <span className="badge media" title={`${record.mediaIds.length} media file(s)`}>
                        📷 {record.mediaIds.length}
                      </span>
                    )}
                  </div>
                </div>

                {Object.keys(record.form).length > 0 && (
                  <div className="record-form-preview">
                    {Object.entries(record.form)
                      .slice(0, 2)
                      .map(([key, value]) => (
                        <div key={key} className="form-field">
                          <span className="field-key">{key}:</span>
                          <span className="field-value">
                            {String(value).substring(0, 30)}
                            {String(value).length > 30 ? '...' : ''}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                <div className="record-footer">
                  <span className="record-size">{formatBytes(record.sizeBytes)}</span>
                  <button
                    className="delete-btn"
                    onClick={(e) => handleDelete(record.id, e)}
                    title="Delete record"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .record-list {
          padding: 20px;
        }

        .list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .list-header h2 {
          margin: 0;
        }

        .filters {
          display: flex;
          gap: 8px;
          background: #f5f5f5;
          padding: 4px;
          border-radius: 8px;
        }

        .filters button {
          padding: 8px 16px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        .filters button.active {
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .refresh-btn {
          padding: 8px 12px;
          border: none;
          background: #2196f3;
          color: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 18px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .record-card {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .record-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .thumbnail {
          width: 100%;
          height: 180px;
          object-fit: cover;
          background: #f5f5f5;
        }

        .thumbnail-placeholder {
          width: 100%;
          height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          font-size: 48px;
        }

        .record-info {
          padding: 12px;
        }

        .record-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .record-date {
          font-size: 13px;
          color: #666;
          font-weight: 500;
        }

        .record-badges {
          display: flex;
          gap: 4px;
        }

        .badge {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .badge.unsynced {
          background: #fff3e0;
          color: #f57c00;
        }

        .badge.media {
          background: #e3f2fd;
          color: #1976d2;
        }

        .record-form-preview {
          margin: 8px 0;
          font-size: 13px;
        }

        .form-field {
          margin-bottom: 4px;
        }

        .field-key {
          font-weight: 500;
          color: #666;
          margin-right: 4px;
        }

        .field-value {
          color: #333;
        }

        .record-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #eee;
        }

        .record-size {
          font-size: 12px;
          color: #999;
        }

        .delete-btn {
          padding: 4px 8px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 18px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .delete-btn:hover {
          opacity: 1;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #999;
        }

        .empty-state p {
          margin: 8px 0;
        }

        .empty-state .hint {
          font-size: 14px;
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