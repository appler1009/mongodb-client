// frontend/src/components/AppHeader.tsx

import React, { useContext } from 'react';
import type { ConnectionStatus } from '../types';
import { ThemeContext } from '../context/ThemeContext';

import SunIcon from '../assets/icons/sun-icon.svg';
import MoonIcon from '../assets/icons/moon-icon.svg';
import SystemIcon from '../assets/icons/system-icon.svg';


interface AppHeaderProps {
  currentStatus: ConnectionStatus | null;
  onDisconnect: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentStatus,
  onDisconnect,
}) => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('AppHeader must be used within a ThemeProvider');
  }

  // Destructure values from the ThemeContext
  // We'll use the `toggleTheme` function provided by the context directly.
  const { theme, toggleTheme, isSystemThemeActive, setIsSystemThemeActive } = themeContext;

  // Toggle for system theme preference
  const handleToggleSystemTheme = () => {
    setIsSystemThemeActive(prev => !prev);
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="app-title">MongoDB Client</h1>
        <div className="status-indicators">
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
        {/* System theme toggle button */}
        <button
          onClick={handleToggleSystemTheme} // Use the new handler name
          className={`theme-toggle-button system-toggle ${isSystemThemeActive ? 'active' : ''}`}
          title={isSystemThemeActive ? 'Using System Theme (Click to switch to manual mode)' : 'Switch to System Theme'}
        >
          <img src={SystemIcon} alt="System Theme Icon" className="theme-icon" />
        </button>

        {/* Manual theme toggle button - disabled when system theme is active */}
        <button
          onClick={toggleTheme} // Use the `toggleTheme` from context directly
          className="theme-toggle-button manual-toggle"
          title={isSystemThemeActive ? 'Disabled (System theme is active)' : `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          disabled={isSystemThemeActive} // Disable if system theme is active
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
