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
  toggleTheme: () => void;
}

// Create and export the context
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Props for the ThemeProvider component
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // State for the current theme
  const [theme, setThemeState] = useState<Theme>('light'); // Default to light, will be loaded from Electron

  // State to control if system theme preference is active
  const [isSystemThemeActive, setIsSystemThemeActive] = useState<boolean>(false); // Default to false, will be loaded from Electron

  // Callback to get the current system theme preference
  const getSystemTheme = useCallback((): Theme => {
    // Check if window.matchMedia is available (it should be in Electron renderer)
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light'; // Fallback if for some reason matchMedia isn't available
  }, []);

  // --- IPC for Theme Persistence ---
  // Effect to load initial theme and system preference status from Electron on component mount
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
  }, []); // Run once on mount

  // Effect to save the current theme preference to Electron when it changes
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.saveThemePreference === 'function' && theme) {
      window.electronAPI.saveThemePreference(theme);
    }
  }, [theme]);

  // Effect to save the system theme active status to Electron when it changes
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.saveSystemThemePreference === 'function' && typeof isSystemThemeActive === 'boolean') {
      window.electronAPI.saveSystemThemePreference(isSystemThemeActive);
    }
  }, [isSystemThemeActive]);


  // Effect to apply the current theme to the document body's class
  // This is still important for CSS to react to the theme
  useEffect(() => {
    // It's often better to apply theme classes to the <body> or <html> element
    // Using document.documentElement.setAttribute('data-theme', theme); is also a valid approach
    // and works well with CSS variables. Let's stick to the data-attribute you had.
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);


  // Effect to listen for changes in the system's preferred color scheme
  // This effect should only manage the theme if `isSystemThemeActive` is true
  useEffect(() => {
    if (isSystemThemeActive) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = () => {
        setThemeState(getSystemTheme()); // Update app theme to match system
      };

      // Set initial theme based on system preference when system theme control is activated
      // This is crucial to sync immediately if the user just enabled system theme control
      setThemeState(getSystemTheme());

      // Add event listener for changes
      mediaQuery.addEventListener('change', handleChange);
      // Clean up the event listener when component unmounts or dependency changes
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // If isSystemThemeActive becomes false, ensure system theme no longer forces changes
    // The user's manually set theme will persist via the other useEffect
  }, [isSystemThemeActive, getSystemTheme]);

  // Memoized `setTheme` function that respects `isSystemThemeActive`
  // This is the `setTheme` function exposed via context
  const memoizedSetTheme: ThemeContextType['setTheme'] = useCallback((newThemeAction) => {
    // Only allow setting a theme manually if system theme control is NOT active
    if (!isSystemThemeActive) {
      setThemeState(newThemeAction);
    } else {
      // Optionally, if system theme is active, and someone tries to set a theme,
      // you could log a warning or simply do nothing, as system preference overrides.
      console.warn("Cannot manually set theme when 'Use System Theme' is active.");
    }
  }, [isSystemThemeActive]);

  // Utility to toggle theme (used by the button in AppHeader)
  const toggleTheme = useCallback(() => {
    if (!isSystemThemeActive) { // Only toggle if not using system theme
      setThemeState(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    }
  }, [isSystemThemeActive]);


  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({
    theme,
    setTheme: memoizedSetTheme, // Use the controlled setTheme function
    isSystemThemeActive,
    setIsSystemThemeActive,
    toggleTheme,
  }), [theme, memoizedSetTheme, isSystemThemeActive, setIsSystemThemeActive, toggleTheme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};
