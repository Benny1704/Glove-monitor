import React, { useState, useEffect } from 'react';
import {
  getStorageEstimate,
  getStorageSettings,
  updateStorageSettings,
  clearCaches,
  requestPersistentStorage,
  isStoragePersisted,
} from '../services/storageManager';
import { clearAllData } from '../services/indexedDB';
import { StorageStats, StorageSettings as Settings } from '../types';
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
    if (!confirm('Clear all cached files? This will free up space but may slow down the app temporarily.')) {
      return;
    }

    try {
      await clearCaches();
      await loadData();
      alert('Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('Failed to clear cache');
    }
  };

  const handleClearData = async () => {
    if (!confirm('Clear all application data? This will delete all records and media. This action cannot be undone.')) {
      return;
    }

    const confirmation = prompt('Type "DELETE" to confirm:');
    if (confirmation !== 'DELETE') {
      return;
    }

    try {
      await clearAllData();
      await loadData();
      alert('All data cleared successfully');
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data');
    }
  };

  const handleRequestPersistence = async () => {
    try {
      const granted = await requestPersistentStorage();
      setIsPersisted(granted);
      
      if (granted) {
        alert('Persistent storage granted! Your data is now protected from automatic cleanup.');
      } else {
        alert('Persistent storage was not granted. Your data may be cleared if storage is low.');
      }
    } catch (error) {
      console.error('Failed to request persistence:', error);
    }
  };

  const handleSettingChange = async (key: keyof Settings, value: any) => {
    if (!settings) return;

    const updated = { ...settings, [key]: value };
    setSettings(updated);

    try {
      await updateStorageSettings(updated);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  if (isLoading || !stats || !settings) {
    return <div className="loading">Loading storage information...</div>;
  }

  const availableSpace = stats.quota - stats.usage;
  const maxAllowed = settings.maxStorageMB
    ? settings.maxStorageMB * 1024 * 1024
    : settings.maxStoragePercent
    ? (stats.quota * settings.maxStoragePercent) / 100
    : stats.quota;

  return (
    <div className="storage-settings">
      <h2>Storage Management</h2>

      {/* Storage Overview */}
      <section className="storage-overview">
        <h3>Storage Overview</h3>
        
        <div className="storage-bar">
          <div
            className="storage-bar-fill"
            style={{
              width: `${Math.min(stats.percentUsed, 100)}%`,
              backgroundColor:
                stats.percentUsed > 90
                  ? '#f44336'
                  : stats.percentUsed > 70
                  ? '#ff9800'
                  : '#4caf50',
            }}
          />
        </div>

        <div className="storage-stats">
          <div className="stat">
            <label>Total Used:</label>
            <span>{formatBytes(stats.usage)}</span>
          </div>
          <div className="stat">
            <label>Total Available:</label>
            <span>{formatBytes(stats.quota)}</span>
          </div>
          <div className="stat">
            <label>IndexedDB:</label>
            <span>{formatBytes(stats.indexedDBSize)}</span>
          </div>
          <div className="stat">
            <label>Cache:</label>
            <span>{formatBytes(stats.cacheSize)}</span>
          </div>
          <div className="stat">
            <label>Available Space:</label>
            <span>{formatBytes(availableSpace)}</span>
          </div>
          <div className="stat">
            <label>Percent Used:</label>
            <span>{stats.percentUsed.toFixed(1)}%</span>
          </div>
        </div>

        <div className="persistence-status">
          <label>Persistent Storage:</label>
          <span className={isPersisted ? 'granted' : 'not-granted'}>
            {isPersisted ? '✓ Granted' : '✗ Not Granted'}
          </span>
          {!isPersisted && (
            <button onClick={handleRequestPersistence} className="btn-secondary">
              Request Persistence
            </button>
          )}
        </div>
      </section>

      {/* Storage Limits */}
      <section className="storage-limits">
        <h3>Storage Limits</h3>

        <div className="setting-group">
          <label>
            <input
              type="checkbox"
              checked={settings.autoEvict}
              onChange={(e) => handleSettingChange('autoEvict', e.target.checked)}
            />
            Enable automatic eviction (LRU)
          </label>
          <p className="help-text">
            Automatically delete oldest records when storage limit is reached
          </p>
        </div>

        <div className="setting-group">
          <label>Maximum Storage (MB)</label>
          <input
            type="number"
            value={settings.maxStorageMB || ''}
            onChange={(e) =>
              handleSettingChange('maxStorageMB', e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="Leave empty for percentage-based"
            min="10"
          />
          <p className="help-text">
            Set a fixed maximum storage in megabytes
          </p>
        </div>

        <div className="setting-group">
          <label>Maximum Storage (%)</label>
          <input
            type="number"
            value={settings.maxStoragePercent || ''}
            onChange={(e) =>
              handleSettingChange('maxStoragePercent', e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="Leave empty for MB-based"
            min="10"
            max="100"
          />
          <p className="help-text">
            Set maximum as percentage of available quota
          </p>
        </div>

        <div className="setting-group">
          <label>Warning Threshold (%)</label>
          <input
            type="number"
            value={settings.warnThresholdPercent}
            onChange={(e) =>
              handleSettingChange('warnThresholdPercent', parseInt(e.target.value))
            }
            min="50"
            max="100"
          />
          <p className="help-text">
            Show warning when storage usage exceeds this percentage
          </p>
        </div>

        {settings.autoEvict && (
          <div className="info-box">
            <strong>Note:</strong> With automatic eviction enabled, the oldest
            records will be deleted when storage reaches{' '}
            {formatBytes(maxAllowed)}
          </div>
        )}
      </section>

      {/* Actions */}
      <section className="storage-actions">
        <h3>Actions</h3>

        <div className="action-buttons">
          <button onClick={loadData} className="btn-secondary">
            🔄 Refresh Stats
          </button>

          <button onClick={handleClearCache} className="btn-warning">
            🗑️ Clear Cache
          </button>

          <button onClick={handleClearData} className="btn-danger">
            ⚠️ Clear All Data
          </button>
        </div>
      </section>

      <style>{`
        .storage-settings {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .storage-settings h2 {
          margin-bottom: 24px;
        }

        .storage-settings section {
          background: #fff;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .storage-settings h3 {
          margin-top: 0;
          margin-bottom: 16px;
          color: #333;
        }

        .storage-bar {
          height: 24px;
          background: #e0e0e0;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .storage-bar-fill {
          height: 100%;
          transition: width 0.3s, background-color 0.3s;
        }

        .storage-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .stat {
          display: flex;
          justify-content: space-between;
          padding: 8px;
          background: #f5f5f5;
          border-radius: 4px;
        }

        .stat label {
          font-weight: 500;
          color: #666;
        }

        .stat span {
          font-weight: 600;
          color: #333;
        }

        .persistence-status {
          margin-top: 16px;
          padding: 12px;
          background: #f5f5f5;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .persistence-status .granted {
          color: #4caf50;
          font-weight: 600;
        }

        .persistence-status .not-granted {
          color: #ff9800;
          font-weight: 600;
        }

        .setting-group {
          margin-bottom: 20px;
        }

        .setting-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .setting-group input[type="number"] {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .setting-group input[type="checkbox"] {
          margin-right: 8px;
        }

        .help-text {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: #666;
        }

        .info-box {
          padding: 12px;
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
          border-radius: 4px;
          margin-top: 16px;
        }

        .action-buttons {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        button:hover {
          opacity: 0.9;
        }

        .btn-secondary {
          background: #757575;
          color: white;
        }

        .btn-warning {
          background: #ff9800;
          color: white;
        }

        .btn-danger {
          background: #f44336;
          color: white;
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