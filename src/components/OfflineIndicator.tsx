import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="offline-indicator">
      <span>📡</span>
      <span>Offline Mode - Changes will sync when online</span>
      
      <style>{`
        .offline-indicator {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: #ff9800;
          color: white;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-weight: 500;
          z-index: 1001;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};