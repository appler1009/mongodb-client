// frontend/src/components/ThemeToggle.tsx
import React from 'react';
import type { ThemeMode } from '../App';

interface ThemeToggleProps {
  currentTheme: ThemeMode;
  toggleTheme: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ currentTheme, toggleTheme }) => {
  return (
    <button onClick={toggleTheme} className="theme-toggle-button" aria-label="Toggle theme">
      {currentTheme === 'light' ? (
        <span className="theme-icon">☀️</span> // Sun icon for light mode
      ) : (
        <span className="theme-icon">🌙</span> // Moon icon for dark mode
      )}
    </button>
  );
};
