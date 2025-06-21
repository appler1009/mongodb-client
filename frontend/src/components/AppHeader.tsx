// frontend/src/components/AppHeader.tsx

import React, { useContext, useMemo } from 'react';
import type { ConnectionStatus } from '../types';
import { ThemeContext } from '../context/ThemeContext';

import SunIcon from '../assets/icons/sun-icon.svg';
import MoonIcon from '../assets/icons/moon-icon.svg';
import SystemIcon from '../assets/icons/system-icon.svg';


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
  // Destructure new context values
  const { theme, setTheme, isSystemThemeActive, setIsSystemThemeActive } = themeContext;

  // Manual theme toggle
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));

  };

  // Toggle for system theme preference
  const toggleSystemTheme = () => {
    setIsSystemThemeActive(prev => !prev);
  };

  // Memoize the backend health message for clarity
  const backendHealthMessage = useMemo(() => {
    if (backendStatus) {
      if (backendStatus.status === 'error') {
        return <span style={{ color: 'red' }}>{backendStatus.message}</span>;
      }
      // Only return message if it's not 'ok' and not just a default 'Backend is running!'
      if (backendStatus.message && backendStatus.message !== 'Backend is running!') {
         return <span style={{ color: 'green' }}>{backendStatus.message}</span>;
      }
    }
    return null; // Don't show if status is 'ok' or message is default success
  }, [backendStatus]);


  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">MongoDB Client</h1>
        <div className="status-indicators">
          {backendHealthMessage && ( // Only show backend health message if it's not null
            <span className="health-status-header">Backend: {backendHealthMessage}</span>
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
        {/* NEW: System theme toggle button */}
        <button
          onClick={toggleSystemTheme}
          className={`theme-toggle-button system-toggle ${isSystemThemeActive ? 'active' : ''}`}
          title={isSystemThemeActive ? 'Using System Theme (Click to switch to manual mode)' : 'Switch to System Theme'}
        >
          <img src={SystemIcon} alt="System Theme Icon" className="theme-icon" />
        </button>

        {/* Manual theme toggle button - disabled when system theme is active */}
        <button
          onClick={toggleTheme}
          className="theme-toggle-button manual-toggle"
          title={isSystemThemeActive ? 'Disabled (System theme is active)' : `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          disabled={isSystemThemeActive} // NEW: Disable if system theme is active
        >
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
