// frontend/src/components/AppHeader.tsx

import React, { useContext } from 'react';
import type { ConnectionStatus } from '../types';
import { ThemeContext } from '../context/ThemeContext';

import SunIcon from '../assets/icons/sun-icon.svg';
import MoonIcon from '../assets/icons/moon-icon.svg';


interface AppHeaderProps {
  backendStatus: { status: string; message: string; } | null;
  currentStatus: ConnectionStatus | null;
  onDisconnect: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  backendStatus,
  currentStatus,
  onDisconnect,
}) => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('AppHeader must be used within a ThemeProvider');
  }
  const { theme, setTheme } = themeContext;

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">MongoDB Client</h1>
        <div className="status-indicators">
          {backendStatus && backendStatus.status !== 'ok' && (
            <span className="health-status-header">
              Backend: <span style={{ color: backendStatus.status === 'error' ? 'red' : 'inherit' }}>{backendStatus.message}</span>
            </span>
          )}

          {currentStatus && (
            <>
              <span className="connection-status-header">
                Connected to: <strong className="connected-db-name">{currentStatus.database}</strong>
              </span>
              <button
                onClick={onDisconnect}
                className="disconnect-button"
                title="Disconnect from current database"
              >Disconnect</button>
            </>
          )}
        </div>
      </div>
      <div className="header-right">
        <button onClick={toggleTheme} className="theme-toggle-button" title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}>
          {theme === 'light' ? (
            <img src={MoonIcon} alt="Moon icon for Dark Mode" className="theme-icon" />
          ) : (
            <img src={SunIcon} alt="Sun icon for Light Mode" className="theme-icon" />
          )}
        </button>
      </div>
    </header>
  );
};
