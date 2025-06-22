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

  // Other utilities if needed (e.g., for showing dialogs, file system access)
  saveFile: (filename, content) => ipcRenderer.invoke('file:save', filename, content),
});
