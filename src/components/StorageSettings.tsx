import React, { useState, useEffect } from 'react';
import {
  getStorageEstimate,
  getStorageSettings,
  updateStorageSettings,
  clearCaches,
  requestPersistentStorage,
  isStoragePersisted,
} from '../services/storageManager';
import { nukeAllData } from '../services/dataManager'; // Fixed import
import type { StorageStats, StorageSettings as Settings } from '../types';
import { formatBytes } from '../utils/compression';

export const StorageSettings: React.FC = () => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isPersisted, setIsPersisted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [storageStats, storageSettings, persisted] = await Promise.all([
        getStorageEstimate(),
        getStorageSettings(),
        isStoragePersisted(),
      ]);

      setStats(storageStats);
      setSettings(storageSettings);
      setIsPersisted(persisted);
    } catch (error) {
      console.error('Failed to load storage data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear all cached files? This frees up space but may slow down the app temporarily.')) return;
    try {
      await clearCaches();
      await loadData();
      alert('Cache cleared successfully');
    } catch (error) {
      alert('Failed to clear cache');
    }
  };

  const handleClearData = async () => {
    if (!confirm('WARNING: This will delete ALL records and files. This action cannot be undone.')) return;
    const confirmation = prompt('Type "DELETE" to confirm:');
    if (confirmation !== 'DELETE') return;

    try {
      setIsLoading(true);
      await nukeAllData();
      await loadData();
      alert('All data cleared successfully');
    } catch (error) {
      console.error(error);
      alert('Failed to clear data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestPersistence = async () => {
    const granted = await requestPersistentStorage();
    setIsPersisted(granted);
    alert(granted ? 'Persistent storage granted!' : 'Persistent storage was not granted by the browser.');
  };

  const handleSettingChange = async (key: keyof Settings, value: any) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await updateStorageSettings(updated);
  };

  if (isLoading || !stats || !settings) {
    return <div className="loading">Loading storage information...</div>;
  }

  const availableSpace = stats.quota - stats.usage;

  return (
    <div className="storage-settings">
      <h2>Storage Management</h2>

      <section className="storage-overview">
        <h3>Storage Overview</h3>
        <div className="storage-bar">
          <div
            className="storage-bar-fill"
            style={{
              width: `${Math.min(stats.percentUsed, 100)}%`,
              backgroundColor: stats.percentUsed > 90 ? '#f44336' : stats.percentUsed > 70 ? '#ff9800' : '#4caf50',
            }}
          />
        </div>

        <div className="storage-stats">
          <div className="stat"><label>Used:</label><span>{formatBytes(stats.usage)}</span></div>
          <div className="stat"><label>Total:</label><span>{formatBytes(stats.quota)}</span></div>
          <div className="stat"><label>Free:</label><span>{formatBytes(availableSpace)}</span></div>
          <div className="stat"><label>Usage:</label><span>{stats.percentUsed.toFixed(1)}%</span></div>
        </div>

        <div className="persistence-status">
          <label>Persistent Storage:</label>
          <span className={isPersisted ? 'granted' : 'not-granted'}>
            {isPersisted ? '✓ Granted' : '✗ Not Granted'}
          </span>
          {!isPersisted && (
            <button onClick={handleRequestPersistence} className="btn-secondary">Request Persistence</button>
          )}
        </div>
      </section>

      <section className="storage-limits">
        <h3>Configuration</h3>
        <div className="setting-group">
          <label>
            <input
              type="checkbox"
              checked={settings.autoEvict}
              onChange={(e) => handleSettingChange('autoEvict', e.target.checked)}
            />
            Auto-delete old records when full
          </label>
        </div>

        <div className="setting-group">
          <label>Max Storage (MB)</label>
          <input
            type="number"
            value={settings.maxStorageMB || ''}
            onChange={(e) => handleSettingChange('maxStorageMB', e.target.value ? parseInt(e.target.value) : undefined)}
            placeholder="Leave empty for percentage based"
          />
        </div>
      </section>

      <section className="storage-actions">
        <h3>Actions</h3>
        <div className="action-buttons">
          <button onClick={loadData} className="btn-secondary">🔄 Refresh</button>
          <button onClick={handleClearCache} className="btn-warning">🗑️ Clear Cache</button>
          <button onClick={handleClearData} className="btn-danger">⚠️ Factory Reset</button>
        </div>
      </section>

      <style>{`
        .storage-settings { max-width: 800px; margin: 0 auto; padding: 20px; }
        .storage-settings section { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .storage-bar { height: 24px; background: #e0e0e0; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
        .storage-bar-fill { height: 100%; transition: width 0.3s; }
        .storage-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .stat { background: #f5f5f5; padding: 10px; border-radius: 4px; }
        .stat span { display: block; font-weight: bold; }
        .setting-group { margin-bottom: 15px; }
        .setting-group input[type="number"] { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-top: 5px; }
        .action-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
        button { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
        .btn-secondary { background: #757575; color: white; }
        .btn-warning { background: #ff9800; color: white; }
        .btn-danger { background: #f44336; color: white; }
        .persistence-status { margin-top: 15px; display: flex; align-items: center; gap: 10px; }
        .granted { color: #4caf50; font-weight: bold; }
        .not-granted { color: #ff9800; font-weight: bold; }
      `}</style>
    </div>
  );
};