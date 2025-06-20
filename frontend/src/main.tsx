// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { ThemeProvider } from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider> {/* Wrap the App component with ThemeProvider */}
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
