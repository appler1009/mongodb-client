// frontend/src/components/AppHeader.tsx

import React from 'react';
import type { ConnectionStatus } from '../types';

interface AppHeaderProps {
  backendHealth: string;
  currentStatus: ConnectionStatus | null;
  toggleTheme: () => void;
  currentTheme: 'light' | 'dark';
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  backendHealth,
  currentStatus,
  toggleTheme,
  currentTheme,
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">MongoDB Client</h1>
        <div className="status-indicators">
          <span className="health-status-header">
            Backend: <span style={{ color: backendHealth.includes('Up') ? 'green' : 'red' }}>{backendHealth.split(': ')[1]}</span>
          </span>
          {currentStatus && (
            <span className="connection-status-header">
              Connected to: <strong className="connected-db-name">{currentStatus.database}</strong>
            </span>
          )}
        </div>
      </div>
      <div className="header-right">
        <button onClick={toggleTheme} className="theme-toggle-button">
          Switch to {currentTheme === 'light' ? 'Dark' : 'Light'} Mode
        </button>
      </div>
    </header>
  );
};
