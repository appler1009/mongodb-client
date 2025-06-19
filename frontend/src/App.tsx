// frontend/src/App.tsx
import './App.css'; // Keep your global styles
import { ConnectionManager } from './pages/ConnectionManager'; // We'll create this next

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>MongoDB Client</h1>
      </header>
      <main>
        <ConnectionManager />
      </main>
    </div>
  );
}

export default App;
