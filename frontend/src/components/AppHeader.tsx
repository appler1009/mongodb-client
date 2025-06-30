import React, { useContext } from 'react';
import { Navbar, Nav, Button, Container } from 'react-bootstrap';
import type { ConnectionStatus } from '../types';
import { ThemeContext } from '../context/ThemeContext';

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
            <i className="bi bi-display theme-icon"></i>
          </Button>
          <Button
            variant={theme === 'dark' ? 'outline-light' : 'outline-dark'}
            onClick={toggleTheme}
            className="theme-toggle-button manual-toggle"
            title={isSystemThemeActive ? 'Disabled (System theme is active)' : `Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            disabled={isSystemThemeActive}
          >
            <i className={`bi ${theme === 'light' ? 'bi-moon-stars-fill' : 'bi-sun-fill'} theme-icon`}></i>
          </Button>
        </Nav>
      </Container>
    </Navbar>
  );
};
