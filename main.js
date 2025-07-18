const { app, BrowserWindow, ipcMain, screen, dialog, Menu, shell } = require('electron');
const path = require('path');
// Corrected fs imports:
const fs = require('fs'); // For fs.createWriteStream (used by pino in production)
const fsPromises = require('fs/promises'); // For fs.promises.writeFile, fs.promises.rename
const { ensureDirSync } = require('fs-extra'); // For ensuring log directory exists in production
const { default: Store } = require('electron-store');
const pino = require('pino');

// Initialize pino logger
let logger;
if (process.env.NODE_ENV !== 'production') {
  // Use pino-pretty for human-readable logs in development
  logger = pino({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  });
} else {
  // In production, log to a file in the standard OS log directory
  const logDirectory = app.getPath('logs');
  ensureDirSync(logDirectory); // Ensure the log directory exists
  const logFilePath = path.join(logDirectory, app.getName() + '.log');
  // Create a write stream for Pino, appending to the log file
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  logger = pino({
    // Set the minimum log level for production (e.g., 'info', 'warn', 'error')
    level: 'info',
  }, logStream); // Direct the output to the file stream
}

// Utility function to debounce saves
function debounce(func, delay) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// Initialize electron-store for user preferences
const preferencesStore = new Store({
  defaults: {
    theme: 'light',
    isSystemThemeActive: false, // Default to not using system theme
    windowState: {
      width: 1200,
      height: 800,
      x: undefined, // 'undefined' means Electron will choose initial position
      y: undefined,
      isMaximized: false,
      isFullScreen: false,
    },
  },
});

// Initialize electron-store for connection configurations
const connectionsStore = new Store({
  name: 'connections', // This will create 'connections.json' in user data dir
  defaults: {
    connections: [], // Array to hold ConnectionConfig objects
  }
});


// Import and initialize the compiled backend module
let backend; // Declare backend globally so it can be assigned after initialization

let mainWindow; // Declare mainWindow globally to be accessible for lifecycle events

function createWindow() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Load the last known window state
    let windowState = preferencesStore.get('windowState');
    logger.debug(`Loaded window state: ${JSON.stringify(windowState)}`);

    // --- Logic to ensure window appears on an active screen ---
    let x = windowState.x;
    let y = windowState.y;

    // Ensure dimensions respect minWidth/minHeight and fit within typical screen sizes
    let initialWidth = Math.max(windowState.width, 800);
    let initialHeight = Math.max(windowState.height, 600);

    // Scale down if stored size is excessively large compared to primary display
    if (initialWidth > screenWidth * 0.95) initialWidth = Math.round(screenWidth * 0.95);
    if (initialHeight > screenHeight * 0.95) initialHeight = Math.round(screenHeight * 0.95);

    // Check if the saved window position is valid on any currently connected display
    const allDisplays = screen.getAllDisplays();
    let foundOnActiveDisplay = false;
    if (x !== undefined && y !== undefined) {
      for (const display of allDisplays) {
        const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.bounds;
        // Check if a significant portion of the window is within this display's bounds
        // (e.g., top-left corner or center of the window)
        if (x + initialWidth * 0.1 > displayX && x < displayX + displayWidth - initialWidth * 0.1 &&
            y + initialHeight * 0.1 > displayY && y < displayY + displayHeight - initialHeight * 0.1) {
          foundOnActiveDisplay = true;
          break;
        }
      }
    }

    if (!foundOnActiveDisplay) {
      // If the saved position is off-screen or undefined, center it on the primary display
      logger.debug('Window position not found on active display, centering.');
      x = Math.max(0, Math.round((screenWidth - initialWidth) / 2));
      y = Math.max(0, Math.round((screenHeight - initialHeight) / 2));
    }
    // --- End of screen position logic ---


    mainWindow = new BrowserWindow({ // Assign to the global mainWindow
      width: initialWidth,
      height: initialHeight,
      x: x, // Apply loaded X position
      y: y, // Apply loaded Y position
      minWidth: 800,
      minHeight: 600,
      fullscreen: windowState.isFullScreen, // Apply loaded fullscreen state
      fullscreenable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        devTools: !app.isPackaged // Disable DevTools in production
      },
    });

    // If not in fullscreen, check if it was maximized and apply it after creation
    if (!windowState.isFullScreen && windowState.isMaximized) {
      mainWindow.maximize();
    }

    // Load the React app (from its build output)
    const startUrl = app.isPackaged
      ? `file://${path.join(__dirname, 'frontend/dist/index.html')}`
      : 'http://localhost:5173';

    mainWindow.loadURL(startUrl)
      .then(() => {
        logger.debug(`Window loaded successfully: ${startUrl}`);
        // Open the DevTools only in development
        if (!app.isPackaged) {
          mainWindow.webContents.openDevTools();
        }
      })
      .catch(error => {
        logger.error({ url: startUrl, error: error.message, stack: error.stack }, 'Failed to load URL');
        // If URL loading fails, also quit the app
        dialog.showErrorBox('Application Error', `Failed to load the application. Please ensure the development server is running or the app is correctly packaged.\n\nError: ${error.message}`);
        app.quit();
      });

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
      mainWindow = null; // Dereference the window object to allow garbage collection
      logger.debug('Main window closed, dereferenced.');
    });

    // --- Add event listeners for the mainWindow to save state ---
    // Save bounds (position and size) when window moves or resizes, but not if maximized/fullscreen
    const saveBoundsDebounced = debounce(() => {
      // Only save position/size if not minimized, maximized, or fullscreen
      if (!mainWindow.isMinimized() && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
        const bounds = mainWindow.getBounds();
        preferencesStore.set('windowState.width', bounds.width);
        preferencesStore.set('windowState.height', bounds.height);
        preferencesStore.set('windowState.x', bounds.x);
        preferencesStore.set('windowState.y', bounds.y);
        logger.debug({ bounds }, 'Saved window bounds');
      }
    }, 500); // Debounce by 500ms

    mainWindow.on('resize', saveBoundsDebounced);
    mainWindow.on('move', saveBoundsDebounced);

    // Save maximized state
    mainWindow.on('maximize', () => {
      preferencesStore.set('windowState.isMaximized', true);
      preferencesStore.set('windowState.isFullScreen', false); // Cannot be both
      logger.debug('Window maximized, state saved.');
    });
    mainWindow.on('unmaximize', () => {
      preferencesStore.set('windowState.isMaximized', false);
      // When unmaximized, save current non-maximized bounds immediately
      const bounds = mainWindow.getBounds();
      preferencesStore.set('windowState.width', bounds.width);
      preferencesStore.set('windowState.height', bounds.height);
      preferencesStore.set('windowState.x', bounds.x);
      preferencesStore.set('windowState.y', bounds.y);
      logger.debug({ bounds }, 'Window unmaximized, state saved and bounds updated.');
    });

    // Save fullscreen state
    mainWindow.on('enter-full-screen', () => {
      preferencesStore.set('windowState.isFullScreen', true);
      preferencesStore.set('windowState.isMaximized', false); // Cannot be both
      logger.info('Window entered full screen, state saved.');
    });
    mainWindow.on('leave-full-screen', () => {
      preferencesStore.set('windowState.isFullScreen', false);
      // When leaving fullscreen, save current non-fullscreen bounds
      const bounds = mainWindow.getBounds();
      preferencesStore.set('windowState.width', bounds.width);
      preferencesStore.set('windowState.height', bounds.height);
      preferencesStore.set('windowState.x', bounds.x);
      preferencesStore.set('windowState.y', bounds.y);
      logger.info({ bounds }, 'Window left full screen, state saved and bounds updated.');
    });

    // On close, ensure final state is saved (especially if closed from maximized/fullscreen)
    mainWindow.on('close', () => {
        // Only save state if not minimized (bounds are unreliable when minimized)
        if (mainWindow && !mainWindow.isMinimized()) {
            const bounds = mainWindow.getBounds();
            preferencesStore.set('windowState', {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                isMaximized: mainWindow.isMaximized(),
                isFullScreen: mainWindow.isFullScreen(),
            });
            logger.info('Window closing, final state saved.');
        } else if (mainWindow && mainWindow.isMinimized()) {
            // If minimized, just save the maximized/fullscreen status if it was active
            // and don't touch the size/position which would be from before minimization.
            preferencesStore.set('windowState.isMaximized', mainWindow.isMaximized());
            preferencesStore.set('windowState.isFullScreen', mainWindow.isFullScreen());
            logger.info('Window closing from minimized state, only maximized/fullscreen status updated.');
        }
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Error creating BrowserWindow');
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
  // Initialize the backend with the connectionsStore *after* app is ready
  // Pass the connectionsStore instance to the backend's initialize function
  backend = require('./backend/dist/index').initialize(connectionsStore);
  if (!backend) {
    logger.error('Backend initialization failed or returned undefined.');
    dialog.showErrorBox('Application Error', 'Failed to initialize application backend.');
    app.quit();
    return;
  }
  logger.debug('Backend module initialized with connections store.');

  createApplicationMenu();
  createWindow();
}).catch(error => {
  logger.error({ error: error.message, stack: error.stack }, 'Electron app failed to become ready');
  // Ensure app quits if it can't even become ready
  dialog.showErrorBox('Application Startup Error', `Electron failed to initialize correctly. The application cannot start.\n\nError: ${error.message}`);
  app.quit();
});

// Quit when all windows are closed.
// This will now quit on macOS as well, which is often the desired behavior for cross-platform apps.
app.on('window-all-closed', () => {
  logger.info('All windows closed, quitting application.');
  app.quit();
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    logger.info('App activated with no open windows, creating new window.');
    createWindow();
  }
});

// Catch unhandled exceptions in the main process
process.on('uncaughtException', (error) => {
  logger.error({ error: error.message, stack: error.stack }, 'Uncaught Exception in Main Process');
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
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (getConnections)');
    throw error;
  }
});

ipcMain.handle('connections:addConnection', async (event, newConnection) => {
  try {
    return await backend.addConnection(newConnection);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (addConnection)');
    throw error;
  }
});

ipcMain.handle('connections:updateConnection', async (event, id, updatedConnection) => {
  try {
    return await backend.updateConnection(id, updatedConnection);
  }
  catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (updateConnection)');
    throw error;
  }
});

ipcMain.handle('connections:deleteConnection', async (event, id) => {
  try {
    return await backend.deleteConnection(id);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (deleteConnection)');
    throw error;
  }
});

// MongoDB Connection
ipcMain.handle('mongo:connect', async (event, connectionId, attemptId) => {
  try {
    return await backend.connectToMongo(connectionId, attemptId);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (mongo:connect)');
    throw error;
  }
});

ipcMain.handle('mongo:disconnect', async () => {
  try {
    return await backend.disconnectFromMongo();
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (mongo:disconnect)');
    throw error;
  }
});

ipcMain.handle('mongo:cancelConnection', async (event, attemptId) => {
  try {
    return await backend.cancelConnectionAttempt(attemptId);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (mongo:cancelConnection)');
    throw error;
  }
});

// Database Browse
ipcMain.handle('database:getCollections', async () => {
  try {
    return await backend.getDatabaseCollections();
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (database:getCollections)');
    throw error;
  }
});

ipcMain.handle('database:getDocuments', async (event, collectionName, limit, skip, params) => {
  try {
    return await backend.getCollectionDocuments(collectionName, limit, skip, params);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (database:getDocuments)');
    throw error;
  }
});

ipcMain.handle('database:exportDocuments', async (event, collectionName, params) => {
  try {
    return await backend.exportCollectionDocuments(collectionName, params);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'IPC error (database:exportDocuments)');
    throw error;
  }
});

// IPC handler for saving files
ipcMain.handle('file:save', async (event, defaultFilename, sourceFilePath) => {
  try {
    // 1. Show the save dialog to get the destination path from the user
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultFilename, // Suggests a filename based on content type
      filters: [
        { name: 'JSON Lines', extensions: ['jsonl'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      logger.info('File save dialog cancelled or no path selected.');
      // Return a structured object with success: false and an error message for frontend
      return { success: false, filePath: undefined, error: 'User cancelled file save.' };
    }

    // 2. Perform the move (rename) operation
    // fsPromises.rename will move the file from sourceFilePath to filePath
    // If filePath already exists, it will be overwritten.
    await fsPromises.rename(sourceFilePath, filePath); // Corrected to use fsPromises

    logger.info(`File moved successfully from temp location to: ${filePath}`);
    return { success: true, filePath: filePath };

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, sourceFilePath, defaultFilename }, 'IPC error (file:save) during file move');
    // It's good practice to provide a more descriptive error message to the frontend
    return { success: false, filePath: undefined, error: `Failed to save file: ${error.message || 'Unknown error during file save.'}` };
  } finally {
      // Ensure that if the move operation failed (e.g., due to permissions),
      // the original temporary file is still removed to prevent accumulation.
      // This makes the cleanup more robust.
      try {
          if (sourceFilePath) {
              // Check if the source file still exists (it shouldn't if rename succeeded)
              await fsPromises.unlink(sourceFilePath);
              logger.info(`Cleaned up residual temporary file: ${sourceFilePath}`);
          }
      } catch (cleanupError) {
          logger.warn({ cleanupError }, `Failed to clean up temporary file: ${sourceFilePath}`);
      }
  }
});

// Theme Management IPC Handlers
ipcMain.handle('theme:savePreference', async (event, theme) => {
  try {
    preferencesStore.set('theme', theme);
    logger.debug(`Theme preference saved: ${theme}`);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, theme }, 'Failed to save theme preference');
    throw error;
  }
});

ipcMain.handle('theme:loadPreference', async () => {
  try {
    const theme = preferencesStore.get('theme');
    logger.debug(`Theme preference loaded: ${theme}`);
    return theme;
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to load theme preference');
    return null; // Return null or default in case of error
  }
});

ipcMain.handle('theme:saveSystemPreference', async (event, isActive) => {
  try {
    preferencesStore.set('isSystemThemeActive', isActive);
    logger.debug(`System theme active status saved: ${isActive}`);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, isActive }, 'Failed to save system theme active status');
    throw error;
  }
});

ipcMain.handle('theme:loadSystemPreference', async () => {
  try {
    const isActive = preferencesStore.get('isSystemThemeActive');
    logger.debug(`System theme active status loaded: ${isActive}`);
    return isActive;
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to load system theme active status');
    return null; // Return null or default in case of error
  }
});

// --- AI Query Generation IPC Handlers ---
ipcMain.handle('ai:getCollectionSchemaAndSampleDocuments', async (event, collectionName, sampleCount) => {
  try {
    // Assuming backend.getCollectionSchemaAndSampleDocuments is now available
    return await backend.getCollectionSchemaAndSampleDocuments(collectionName, sampleCount);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, collectionName, sampleCount }, 'IPC error (ai:getCollectionSchemaAndSampleDocuments)');
    throw error;
  }
});

ipcMain.handle('ai:generateQuery', async (event, userPrompt, collectionName, schemaSummary, sampleDocuments) => {
  try {
    // Assuming backend.generateAIQuery is now available
    return await backend.generateAIQuery(userPrompt, collectionName, schemaSummary, sampleDocuments);
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, userPrompt, collectionName }, 'IPC error (ai:generateQuery)');
    throw error;
  }
});
