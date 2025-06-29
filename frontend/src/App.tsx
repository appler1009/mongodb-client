import React, { useContext, useEffect } from 'react';
import { Container } from 'react-bootstrap';
import { ThemeContext } from './context/ThemeContext';
import { HomePage } from './pages/HomePage';
import './styles/App.css';

const App: React.FC = () => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('App must be used within a ThemeProvider');
  }
  const { theme } = themeContext;

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }, [theme]);

  return (
    <Container fluid className="app-container py-3">
      <HomePage />
    </Container>
  );
};

export default App;
