// my-mongo-client/main.js
const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');

// Import the compiled backend module
// Ensure this path correctly points to the compiled JavaScript file
const backend = require('./backend/dist/index'); // Adjust if your compiled backend is elsewhere

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const mainWindow = new BrowserWindow({
    width: Math.min(1200, width * 0.9),
    height: Math.min(800, height * 0.9),
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the React app (from its build output)
  const startUrl = app.isPackaged
    ? `file://${path.join(__dirname, 'frontend/build/index.html')}`
    : 'http://localhost:5173';

  mainWindow.loadURL(startUrl);

  // Open the DevTools.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // --- Set up IPC Main Handlers ---
  // Each handler corresponds to an API call from your frontend
  ipcMain.handle('connections:getConnections', async () => {
    try {
      return await backend.getConnections();
    } catch (error) {
      console.error('IPC error (getConnections):', error);
      throw error; // Re-throw to send error back to renderer
    }
  });

  ipcMain.handle('connections:addConnection', async (event, newConnection) => {
    try {
      return await backend.addConnection(newConnection);
    } catch (error) {
      console.error('IPC error (addConnection):', error);
      throw error;
    }
  });

  ipcMain.handle('connections:updateConnection', async (event, id, updatedConnection) => {
    try {
      return await backend.updateConnection(id, updatedConnection);
    } catch (error) {
      console.error('IPC error (updateConnection):', error);
      throw error;
    }
  });

  ipcMain.handle('connections:deleteConnection', async (event, id) => {
    try {
      return await backend.deleteConnection(id);
    } catch (error) {
      console.error('IPC error (deleteConnection):', error);
      throw error;
    }
  });

  ipcMain.handle('mongo:connect', async (event, connectionId) => {
    try {
      return await backend.connectToMongo(connectionId);
    } catch (error) {
      console.error('IPC error (connectToMongo):', error);
      throw error;
    }
  });

  ipcMain.handle('mongo:disconnect', async () => {
    try {
      return await backend.disconnectFromMongo();
    } catch (error) {
      console.error('IPC error (disconnectFromMongo):', error);
      throw error;
    }
  });

  ipcMain.handle('database:getCollections', async () => {
    try {
      return await backend.getDatabaseCollections();
    } catch (error) {
      console.error('IPC error (getDatabaseCollections):', error);
      throw error;
    }
  });

  ipcMain.handle('database:getDocuments', async (event, collectionName, limit, skip, query) => {
    try {
      return await backend.getCollectionDocuments(collectionName, limit, skip, query);
    } catch (error) {
      console.error('IPC error (getCollectionDocuments):', error);
      throw error;
    }
  });

  // Handle export separately as it returns raw data for file saving
  ipcMain.handle('database:exportDocuments', async (event, collectionName, query) => {
    try {
      // The backend returns the NDJSON string
      return await backend.exportCollectionDocuments(collectionName, query);
    } catch (error) {
      console.error('IPC error (exportCollectionDocuments):', error);
      throw error;
    }
  });

  // IPC handler for saving files
  ipcMain.handle('file:save', async (event, defaultFilename, content) => {
    try {
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultFilename,
        filters: [
          { name: 'JSON Lines', extensions: ['jsonl'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (filePath) {
        const fs = require('fs/promises'); // Use fs/promises for async operations
        await fs.writeFile(filePath, content);
        return true; // Indicate success
      }
      return false; // User cancelled save dialog
    } catch (error) {
      console.error('IPC error (file:save):', error);
      throw error; // Re-throw error
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
