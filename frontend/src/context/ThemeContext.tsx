import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  isSystemThemeActive: boolean;
  setIsSystemThemeActive: React.Dispatch<React.SetStateAction<boolean>>;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('light');
  const [isSystemThemeActive, setIsSystemThemeActive] = useState<boolean>(false);

  const getSystemTheme = useCallback((): Theme => {
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }, []);

  // Load initial theme and system preference from Electron
  useEffect(() => {
    const loadPreferences = async () => {
      if (window.electronAPI && typeof window.electronAPI.loadThemePreference === 'function') {
        const savedTheme = await window.electronAPI.loadThemePreference();
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
          setThemeState(savedTheme);
        }
      }
      if (window.electronAPI && typeof window.electronAPI.loadSystemThemePreference === 'function') {
        const savedIsSystemActive = await window.electronAPI.loadSystemThemePreference();
        if (typeof savedIsSystemActive === 'boolean') {
          setIsSystemThemeActive(savedIsSystemActive);
        }
      }
    };
    loadPreferences();
  }, []);

  // Save theme preference to Electron
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.saveThemePreference === 'function' && theme) {
      window.electronAPI.saveThemePreference(theme);
    }
  }, [theme]);

  // Save system theme preference to Electron
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.saveSystemThemePreference === 'function') {
      window.electronAPI.saveSystemThemePreference(isSystemThemeActive);
    }
  }, [isSystemThemeActive]);

  // Apply data-bs-theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
  }, [theme]);

  // Sync with system theme when isSystemThemeActive is true
  useEffect(() => {
    if (isSystemThemeActive) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        setThemeState(getSystemTheme());
      };
      setThemeState(getSystemTheme());
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [isSystemThemeActive, getSystemTheme]);

  const memoizedSetTheme: ThemeContextType['setTheme'] = useCallback(
    (newThemeAction) => {
      if (!isSystemThemeActive) {
        setThemeState(newThemeAction);
      } else {
        console.warn("Cannot manually set theme when 'Use System Theme' is active.");
      }
    },
    [isSystemThemeActive],
  );

  const toggleTheme = useCallback(() => {
    if (!isSystemThemeActive) {
      setThemeState((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
    }
  }, [isSystemThemeActive]);

  const contextValue = useMemo(
    () => ({
      theme,
      setTheme: memoizedSetTheme,
      isSystemThemeActive,
      setIsSystemThemeActive,
      toggleTheme,
    }),
    [theme, memoizedSetTheme, isSystemThemeActive, setIsSystemThemeActive, toggleTheme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};
