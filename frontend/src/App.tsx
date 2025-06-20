// frontend/src/App.tsx
import React, { useState, useEffect, useContext } from 'react';
import './App.css';
import { ConnectionManager } from './pages/ConnectionManager';
// Import ThemeContext and Theme type from the new file
import { Theme, ThemeContext, ThemeContextType } from './context/ThemeContext';


// Theme Provider Component (remains in this file for now as it's a component)
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('theme') === null) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};


// Main App component
function App() {
  const themeContext = useContext(ThemeContext);

  if (!themeContext) {
    return <div>Error: Theme context not provided.</div>;
  }

  const { theme, setTheme } = themeContext;

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="App">
      <div className="theme-toggle-container">
        <button onClick={toggleTheme} className="theme-toggle-button">
          Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
        </button>
      </div>
      <ConnectionManager />
    </div>
  );
}

export default App;
