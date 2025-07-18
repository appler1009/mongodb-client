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
  cancelConnectionAttempt: (attemptId) => ipcRenderer.invoke('mongo:cancelConnection', attemptId),

  // Database Browse
  getDatabaseCollections: () => ipcRenderer.invoke('database:getCollections'),
  getCollectionDocuments: (collectionName, limit, skip, params) => ipcRenderer.invoke('database:getDocuments', collectionName, limit, skip, params),
  exportCollectionDocuments: (collectionName, params) => ipcRenderer.invoke('database:exportDocuments', collectionName, params),
  getCollectionDocumentCount: (collectionName) => ipcRenderer.invoke('database:getDocumentCount', collectionName),

  // File system interaction
  saveFile: (defaultFilename, sourceFilePath) => ipcRenderer.invoke('file:save', defaultFilename, sourceFilePath),

  // --- Theme Management IPC calls ---
  saveThemePreference: (theme) => ipcRenderer.invoke('theme:savePreference', theme),
  loadThemePreference: () => ipcRenderer.invoke('theme:loadPreference'),
  saveSystemThemePreference: (isActive) => ipcRenderer.invoke('theme:saveSystemPreference', isActive),
  loadSystemThemePreference: () => ipcRenderer.invoke('theme:loadSystemPreference'),

  // --- AI Query Generation IPC calls ---
  getCollectionSchemaAndSampleDocuments: (collectionName, sampleCount) => ipcRenderer.invoke('ai:getCollectionSchemaAndSampleDocuments', collectionName, sampleCount),
  generateAIQuery: (userPrompt, collectionName, schemaSummary, sampleDocuments) => ipcRenderer.invoke('ai:generateQuery', userPrompt, collectionName, schemaSummary, sampleDocuments),
});
