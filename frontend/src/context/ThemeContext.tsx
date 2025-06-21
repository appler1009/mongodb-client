// frontend/src/context/ThemeContext.ts
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

// Define the Theme type
export type Theme = 'light' | 'dark';

// Define the interface for the context value
export interface ThemeContextType {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  isSystemThemeActive: boolean;
  setIsSystemThemeActive: React.Dispatch<React.SetStateAction<boolean>>;
}

// Create and export the context
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Props for the ThemeProvider component
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Initialize theme from localStorage or default to 'light'
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    return (savedTheme as Theme) || 'light';
  });

  // State to control if system theme preference is active
  const [isSystemThemeActive, setIsSystemThemeActive] = useState<boolean>(() => {
    // Initialize from localStorage or default to false (manual control)
    const savedSystemThemeActive = localStorage.getItem('isSystemThemeActive');
    return savedSystemThemeActive ? JSON.parse(savedSystemThemeActive) : false;
  });

  // Effect to apply the current theme to the document body's class
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Effect to save the current theme preference to localStorage
  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Effect to save the system theme active status to localStorage
  useEffect(() => {
    localStorage.setItem('isSystemThemeActive', JSON.stringify(isSystemThemeActive));
  }, [isSystemThemeActive]);

  // Callback to get the current system theme preference
  const getSystemTheme = useCallback((): Theme => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  // Effect to listen for changes in the system's preferred color scheme
  useEffect(() => {
    if (isSystemThemeActive) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = () => {
        setThemeState(getSystemTheme()); // Update app theme to match system
      };

      // Set initial theme based on system preference if system theme control is active
      setThemeState(getSystemTheme());

      // Add event listener for changes
      mediaQuery.addEventListener('change', handleChange);
      // Clean up the event listener when component unmounts or dependency changes
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [isSystemThemeActive, getSystemTheme]); // Re-run this effect when isSystemThemeActive or getSystemTheme changes

  // Memoized `setTheme` function that respects `isSystemThemeActive`
  // This is the `setTheme` function exposed via context
  const memoizedSetTheme: ThemeContextType['setTheme'] = useCallback((newThemeAction) => {
    if (!isSystemThemeActive) {
      // If newThemeAction is a function, call it with the current theme state
      // otherwise, use newThemeAction directly
      setThemeState(prevTheme => {
        const resolvedTheme = typeof newThemeAction === 'function'
          ? newThemeAction(prevTheme) // Call the function to get the actual theme
          : newThemeAction;
        return resolvedTheme;
      });
    }
  }, [isSystemThemeActive]);

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({
    theme,
    setTheme: memoizedSetTheme, // Use the controlled setTheme function
    isSystemThemeActive,
    setIsSystemThemeActive,
  }), [theme, memoizedSetTheme, isSystemThemeActive, setIsSystemThemeActive]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};
