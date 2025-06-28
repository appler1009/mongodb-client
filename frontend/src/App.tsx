// frontend/src/App.tsx
import React from 'react';
import { HomePage } from './pages/HomePage';
import './styles/App.css';

const App: React.FC = () => {
  return (
    <div className="app-container">
      <HomePage />
    </div>
  );
};

export default App;
