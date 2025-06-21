// frontend/src/components/AppHeader.tsx

import React, { useContext } from 'react';
import type { ConnectionStatus } from '../types';
import { ThemeContext } from '../context/ThemeContext';
// import type { Theme } from '../context/ThemeContext';


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
  // Consume ThemeContext directly within AppHeader
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    // This should ideally not happen if App is wrapped by ThemeProvider
    throw new Error('AppHeader must be used within a ThemeProvider');
  }
  const { theme, setTheme } = themeContext; // Get the current theme and the setter from context

  // Define the local toggleTheme function using the context's setTheme
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
            <> {/* Use React Fragment to group the two elements */}
              <span className="connection-status-header">
                Connected to: <strong className="connected-db-name">{currentStatus.database}</strong>
              </span>
              {/* Disconnect Button */}
              <button
                onClick={onDisconnect}
                className="disconnect-button" // Add a class for styling
                title="Disconnect from current database"
              >Disconnect</button>
            </>
          )}
        </div>
      </div>
      <div className="header-right">
        {/* Use 'theme' from context for display logic */}
        <button onClick={toggleTheme} className="theme-toggle-button">
          Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
        </button>
      </div>
    </header>
  );
};
