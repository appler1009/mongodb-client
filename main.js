// my-mongo-client/main.js
const { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { default: Store } = require('electron-store');

// Initialize electron-store for user preferences
const store = new Store({
  defaults: {
    theme: 'light',           // Default theme preference
    isSystemThemeActive: false, // Default to not using system theme
  },
});

// Import the compiled backend module
const backend = require('./backend/dist/index'); // Adjust if your compiled backend is elsewhere

let mainWindow; // Declare mainWindow globally to be accessible for lifecycle events

function createWindow() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow = new BrowserWindow({ // Assign to the global mainWindow
      width: Math.min(1200, width * 0.9),
      height: Math.min(800, height * 0.9),
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        devTools: !app.isPackaged // Disable DevTools in production
      },
    });

    // Load the React app (from its build output)
    const startUrl = app.isPackaged
      ? `file://${path.join(__dirname, 'frontend/dist/index.html')}`
      : 'http://localhost:5173';

    mainWindow.loadURL(startUrl)
      .then(() => {
        console.log('Window loaded successfully:', startUrl);
        // Open the DevTools only in development
        if (!app.isPackaged) {
          mainWindow.webContents.openDevTools();
        }
      })
      .catch(error => {
        console.error('Failed to load URL:', startUrl, error);
        // If URL loading fails, also quit the app
        dialog.showErrorBox('Application Error', `Failed to load the application. Please ensure the development server is running or the app is correctly packaged.\n\nError: ${error.message}`);
        app.quit();
      });

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
      mainWindow = null; // Dereference the window object to allow garbage collection
    });

  } catch (error) {
    console.error('Error creating BrowserWindow:', error);
    // If window creation itself fails, quit the app
    dialog.showErrorBox('Application Error', `Failed to create application window. This might be due to system resources or invalid window options.\n\nError: ${error.message}`);
    app.quit();
  }
}

// --- Menu Customization ---
function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS App Menu (e.g., "MongoDB Client" menu)
    ...(isMac ? [{
      label: app.name, // Will automatically use productName from package.json
      submenu: [
        { role: 'about' }, // This uses productName for "About MongoDB Client"
        { type: 'separator' },
        { role: 'services' }, // Standard macOS Services menu
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        // No custom "Open File", "Save File" here, as your app uses a dialog handler
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },

    // Edit Menu (Standard, usually good to keep these for user expectation)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },

    // View Menu (Stripped down from default Electron, no reload/dev tools)
    {
      label: 'View',
      submenu: [
        // Removed: reload, forceReload, toggleDevTools
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Window Menu (Standard)
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'windowMenu' } // This role adds default macOS window management items
        ] : [
          { role: 'close' }
        ])
      ]
    },

    // Help Menu
    {
      role: 'help', // Automatically sets label to "Help" and some platform-specific behaviors
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/appler1009/mongodb-client');
          }
        },
        ...(!isMac ? [
          { type: 'separator' },
          {
            label: `About ${app.name}`,
            click: () => {
              // app.showAboutPanel() is the recommended way to show the standard Electron about box.
              // You can configure its content using app.setAboutPanelOptions() in package.json/build config.
              app.showAboutPanel();
            }
          }
        ] : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}


// --- App Lifecycle Events and Error Handling ---

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  createApplicationMenu(); // Call the menu creation function here

  dialog.showMessageBox(mainWindow, {
    title: 'Debug App Name',
    message: `app.name: "${app.name}"\nIs Packaged: ${app.isPackaged}`,
    buttons: ['OK']
  });
}).catch(error => {
  console.error('Electron app failed to become ready:', error);
  // Ensure app quits if it can't even become ready
  dialog.showErrorBox('Application Startup Error', `Electron failed to initialize correctly. The application cannot start.\n\nError: ${error.message}`);
  app.quit();
});

// Quit when all windows are closed.
// This will now quit on macOS as well, which is often the desired behavior for cross-platform apps.
app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Catch unhandled exceptions in the main process
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Main Process:', error);
  // Show a dialog to the user before quitting for critical errors
  dialog.showErrorBox('Critical Application Error', `An unexpected error occurred and the application must close.\n\nError: ${error.message}\n\nPlease report this issue.`);
  app.quit(); // Force quit the application gracefully if an unhandled error occurs
});

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
  }
  catch (error) {
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
    console.error('IPC error (mongo:connect):', error);
    throw error;
  }
});

ipcMain.handle('mongo:disconnect', async () => {
  try {
    return await backend.disconnectFromMongo();
  } catch (error) {
    console.error('IPC error (mongo:disconnect):', error);
    throw error;
  }
});

// Database Browse
ipcMain.handle('database:getCollections', async () => {
  try {
    return await backend.getDatabaseCollections();
  } catch (error) {
    console.error('IPC error (database:getCollections):', error);
    throw error;
  }
});

ipcMain.handle('database:getDocuments', async (event, collectionName, limit, skip, query) => {
  try {
    return await backend.getCollectionDocuments(collectionName, limit, skip, query);
  } catch (error) {
    console.error('IPC error (database:getDocuments):', error);
    throw error;
  }
});

ipcMain.handle('database:exportDocuments', async (event, collectionName, query) => {
  try {
    return await backend.exportCollectionDocuments(collectionName, query);
  } catch (error) {
    console.error('IPC error (database:exportDocuments):', error);
    throw error;
  }
});

// IPC handler for saving files
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

// Theme Management IPC Handlers
ipcMain.handle('theme:savePreference', async (event, theme) => {
  try {
    store.set('theme', theme);
  } catch (error) {
    console.error('Failed to save theme preference:', error);
    throw error;
  }
});

ipcMain.handle('theme:loadPreference', async () => {
  try {
    return store.get('theme');
  } catch (error) {
    console.error('Failed to load theme preference:', error);
    return null; // Return null or default in case of error
  }
});

ipcMain.handle('theme:saveSystemPreference', async (event, isActive) => {
  try {
    store.set('isSystemThemeActive', isActive);
  } catch (error) {
    console.error('Failed to save system theme active status:', error);
    throw error;
  }
});

ipcMain.handle('theme:loadSystemPreference', async () => {
  try {
    return store.get('isSystemThemeActive');
  } catch (error) {
    console.error('Failed to load system theme active status:', error);
    return null; // Return null or default in case of error
  }
});
