// my-mongo-client/main.js
const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const Store = require('electron-store');

// Initialize electron-store for user preferences
// It will automatically save/load from a JSON file in the user's config directory
const store = new Store({
  defaults: {
    theme: 'light',          // Default theme preference
    isSystemThemeActive: false, // Default to not using system theme
  },
});

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

  // Connection Management
  ipcMain.handle('connections:getConnections', async () => {
    try {
      return await backend.getConnections();
    } catch (error) {
      console.error('IPC error (getConnections):', error);
      throw error;
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

  // MongoDB Connection
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

  // Database Browse
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

  ipcMain.handle('database:exportDocuments', async (event, collectionName, query) => {
    try {
      return await backend.exportCollectionDocuments(collectionName, query);
    } catch (error) {
      console.error('IPC error (exportCollectionDocuments):', error);
      throw error;
    }
  });

  // IPC handler for saving files (unchanged, but now works with the updated frontend)
  ipcMain.handle('file:save', async (event, defaultFilename, content) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultFilename,
        filters: [
          { name: 'JSON Lines', extensions: ['jsonl'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (canceled || !filePath) {
        return { success: false, filePath: undefined };
      }

      await fs.writeFile(filePath, content);
      return { success: true, filePath: filePath };
    } catch (error) {
      console.error('IPC error (file:save):', error);
      return { success: false, filePath: undefined, error: error.message || 'Unknown error during file save.' };
    }
  });

  // --- Theme Management IPC Handlers (NEW) ---

  // Handle saving the user's selected theme preference
  ipcMain.handle('theme:savePreference', async (event, theme) => {
    try {
      store.set('theme', theme);
      // Optional: console.log(`Theme preference saved: ${theme}`);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
      throw error; // Re-throw to inform renderer if something went wrong
    }
  });

  // Handle loading the user's selected theme preference
  ipcMain.handle('theme:loadPreference', async () => {
    try {
      return store.get('theme');
    } catch (error) {
      console.error('Failed to load theme preference:', error);
      // Return null or default in case of error, to avoid crashing the renderer
      return null;
    }
  });

  // Handle saving the user's system theme active status
  ipcMain.handle('theme:saveSystemPreference', async (event, isActive) => {
    try {
      store.set('isSystemThemeActive', isActive);
      // Optional: console.log(`System theme active status saved: ${isActive}`);
    } catch (error) {
      console.error('Failed to save system theme active status:', error);
      throw error;
    }
  });

  // Handle loading the user's system theme active status
  ipcMain.handle('theme:loadSystemPreference', async () => {
    try {
      return store.get('isSystemThemeActive');
    } catch (error) {
      console.error('Failed to load system theme active status:', error);
      // Return null or default in case of error
      return null;
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
