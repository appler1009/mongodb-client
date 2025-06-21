// frontend/src/context/ThemeContext.ts
import React from 'react';

// Define the Theme type
export type Theme = 'light' | 'dark';

// Define the interface for the context value
export interface ThemeContextType {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
}

// Create and export the context
export const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);
