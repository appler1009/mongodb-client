// frontend/src/pages/ConnectionManager.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ConnectionConfig, ConnectionStatus, CollectionInfo, Document } from '../types';
import {
  getConnections,
  addConnection,
  updateConnection,
  deleteConnection,
  connectToMongo,
  disconnectFromMongo,
  getHealthStatus,
  getDatabaseCollections,
  getCollectionDocuments,
} from '../api/backend';

// imports for components
import { CollectionBrowser } from '../components/CollectionBrowser';
import { DocumentViewer } from '../components/DocumentViewer';


// Initial state for a new connection form
const initialNewConnection: Omit<ConnectionConfig, 'id'> = {
  name: '',
  uri: '',
  database: '',
  username: '',
  password: '',
};

export const ConnectionManager: React.FC = () => {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [newConnection, setNewConnection] = useState<Omit<ConnectionConfig, 'id'>>(initialNewConnection);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null);
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus | null>(null);
  const [backendHealth, setBackendHealth] = useState<string>('Checking...');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState<boolean>(false);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);


  // --- Data Fetching ---
  const fetchConnections = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (err: any) {
      setError(`Failed to fetch connections: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackendHealth = async () => {
    try {
      const status = await getHealthStatus();
      setBackendHealth(`Backend: ${status.status} (${status.message})`);
    } catch (err: any) {
      setBackendHealth(`Backend: Down (${err.message})`);
    }
  };

  // Fetch collections for the currently active database
  const fetchCollections = useCallback(async () => {
    if (!currentStatus?.database) {
      setCollections([]);
      setSelectedCollection(null);
      setDocuments([]);
      return;
    }
    setCollectionsLoading(true);
    setError(null);
    try {
      const fetchedCollections = await getDatabaseCollections();
      setCollections(fetchedCollections);
      // Automatically select the first collection if available
      if (fetchedCollections.length > 0) {
        setSelectedCollection(fetchedCollections[0].name);
      } else {
        setSelectedCollection(null);
      }
    } catch (err: any) {
      setError(`Failed to fetch collections: ${err.message}`);
    } finally {
      setCollectionsLoading(false);
    }
  }, [currentStatus?.database]); // Re-run when database changes

  // Fetch documents for the currently selected collection
  const fetchDocuments = useCallback(async () => {
    if (!selectedCollection) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
    try {
      // You can adjust the limit here, e.g., allow user input
      const fetchedDocuments = await getCollectionDocuments(selectedCollection, 50);
      setDocuments(fetchedDocuments);
    } catch (err: any) {
      setError(`Failed to fetch documents for ${selectedCollection}: ${err.message}`);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection]); // Re-run when selectedCollection changes


  useEffect(() => {
    fetchBackendHealth(); // Check health on initial load
    fetchConnections(); // Fetch connections on initial load
    const healthInterval = setInterval(fetchBackendHealth, 10000); // Every 10 seconds
    return () => clearInterval(healthInterval);
  }, []);

  // Effect to trigger fetching collections when currentStatus.database becomes available
  useEffect(() => {
    if (currentStatus?.database) {
      fetchCollections();
    } else {
      // Clear Browse state if disconnected
      setCollections([]);
      setSelectedCollection(null);
      setDocuments([]);
    }
  }, [currentStatus?.database, fetchCollections]); // Add fetchCollections to dependency array

  // Effect to trigger fetching documents when selectedCollection changes
  useEffect(() => {
    fetchDocuments();
  }, [selectedCollection, fetchDocuments]); // Add fetchDocuments to dependency array


  // --- Form Handlers (no change) ---
  const handleNewConnectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewConnection((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditConnectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditingConnection((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const added = await addConnection(newConnection);
      setConnections((prev) => [...prev, added]);
      setNewConnection(initialNewConnection); // Reset form
      alert('Connection added successfully!');
    } catch (err: any) {
      setError(`Failed to add connection: ${err.message}`);
    }
  };

  const handleUpdateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!editingConnection) return;
    try {
      const updated = await updateConnection(editingConnection.id, editingConnection);
      setConnections((prev) =>
        prev.map((conn) => (conn.id === updated.id ? updated : conn))
      );
      setEditingConnection(null); // Exit edit mode
      alert('Connection updated successfully!');
    } catch (err: any) {
      setError(`Failed to update connection: ${err.message}`);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    setError(null);
    if (window.confirm('Are you sure you want to delete this connection?')) {
      try {
        await deleteConnection(id);
        setConnections((prev) => prev.filter((conn) => conn.id !== id));
        if (currentStatus?.connectionId === id) {
          setCurrentStatus(null); // Clear status if deleted active connection
          // NEW: Clear Browse state if active connection is deleted
          setCollections([]);
          setSelectedCollection(null);
          setDocuments([]);
        }
        alert('Connection deleted successfully!');
      } catch (err: any) {
        setError(`Failed to delete connection: ${err.message}`);
      }
    }
  };

  // --- MongoDB Connection/Disconnection ---
  const handleConnect = async (id: string) => {
    setError(null);
    try {
      const status = await connectToMongo(id);
      setCurrentStatus(status);
      // No need to explicitly call fetchCollections here, the useEffect will trigger it
      alert('Connected to MongoDB!');
    } catch (err: any) {
      setCurrentStatus(null); // Clear status on failed connect
      setError(`Failed to connect: ${err.message}`);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnectFromMongo();
      setCurrentStatus(null); // Clear status
      // Clear Browse state on disconnect
      setCollections([]);
      setSelectedCollection(null);
      setDocuments([]);
      alert('Disconnected from MongoDB!');
    } catch (err: any) {
      setError(`Failed to disconnect: ${err.message}`);
    }
  };

  // --- Rendering ---
  if (loading) {
    return <div className="loading">Loading connections...</div>;
  }

  return (
    <div className="connection-manager">
      <h2>MongoDB Client</h2>

      {error && <div className="error-message">{error}</div>}
      <div className="health-status">
        Backend Health: <span style={{ color: backendHealth.includes('Up') ? 'green' : 'red' }}>{backendHealth}</span>
      </div>

      <div className="connection-status">
        {currentStatus ? (
          <div>
            <h3>Current Connection:</h3>
            <p>Status: {currentStatus.message}</p>
            {currentStatus.connectionId && <p>ID: {currentStatus.connectionId}</p>}
            {currentStatus.database && <p>Database: <strong>{currentStatus.database}</strong></p>}
            <button onClick={handleDisconnect}>Disconnect</button>
          </div>
        ) : (
          <h3>Not Connected to any MongoDB instance.</h3>
        )}
      </div>

      {/* Conditional rendering for Browse section */}
      {currentStatus?.database ? (
        <div className="database-browser-section">
          <h3>Database Browser: {currentStatus.database}</h3>
          <div className="browser-content">
            <div className="collections-pane">
              {collectionsLoading ? (
                <p>Loading collections...</p>
              ) : (
                <CollectionBrowser
                  collections={collections}
                  selectedCollection={selectedCollection}
                  onSelectCollection={setSelectedCollection}
                />
              )}
            </div>
            <div className="documents-pane">
              {documentsLoading ? (
                <p>Loading documents...</p>
              ) : (
                <DocumentViewer
                  collectionName={selectedCollection}
                  documents={documents}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <h3>Add New Connection</h3>
          <form onSubmit={handleAddConnection} className="connection-form">
            <input
              type="text"
              name="name"
              placeholder="Connection Name"
              value={newConnection.name}
              onChange={handleNewConnectionChange}
              required
            />
            <input
              type="text"
              name="uri"
              placeholder="MongoDB URI (e.g., mongodb://user:pass@host:port/)"
              value={newConnection.uri}
              onChange={handleNewConnectionChange}
              required
            />
            <input
              type="text"
              name="database"
              placeholder="Default Database Name"
              value={newConnection.database}
              onChange={handleNewConnectionChange}
              required
            />
            <input
              type="text"
              name="username"
              placeholder="Username (optional)"
              value={newConnection.username || ''}
              onChange={handleNewConnectionChange}
            />
            <input
              type="password"
              name="password"
              placeholder="Password (optional)"
              value={newConnection.password || ''}
              onChange={handleNewConnectionChange}
            />
            <button type="submit">Add Connection</button>
          </form>

          <h3>Saved Connections</h3>
          {connections.length === 0 ? (
            <p>No connections saved yet.</p>
          ) : (
            <ul className="connection-list">
              {connections.map((conn) => (
                <li key={conn.id} className="connection-item">
                  {editingConnection && editingConnection.id === conn.id ? (
                    // Edit Form
                    <form onSubmit={handleUpdateConnection} className="edit-form">
                      <input
                        type="text"
                        name="name"
                        value={editingConnection.name}
                        onChange={handleEditConnectionChange}
                        required
                      />
                      <input
                        type="text"
                        name="uri"
                        value={editingConnection.uri}
                        onChange={handleEditConnectionChange}
                        required
                      />
                      <input
                        type="text"
                        name="database"
                        value={editingConnection.database}
                        onChange={handleEditConnectionChange}
                        required
                      />
                      <input
                        type="text"
                        name="username"
                        value={editingConnection.username || ''}
                        onChange={handleEditConnectionChange}
                      />
                      <input
                        type="password"
                        name="password"
                        value={editingConnection.password || ''}
                        onChange={handleEditConnectionChange}
                      />
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setEditingConnection(null)}>Cancel</button>
                    </form>
                  ) : (
                    // Display Mode
                    <div className="connection-details">
                      <h4>{conn.name}</h4>
                      <p>URI: {conn.uri}</p>
                      <p>Database: {conn.database}</p>
                      <div className="connection-actions">
                        <button onClick={() => handleConnect(conn.id)} disabled={currentStatus !== null}>
                          Connect
                        </button>
                        <button onClick={() => setEditingConnection(conn)}>Edit</button>
                        <button onClick={() => handleDeleteConnection(conn.id)}>Delete</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
