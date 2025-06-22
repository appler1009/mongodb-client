// frontend/src/App.tsx

import './App.css';
import { ConnectionManager } from './pages/ConnectionManager';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    // Wrap the entire application with the ThemeProvider
    <ThemeProvider>
      <div className="App">
        <ConnectionManager />
      </div>
    </ThemeProvider>
  );
}

export default App;
