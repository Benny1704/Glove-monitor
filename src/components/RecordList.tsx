import React, { useState, useEffect } from 'react';
import type { Record } from '../types';
import { getAllRecords } from '../services/indexedDB';
import { getMediaBlob, removeRecord } from '../services/dataManager';
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
    return () => {
      // Cleanup object URLs
      thumbnails.forEach(url => URL.revokeObjectURL(url));
    };
  }, [filter]);

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const allRecords = await getAllRecords();
      let filtered = allRecords.sort((a, b) => b.timestamp - a.timestamp);

      if (filter === 'synced') filtered = filtered.filter((r) => r.synced);
      else if (filter === 'unsynced') filtered = filtered.filter((r) => !r.synced);

      setRecords(filtered);

      // Load thumbnails
      const thumbMap = new Map<string, string>();
      for (const record of filtered) {
        if (record.media.length > 0) {
          const media = record.media[0];
          // If it's a photo, use the file itself. If video, use thumbnail. If generic file, skip.
          const fileName = media.type === 'photo' ? media.fileName : media.thumbnailFileName;
          
          if (fileName) {
            try {
              const blob = await getMediaBlob(fileName);
              const url = URL.createObjectURL(blob);
              thumbMap.set(record.id, url);
            } catch (e) {
              console.warn('Error loading thumbnail for', record.id);
            }
          }
        }
      }
      setThumbnails(thumbMap);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (recordId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('Delete this record? This action cannot be undone.')) return;

    try {
      await removeRecord(recordId);
      await loadRecords();
    } catch (error) {
      console.error('Failed to delete record:', error);
      alert('Failed to delete record');
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) return <div className="loading">Loading records...</div>;

  return (
    <div className="record-list">
      <div className="list-header">
        <h2>Records ({records.length})</h2>
        <div className="filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'synced' ? 'active' : ''} onClick={() => setFilter('synced')}>Synced</button>
          <button className={filter === 'unsynced' ? 'active' : ''} onClick={() => setFilter('unsynced')}>Unsynced</button>
        </div>
        <button onClick={loadRecords} className="refresh-btn">🔄</button>
      </div>

      {records.length === 0 ? (
        <div className="empty-state">
          <p>No records found</p>
        </div>
      ) : (
        <div className="grid">
          {records.map((record) => (
            <div key={record.id} className="record-card" onClick={() => onRecordSelect(record)}>
              {thumbnails.has(record.id) ? (
                <img src={thumbnails.get(record.id)} alt="Preview" className="thumbnail" />
              ) : (
                <div className="thumbnail-placeholder">
                  {record.media.length > 0 ? (record.media[0].type === 'file' ? '📄' : '🎬') : '📝'}
                </div>
              )}

              <div className="record-info">
                <div className="record-header">
                  <span className="record-date">{formatDate(record.timestamp)}</span>
                  <div className="record-badges">
                    {!record.synced && <span className="badge unsynced">☁️</span>}
                    <span className="badge media">📎 {record.media.length}</span>
                  </div>
                </div>
                {Object.keys(record.form).length > 0 && (
                  <div className="record-form-preview">
                    {Object.entries(record.form).slice(0, 1).map(([key, value]) => (
                      <div key={key} className="form-field">
                        <span className="field-key">{key}:</span>
                        <span className="field-value">{String(value).substring(0, 20)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="record-footer">
                  <span className="record-size">{formatBytes(record.sizeBytes)}</span>
                  <button className="delete-btn" onClick={(e) => handleDelete(record.id, e)}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Styles reused from existing file, add any new if needed */}
      <style>{`
        .record-list { padding: 20px; }
        .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
        .filters { display: flex; gap: 5px; background: #eee; padding: 5px; border-radius: 8px; }
        .filters button { border: none; background: transparent; padding: 5px 10px; cursor: pointer; border-radius: 4px; }
        .filters button.active { background: white; shadow: 0 1px 2px rgba(0,0,0,0.1); }
        .refresh-btn { background: none; border: none; font-size: 20px; cursor: pointer; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; }
        .record-card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; }
        .thumbnail { width: 100%; height: 150px; object-fit: cover; }
        .thumbnail-placeholder { width: 100%; height: 150px; background: #eee; display: flex; justify-content: center; align-items: center; font-size: 40px; }
        .record-info { padding: 10px; }
        .record-header { display: flex; justify-content: space-between; font-size: 12px; color: #666; margin-bottom: 5px; }
        .badge { padding: 2px 5px; border-radius: 4px; font-size: 10px; margin-left: 5px; }
        .badge.unsynced { background: #fff3e0; color: #f57c00; }
        .badge.media { background: #e3f2fd; color: #1976d2; }
        .record-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; font-size: 12px; color: #999; }
        .delete-btn { border: none; background: none; cursor: pointer; font-size: 16px; }
        .empty-state { text-align: center; padding: 40px; color: #999; }
        .loading { text-align: center; padding: 40px; }
      `}</style>
    </div>
  );
};