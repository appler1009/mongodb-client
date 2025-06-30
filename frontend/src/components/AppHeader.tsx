import React, { useContext, useEffect } from 'react';
import { Navbar, Nav, Button, Container } from 'react-bootstrap';
import { ThemeContext } from '../context/ThemeContext';
import '../styles/AppHeader.css';

interface AppHeaderProps {
}

export const AppHeader: React.FC<AppHeaderProps> = () => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('AppHeader must be used within a ThemeProvider');
  }

  const { theme, toggleTheme, isSystemThemeActive, setIsSystemThemeActive } = themeContext;

  const handleToggleSystemTheme = () => {
    setIsSystemThemeActive((prev) => !prev);
  };

  // Apply theme to document body based on system preference or manual setting
  useEffect(() => {
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const effectiveTheme = isSystemThemeActive
        ? (prefersDark ? 'dark' : 'light')
        : theme;
      document.body.setAttribute('data-bs-theme', effectiveTheme);
    };
    applyTheme();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme, isSystemThemeActive]);

  return (
    <Navbar expand="lg" className="app-header" data-bs-theme={isSystemThemeActive ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme}>
      <Container fluid>
        <Navbar.Brand className="app-title">MongoDB Client</Navbar.Brand>
        <Nav className="ms-auto">
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
