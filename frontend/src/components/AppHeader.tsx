import React, { useContext } from 'react';
import { Navbar, Nav, Button, Container } from 'react-bootstrap';
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

  const { theme, toggleTheme, isSystemThemeActive, setIsSystemThemeActive } = themeContext;

  const handleToggleSystemTheme = () => {
    setIsSystemThemeActive((prev) => !prev);
  };

  return (
    <Navbar expand="lg" className="app-header mb-3">
      <Container fluid>
        <Navbar.Brand className="app-title">MongoDB Client</Navbar.Brand>
        <Nav className="me-auto status-indicators">
          {currentStatus && (
            <Nav.Item className="connection-status-header">
              Connected to: <strong className="connected-db-name">{currentStatus.database}</strong>
            </Nav.Item>
          )}
        </Nav>
        <Nav className="ms-auto">
          {currentStatus && (
            <Button
              variant="danger"
              onClick={onDisconnect}
              className="me-2"
              title="Disconnect from current database"
            >
              Disconnect
            </Button>
          )}
          <Button
            variant={isSystemThemeActive ? 'primary' : 'outline-secondary'}
            onClick={handleToggleSystemTheme}
            className="theme-toggle-button system-toggle me-2"
            title={isSystemThemeActive ? 'Using System Theme (Click to switch to manual mode)' : 'Switch to System Theme'}
          >
            <img src={SystemIcon} alt="System Theme Icon" className="theme-icon" />
          </Button>
          <Button
            variant={theme === 'dark' ? 'outline-light' : 'outline-dark'}
            onClick={toggleTheme}
            className="theme-toggle-button manual-toggle"
            title={isSystemThemeActive ? 'Disabled (System theme is active)' : `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            disabled={isSystemThemeActive}
          >
            <img
              src={theme === 'light' ? MoonIcon : SunIcon}
              alt={theme === 'light' ? 'Moon icon for Dark Mode' : 'Sun icon for Light Mode'}
              className="theme-icon"
            />
          </Button>
        </Nav>
      </Container>
    </Navbar>
  );
};
