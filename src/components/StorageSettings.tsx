import React, { useState, useEffect } from 'react';
import {
  getStorageEstimate,
  getStorageSettings,
  updateStorageSettings,
  clearCaches,
  requestPersistentStorage,
  isStoragePersisted,
  applyRetentionPolicy
} from '../services/storageManager';
import { nukeAllData } from '../services/dataManager';
import type { StorageStats, StorageSettings as Settings } from '../types';
import { formatBytes } from '../utils/compression';

export const StorageSettings: React.FC = () => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isPersisted, setIsPersisted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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

  const handleSettingChange = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await updateStorageSettings(updated);
  };

  const handleRunEviction = async () => {
    setIsProcessing(true);
    try {
      const count = await applyRetentionPolicy();
      await loadData();
      alert(`Cleanup complete. Removed ${count} expired records.`);
    } catch (e) {
      alert('Cleanup failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear app cache? This will force resources to re-download.')) return;
    setIsProcessing(true);
    try {
      await clearCaches();
      await loadData();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNuke = async () => {
    if (!confirm('CRITICAL WARNING: This will delete ALL records, photos, and videos. This cannot be undone.')) return;
    if (prompt('Type "DELETE" to confirm factory reset:') !== 'DELETE') return;
    
    setIsProcessing(true);
    try {
      await nukeAllData();
      await loadData();
      alert('Application data reset successfully.');
    } catch (e) {
      alert('Reset failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading || !stats || !settings) return <div className="loading-spinner">Loading settings...</div>;

  const freeSpace = stats.quota - stats.usage;
  const opfsPercent = (stats.breakdown?.opfsBytes || 0) / stats.usage * 100 || 0;
  const idbPercent = (stats.breakdown?.idbBytes || 0) / stats.usage * 100 || 0;
  const cachePercent = (stats.breakdown?.cacheBytes || 0) / stats.usage * 100 || 0;

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h2>Storage & Data</h2>
        <div className="persistence-badge">
          {isPersisted ? (
            <span className="badge success">Persistent Storage Active</span>
          ) : (
            <button className="btn-link" onClick={() => requestPersistentStorage().then(loadData)}>
              Enable Persistence
            </button>
          )}
        </div>
      </header>

      {/* Storage Visualizer */}
      <section className="card usage-card">
        <div className="usage-header">
          <span className="big-stat">{formatBytes(stats.usage)}</span>
          <span className="sub-stat">used of {formatBytes(stats.quota)}</span>
        </div>
        
        <div className="progress-stacked">
          <div className="bar opfs" style={{ width: `${opfsPercent}%` }} title="Files (Photos/Videos)" />
          <div className="bar idb" style={{ width: `${idbPercent}%` }} title="Database (Records)" />
          <div className="bar cache" style={{ width: `${cachePercent}%` }} title="App Cache" />
        </div>

        <div className="legend">
          <div className="legend-item"><span className="dot opfs"></span>Files ({formatBytes(stats.breakdown?.opfsBytes || 0)})</div>
          <div className="legend-item"><span className="dot idb"></span>Database ({formatBytes(stats.breakdown?.idbBytes || 0)})</div>
          <div className="legend-item"><span className="dot cache"></span>Cache ({formatBytes(stats.breakdown?.cacheBytes || 0)})</div>
        </div>

        <div className="meta-stats">
          <div className="meta-item">
            <strong>{stats.recordCount}</strong> Records
          </div>
          <div className="meta-item">
            <strong>{stats.fileCount}</strong> Files stored
          </div>
          <div className="meta-item">
            <strong>{formatBytes(freeSpace)}</strong> Free
          </div>
        </div>
      </section>

      {/* Limits Configuration */}
      <section className="card">
        <h3>Storage Limits</h3>
        <div className="form-row">
          <label>
            Max Storage Limit (MB)
            <span className="hint">0 = Browser Default</span>
          </label>
          <input 
            type="number" 
            value={settings.maxStorageMB} 
            onChange={(e) => handleSettingChange('maxStorageMB', Number(e.target.value))}
          />
        </div>
        <div className="form-row">
          <label>Warning Threshold (%)</label>
          <input 
            type="range" 
            min="50" max="95" 
            value={settings.warnThresholdPercent}
            onChange={(e) => handleSettingChange('warnThresholdPercent', Number(e.target.value))}
          />
          <span className="range-val">{settings.warnThresholdPercent}%</span>
        </div>
      </section>

      {/* Retention Policy */}
      <section className="card">
        <h3>Retention Policy</h3>
        <div className="form-row checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={settings.autoEvict}
              onChange={(e) => handleSettingChange('autoEvict', e.target.checked)}
            />
            Enable Auto-Eviction when full
          </label>
        </div>
        
        <div className="form-row">
          <label>
            Keep records for (Days)
            <span className="hint">0 = Keep Forever</span>
          </label>
          <input 
            type="number" 
            min="0"
            value={settings.retentionDays}
            onChange={(e) => handleSettingChange('retentionDays', Number(e.target.value))}
          />
        </div>

        <div className="form-row checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={settings.deleteSyncedOnly}
              onChange={(e) => handleSettingChange('deleteSyncedOnly', e.target.checked)}
            />
            Only delete records that are synced
          </label>
        </div>

        <button className="btn-secondary" onClick={handleRunEviction} disabled={isProcessing}>
          Run Cleanup Now
        </button>
      </section>

      {/* Media Quality */}
      <section className="card">
        <h3>Media Quality</h3>
        <div className="form-row">
          <label>Image Quality</label>
          <select 
            value={settings.imageCompressionQuality}
            onChange={(e) => handleSettingChange('imageCompressionQuality', Number(e.target.value))}
          >
            <option value={1}>Original (100%)</option>
            <option value={0.8}>High (80%)</option>
            <option value={0.6}>Medium (60%)</option>
            <option value={0.4}>Low (40%)</option>
          </select>
        </div>
      </section>

      {/* Maintenance Zone */}
      <section className="card danger-zone">
        <h3>Maintenance</h3>
        <div className="button-group">
          <button className="btn-warning" onClick={handleClearCache} disabled={isProcessing}>
            Clear App Cache
          </button>
          <button className="btn-danger" onClick={handleNuke} disabled={isProcessing}>
            Factory Reset App
          </button>
        </div>
      </section>

      <style>{`
        .settings-container { max-width: 600px; margin: 0 auto; padding-bottom: 40px; }
        .settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        
        .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .card h3 { margin-bottom: 15px; font-size: 16px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        
        .usage-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
        .big-stat { font-size: 28px; font-weight: 800; color: #2196f3; }
        .sub-stat { color: #666; font-size: 14px; }
        
        .progress-stacked { display: flex; height: 12px; background: #eee; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
        .bar { height: 100%; }
        .bar.opfs { background: #2196f3; }
        .bar.idb { background: #9c27b0; }
        .bar.cache { background: #ff9800; }
        
        .legend { display: flex; gap: 15px; font-size: 12px; color: #666; margin-bottom: 15px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 5px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }
        .dot.opfs { background: #2196f3; }
        .dot.idb { background: #9c27b0; }
        .dot.cache { background: #ff9800; }
        
        .meta-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
        .meta-item { font-size: 12px; color: #666; display: flex; flex-direction: column; }
        .meta-item strong { font-size: 16px; color: #333; margin-bottom: 2px; }

        .form-row { margin-bottom: 15px; }
        .form-row label { display: block; font-weight: 500; font-size: 14px; margin-bottom: 5px; }
        .form-row.checkbox { display: flex; align-items: center; }
        .form-row.checkbox input { margin-right: 10px; width: auto; }
        .form-row.checkbox label { margin: 0; font-weight: normal; }
        .hint { display: block; font-size: 11px; color: #999; font-weight: normal; margin-top: 2px; }
        
        input[type="number"], select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; }
        input[type="range"] { width: calc(100% - 50px); vertical-align: middle; }
        .range-val { display: inline-block; width: 40px; text-align: right; font-weight: bold; font-size: 14px; }

        .button-group { display: flex; gap: 10px; }
        button { padding: 12px 20px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; width: 100%; }
        .btn-link { background: none; color: #2196f3; padding: 0; width: auto; text-decoration: underline; }
        .btn-secondary { background: #f5f5f5; color: #333; border: 1px solid #ddd; }
        .btn-warning { background: #fff3e0; color: #f57c00; }
        .btn-danger { background: #ffebee; color: #d32f2f; }
        
        .badge { font-size: 11px; padding: 4px 8px; border-radius: 12px; background: #eee; }
        .badge.success { background: #e8f5e9; color: #2e7d32; }
      `}</style>
    </div>
  );
};