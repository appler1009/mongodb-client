// my-mongo-client/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Connection Management
  getConnections: () => ipcRenderer.invoke('connections:getConnections'),
  addConnection: (newConnection) => ipcRenderer.invoke('connections:addConnection', newConnection),
  updateConnection: (id, updatedConnection) => ipcRenderer.invoke('connections:updateConnection', id, updatedConnection),
  deleteConnection: (id) => ipcRenderer.invoke('connections:deleteConnection', id),

  // MongoDB Connection
  connectToMongo: (connectionId) => ipcRenderer.invoke('mongo:connect', connectionId),
  disconnectFromMongo: () => ipcRenderer.invoke('mongo:disconnect'),

  // Database Browse
  getDatabaseCollections: () => ipcRenderer.invoke('database:getCollections'),
  getCollectionDocuments: (collectionName, limit, skip, query) => ipcRenderer.invoke('database:getDocuments', collectionName, limit, skip, query),
  exportCollectionDocuments: (collectionName, query) => ipcRenderer.invoke('database:exportDocuments', collectionName, query),

  // File system interaction
  saveFile: (defaultFilename, sourceFilePath) => ipcRenderer.invoke('file:save', defaultFilename, sourceFilePath),

  // --- Theme Management IPC calls ---
  // These will be handled by ipcMain in main.js to save/load user preferences
  saveThemePreference: (theme) => ipcRenderer.invoke('theme:savePreference', theme),
  loadThemePreference: () => ipcRenderer.invoke('theme:loadPreference'),
  saveSystemThemePreference: (isActive) => ipcRenderer.invoke('theme:saveSystemPreference', isActive),
  loadSystemThemePreference: () => ipcRenderer.invoke('theme:loadSystemPreference'),
});
