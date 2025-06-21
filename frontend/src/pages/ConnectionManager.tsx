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
  exportCollectionDocuments,
} from '../api/backend';

// imports for components
import { CollectionBrowser } from '../components/CollectionBrowser';
import { DocumentViewer } from '../components/DocumentViewer';
import { AppHeader } from '../components/AppHeader';

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
  const [backendStatus, setBackendStatus] = useState<{ status: string; message: string; } | null>(null);
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

  // --- Query Editor State ---
  const [queryText, setQueryText] = useState<string>('{}'); // Default to an empty object for "find all"
  const [parsedQuery, setParsedQuery] = useState<object>({}); // The actual parsed query object to be used for fetching
  const [queryError, setQueryError] = useState<string | null>(null);

  // --- Notification State ---
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);


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
      setBackendStatus(status);
    } catch (err: any) {
      setBackendStatus({ status: 'error', message: `Down (${err.message})` });
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
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);
      return;
    }
    setCollectionsLoading(true);
    setError(null);
    try {
      const fetchedCollections = await getDatabaseCollections();
      fetchedCollections.sort((a, b) => a.name.localeCompare(b.name));
      setCollections(fetchedCollections);
      if (fetchedCollections.length > 0) {
        setSelectedCollection(fetchedCollections[0].name);
      } else {
        setSelectedCollection(null);
      }
      setDocuments([]);
      setTotalDocuments(0);
      setCurrentPage(1);
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);
    } catch (err: any) {
      setError(`Failed to fetch collections: ${err.message}`);
    } finally {
      setCollectionsLoading(false);
    }
  }, [currentStatus?.database]);

  // Fetch documents for the currently selected collection with the current parsedQuery
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
      const response = await getCollectionDocuments(selectedCollection, documentsPerPage, skip, parsedQuery);
      setDocuments(response.documents);
      setTotalDocuments(response.totalDocuments);
    } catch (err: any) {
      setError(`Failed to fetch documents for ${selectedCollection}: ${err.message}`);
      setDocuments([]);
      setTotalDocuments(0);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection, currentPage, documentsPerPage, parsedQuery]);

  // --- Initial Loads and Health Check ---
  useEffect(() => {
    fetchBackendHealth();
    fetchConnections();
    const healthInterval = setInterval(fetchBackendHealth, 10000);
    return () => clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    if (currentStatus?.database) {
      fetchCollections();
    } else {
      setCollections([]);
      setSelectedCollection(null);
      setDocuments([]);
      setTotalDocuments(0);
      setCurrentPage(1);
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);
    }
  }, [currentStatus?.database, fetchCollections]);

  useEffect(() => {
    fetchDocuments();
  }, [selectedCollection, currentPage, documentsPerPage, parsedQuery, fetchDocuments]);

  useEffect(() => {
    if (notificationMessage) {
      const timer = setTimeout(() => {
        setNotificationMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationMessage]);


  // --- Form Handlers (Existing) ---
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
      setNewConnection(initialNewConnection);
      setNotificationMessage('Connection added successfully!');
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
      setEditingConnection(null);
      setNotificationMessage('Connection updated successfully!');
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
          setCurrentStatus(null);
          setCollections([]);
          setSelectedCollection(null);
          setDocuments([]);
          setTotalDocuments(0);
          setCurrentPage(1);
          setQueryText('{}');
          setParsedQuery({});
          setQueryError(null);
        }
        setNotificationMessage('Connection deleted successfully!');
      } catch (err: any) {
        setError(`Failed to delete connection: ${err.message}`);
      }
    }
  };

  const handleConnect = async (id: string) => {
    setError(null);
    try {
      const status = await connectToMongo(id);
      setCurrentStatus(status);
      setNotificationMessage('Connected to MongoDB!');
      setDocuments([]);
      setTotalDocuments(0);
      setCurrentPage(1);
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);
    } catch (err: any) {
      setCurrentStatus(null);
      setError(`Failed to connect: ${err.message}`);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnectFromMongo();
      setCurrentStatus(null);
      setCollections([]);
      setSelectedCollection(null);
      setDocuments([]);
      setTotalDocuments(0);
      setCurrentPage(1);
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);
      setNotificationMessage('Disconnected from MongoDB!');
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
    setQueryText('{}');
    setParsedQuery({});
    setQueryError(null);
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

  // --- Query Editor Handlers ---
  const handleQueryTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setQueryText(e.target.value);
    setQueryError(null);
  };

  const handleRunQuery = () => {
    try {
      const newQuery = JSON.parse(queryText);
      setParsedQuery(newQuery); // This will trigger fetchDocuments via useEffect
      setCurrentPage(1); // Reset to first page for new query
      setQueryError(null);
    } catch (e) {
      setQueryError('Invalid JSON query. Please ensure it\'s a valid JSON object (e.g., {"field": "value"}).');
    }
  };

  // --- Export Handler ---
  const handleExport = async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection to export.');
      return;
    }
    setError(null);
    setDocumentsLoading(true); // Use this flag to indicate an ongoing operation
    try {
      // Use the current parsedQuery for the export operation
      await exportCollectionDocuments(selectedCollection, parsedQuery);
      setNotificationMessage('Export initiated successfully!');
    } catch (err: any) {
      setError(`Failed to export documents: ${err.message}`);
    } finally {
      setDocumentsLoading(false); // Reset loading flag
    }
  };


  // --- Rendering ---
  if (loading) {
    return <div className="loading">Loading connections...</div>;
  }

  return (
    <div className="connection-manager">
      <AppHeader
        backendStatus={backendStatus}
        currentStatus={currentStatus}
        onDisconnect={handleDisconnect}
      />

      {error && <div className="error-message">{error}</div>}
      {notificationMessage && <div className="notification-message">{notificationMessage}</div>}

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
            <div className="document-panel-right">
              {queryError && <div className="query-error-message">{queryError}</div>}

              <div className="query-editor-container">
                <h4>Find Query (JSON)</h4>
                <textarea
                  className="query-editor"
                  value={queryText}
                  onChange={handleQueryTextChange}
                  placeholder='e.g., {"name": "Alice", "age": {"$gt": 30}}'
                  rows={5}
                  disabled={documentsLoading}
                />
                <div className="query-controls">
                  {/* --- Export Button --- */}
                  <button
                    onClick={handleExport}
                    disabled={!selectedCollection || documentsLoading} // Disable if no collection selected or any loading
                    className="export-button" // New class for styling
                    title="Export all documents matching the current query to a JSON Lines file"
                  >
                    Export
                  </button>
                  <button onClick={handleRunQuery} disabled={documentsLoading}>
                    Run Query
                  </button>
                </div>
              </div>

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

              {documentsLoading && !notificationMessage ? (
                <p>Loading documents...</p>
              ) : (
                <DocumentViewer
                  collectionName={selectedCollection}
                  documents={documents}
                  currentPage={currentPage}
                  documentsPerPage={documentsPerPage}
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
                    <form onSubmit={handleUpdateConnection} className="edit-form">
                      <input type="text" name="name" value={editingConnection.name} onChange={handleEditConnectionChange} required />
                      <input type="text" name="uri" value={editingConnection.uri} onChange={handleEditConnectionChange} required />
                      <input type="text" name="database" value={editingConnection.database} onChange={handleEditConnectionChange} required />
                      <input type="text" name="username" value={editingConnection.username || ''} onChange={handleEditConnectionChange} />
                      <input type="password" name="password" value={editingConnection.password || ''} onChange={handleEditConnectionChange} />
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setEditingConnection(null)}>Cancel</button>
                    </form>
                  ) : (
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
