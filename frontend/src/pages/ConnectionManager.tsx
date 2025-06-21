// frontend/src/pages/ConnectionManager.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react';
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
import { AppHeader } from '../components/AppHeader';

// Add props for theme from App.tsx
interface ConnectionManagerProps {
  toggleTheme: () => void;
  currentTheme: 'light' | 'dark';
}

// Initial state for a new connection form
const initialNewConnection: Omit<ConnectionConfig, 'id'> = {
  name: '',
  uri: '',
  database: '',
  username: '',
  password: '',
};

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({ toggleTheme, currentTheme }) => {
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

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [documentsPerPage, setDocumentsPerPage] = useState<number>(25); // Default items per page
  const [totalDocuments, setTotalDocuments] = useState<number>(0);
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);


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
      setTotalDocuments(0);
      setCurrentPage(1);
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
      // Reset documents and total documents when collections are re-fetched
      setDocuments([]);
      setTotalDocuments(0);
      setCurrentPage(1);
    } catch (err: any) {
      setError(`Failed to fetch collections: ${err.message}`);
    } finally {
      setCollectionsLoading(false);
    }
  }, [currentStatus?.database]);

  // Fetch documents for the currently selected collection
  const fetchDocuments = useCallback(async () => {
    if (!selectedCollection) {
      setDocuments([]);
      setTotalDocuments(0);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * documentsPerPage;
      const response = await getCollectionDocuments(selectedCollection, documentsPerPage, skip);
      setDocuments(response.documents);
      setTotalDocuments(response.totalDocuments);
    } catch (err: any) {
      setError(`Failed to fetch documents for ${selectedCollection}: ${err.message}`);
      setDocuments([]);
      setTotalDocuments(0);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection, currentPage, documentsPerPage]);


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
      setTotalDocuments(0);
      setCurrentPage(1);
    }
  }, [currentStatus?.database, fetchCollections]);

  // Effect to trigger fetching documents when selectedCollection or pagination state changes
  useEffect(() => {
    fetchDocuments();
  }, [selectedCollection, currentPage, documentsPerPage, fetchDocuments]);


  // --- Form Handlers ---
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
          // Clear Browse state if active connection is deleted
          setCollections([]);
          setSelectedCollection(null);
          setDocuments([]);
          setTotalDocuments(0);
          setCurrentPage(1);
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
      alert('Connected to MongoDB!');
      setDocuments([]);
      setTotalDocuments(0);
      setCurrentPage(1);
    } catch (err: any) {
      setCurrentStatus(null);
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
      setTotalDocuments(0);
      setCurrentPage(1);
      alert('Disconnected from MongoDB!');
    } catch (err: any) {
      setError(`Failed to disconnect: ${err.message}`);
    }
  };

  // --- Pagination Handlers ---
  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setCurrentPage(1);
    setDocuments([]);
    setTotalDocuments(0);
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const handleDocumentsPerPageChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setDocumentsPerPage(parseInt(e.target.value, 10));
    setCurrentPage(1);
  };


  // --- Rendering ---
  if (loading) {
    return <div className="loading">Loading connections...</div>;
  }

  return (
    <div className="connection-manager">
      {/* Render the AppHeader component */}
      <AppHeader
        backendHealth={backendHealth}
        currentStatus={currentStatus}
        toggleTheme={toggleTheme}
        currentTheme={currentTheme}
      />

      {error && <div className="error-message">{error}</div>}

      {/* Conditionally render connection status/manager content */}
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
                  onSelectCollection={handleCollectionSelect}
                />
              )}
            </div>
            <div className="documents-pane">
              {/* Pagination Controls */}
              {selectedCollection && (
                <div className="pagination-controls">
                  <span>
                    Documents per page:
                    <select value={documentsPerPage} onChange={handleDocumentsPerPageChange} disabled={documentsLoading}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </span>
                  <span>
                    Page {currentPage} of {totalPages} (Total: {totalDocuments} documents)
                  </span>
                  <button onClick={handlePrevPage} disabled={currentPage === 1 || documentsLoading}>Previous</button>
                  <button onClick={handleNextPage} disabled={currentPage === totalPages || documentsLoading}>Next</button>
                </div>
              )}

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
          {/* Original connection manager content when not connected */}
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
