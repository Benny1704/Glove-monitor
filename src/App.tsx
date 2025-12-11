import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, Plus, AlertTriangle, ChevronLeft } from 'lucide-react'; // Lucide Icons
import { RecordList } from './components/RecordList';
import { RecordDetail } from './components/RecordDetail';
import { StorageSettings } from './components/StorageSettings';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CaptureView } from './components/CaptureView';
import { AppProvider } from './context/AppContext';
import { initDB } from './services/indexedDB';
import { isStorageWarning } from './services/storageManager';
import type { Record } from './types';
import './index.css';

// Animated FAB
const FloatingActionButton: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide FAB on capture and settings pages
  if (location.pathname !== '/') return null;

  return (
    <div className="fab-container">
      <motion.button
        className="fab"
        onClick={() => navigate('/capture')}
        aria-label="Capture New"
        initial={{ scale: 0, rotate: 90 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0, rotate: 90 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
};

// Dynamic Header
const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {!isHome && (
          <motion.button 
            className="icon-btn" 
            onClick={() => navigate(-1)}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeft size={24} />
          </motion.button>
        )}
        <h1 className="app-title">
          {location.pathname === '/capture' ? 'New Record' : 
           location.pathname === '/settings' ? 'Settings' : 
           'Glove Monitor'}
        </h1>
      </div>

      {isHome && (
        <Link to="/settings">
          <motion.div className="icon-btn" whileTap={{ scale: 0.9, rotate: 45 }}>
            <Settings size={24} />
          </motion.div>
        </Link>
      )}
    </header>
  );
};

const RecordsPage: React.FC = () => {
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);

  return (
    <motion.div 
      className="records-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <RecordList onRecordSelect={setSelectedRecord} />
      {selectedRecord && (
        <RecordDetail
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </motion.div>
  );
};

// Wrapper to animate route changes
const AnimatedRoutes: React.FC = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<RecordsPage />} />
        <Route path="/capture" element={<CaptureView />} />
        <Route path="/settings" element={<StorageSettings />} />
      </Routes>
    </AnimatePresence>
  );
};

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
        <div className="app-container">
          <OfflineIndicator />
          <Header />

          {/* Animated Storage Warning */}
          <AnimatePresence>
            {storageWarning && (
              <motion.div
                className="storage-warning-banner"
                initial={{ height: 0, opacity: 0, y: -20 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -20 }}
              >
                <AlertTriangle size={20} />
                <span>Storage running low</span>
                <Link to="/settings">Manage</Link>
              </motion.div>
            )}
          </AnimatePresence>

          <main className="main-content">
            <AnimatedRoutes />
          </main>

          <FloatingActionButton />
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;