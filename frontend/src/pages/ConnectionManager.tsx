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
};

export const ConnectionManager: React.FC = () => {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [newConnection, setNewConnection] = useState<Omit<ConnectionConfig, 'id'>>(initialNewConnection);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null);
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus | null>(null);
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
  // totalDocuments is derived from selectedCollection's documentCount
  const totalDocuments = selectedCollection
    ? collections.find(c => c.name === selectedCollection)?.documentCount || 0
    : 0;
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);

  // --- Query Editor State ---
  const [queryText, setQueryText] = useState<string>('{}'); // Default to an empty object for "find all"
  const [parsedQuery, setParsedQuery] = useState<object>({}); // The actual parsed query object to be used for fetching
  const [queryError, setQueryError] = useState<string | null>(null);

  // --- Notification State ---
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // --- Helper function to reset collection/document related states ---
  const resetBrowserState = useCallback(() => {
    setCollections([]);
    setSelectedCollection(null);
    setDocuments([]);
    setCurrentPage(1);
    setQueryText('{}');
    setParsedQuery({});
    setQueryError(null);
  }, []);

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

  // Fetch collections for the currently active database
  const fetchCollections = useCallback(async () => {
    if (!currentStatus?.database) {
      resetBrowserState();
      return;
    }
    setCollectionsLoading(true);
    setError(null);
    try {
      const fetchedCollections = await getDatabaseCollections();
      fetchedCollections.sort((a, b) => a.name.localeCompare(b.name));

      setDocuments([]);
      setCurrentPage(1);
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);

      setCollections(fetchedCollections);

      if (fetchedCollections.length > 0) {
        setSelectedCollection(fetchedCollections[0].name);
      } else {
        setSelectedCollection(null);
      }

    } catch (err: any) {
      setError(`Failed to fetch collections: ${err.message}`);
      setCollections([]);
      setSelectedCollection(null);
      resetBrowserState();
    } finally {
      setCollectionsLoading(false);
    }
  }, [currentStatus?.database, resetBrowserState]);

  // Fetch documents for the currently selected collection with the current parsedQuery
  const fetchDocuments = useCallback(async () => {
    if (!selectedCollection) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * documentsPerPage;
      const response = await getCollectionDocuments(selectedCollection, documentsPerPage, skip, parsedQuery);
      setDocuments(response.documents);
    } catch (err: any) {
      setError(`Failed to fetch documents for ${selectedCollection}: ${err.message}`);
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection, currentPage, documentsPerPage, parsedQuery]);

  // --- Initial Loads ---
  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (currentStatus?.database) {
      fetchCollections();
    } else {
      resetBrowserState();
    }
  }, [currentStatus?.database, fetchCollections, resetBrowserState]);

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


  // --- Form Handlers ---
  // Generic handler for both input and textarea
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (e.target instanceof HTMLInputElement) {
        // If it's an input element, call the specific handler for new/editing
        if (name === "name" || name === "uri") { // Only these two fields
            setNewConnection((prev) => ({ ...prev, [name]: value }));
        }
    } else if (e.target instanceof HTMLTextAreaElement) {
        // If it's a textarea, specifically for 'uri'
        if (name === "uri") {
            setNewConnection((prev) => ({ ...prev, [name]: value }));
        }
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (e.target instanceof HTMLInputElement) {
        if (name === "name" || name === "uri") {
            setEditingConnection((prev) => (prev ? { ...prev, [name]: value } : null));
        }
    } else if (e.target instanceof HTMLTextAreaElement) {
        if (name === "uri") {
            setEditingConnection((prev) => (prev ? { ...prev, [name]: value } : null));
        }
    }
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
          resetBrowserState();
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
      setNotificationMessage(`Connected to ${status.database || 'MongoDB'}!`);
      // The useEffect for currentStatus.database will handle triggering fetchCollections
    } catch (err: any) {
      setCurrentStatus(null);
      setError(`Failed to connect: ${err.message}`);
      resetBrowserState(); // Ensure state is clean on connection failure
    }
  };

  const handleDisconnect = async () => {
    setError(null);

    let disconnectedDbName = '';
    if (currentStatus?.database) {
      disconnectedDbName = currentStatus.database;
    }

    try {
      await disconnectFromMongo();
      setCurrentStatus(null);
      resetBrowserState();
      setNotificationMessage(`Disconnected from ${disconnectedDbName || 'MongoDB'}!`);
    } catch (err: any) {
      setError(`Failed to disconnect from ${disconnectedDbName || 'MongoDB'}: ${err.message}`);
    }
  };

  // --- Pagination Handlers ---
  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    // Keep these specific resets as they're tied to collection selection
    setCurrentPage(1);
    setDocuments([]);
    setQueryText('{}');
    setParsedQuery({});
    setQueryError(null);
  };

  const handlePrevPage = () => {
    const newPage = Math.max(1, currentPage - 1);
    setCurrentPage(newPage);
  };

  const handleNextPage = () => {
    const newPage = Math.min(totalPages, currentPage + 1);
    setCurrentPage(newPage);
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
    } catch (e: any) {
      setQueryError('Invalid JSON query. Please ensure it\'s a valid JSON object (e.g., {"field": "value"}).');
    }
  };

  // --- Export Handler ---
  const handleExport = async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection to export.');
      return;
    }
    setError(null); // Clear any previous error
    setDocumentsLoading(true); // Indicate loading state for export operation
    try {
      const { success, filePath, error: exportError } = await exportCollectionDocuments(selectedCollection, parsedQuery);

      if (success && filePath) {
        setNotificationMessage(`Exported to: ${filePath}`);
      } else if (!success && exportError) {
        setNotificationMessage(`Export failed: ${exportError}`);
        setError(`Export failed: ${exportError}`);
      } else {
        setNotificationMessage('Export cancelled or failed.');
      }
    } catch (err: any) {
      setError(`An unexpected error occurred during export: ${err.message}`);
      setNotificationMessage(`An unexpected error occurred: ${err.message}`);
    } finally {
      setDocumentsLoading(false); // Always reset loading flag
    }
  };

  // --- Rendering ---
  if (loading) {
    return <div className="loading">Loading connections...</div>;
  }

  return (
    <div className="connection-manager">
      <AppHeader
        currentStatus={currentStatus}
        onDisconnect={handleDisconnect}
      />

      {error && <div className="error-message">{error}</div>}
      {notificationMessage && <div className="notification-message">{notificationMessage}</div>}

      {currentStatus?.database ? (
        // Connected View: Database Browser
        <div className="database-browser-section">
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
                  <button
                    onClick={handleExport}
                    disabled={!selectedCollection || documentsLoading}
                    className="export-button"
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
        // Disconnected View: Connection Management Forms
        <>
          <form onSubmit={handleAddConnection} className="connection-form">
            <h3>Add New Connection</h3>
            <input
              type="text"
              name="name"
              placeholder="Connection Name"
              value={newConnection.name}
              onChange={handleChange}
              required
            />
            <textarea
              name="uri"
              placeholder="MongoDB URI (e.g., mongodb://user:pass@host:port/database?replicaSet=mySet)"
              value={newConnection.uri}
              onChange={handleChange}
              rows={3}
              required
            />
            <button type="submit">Add Connection</button>
          </form>

          <h3>Saved Connections</h3>
          {connections.length === 0 ? (
            <ul className="connection-list">
              <li key="empty-connection-item" className="connection-item">
                <p>No connections saved yet.</p>
              </li>
            </ul>
          ) : (
            <ul className="connection-list">
              {connections.map((conn) => (
                <li key={conn.id} className="connection-item">
                  {editingConnection && editingConnection.id === conn.id ? (
                    <form onSubmit={handleUpdateConnection} className="edit-form">
                      <input type="text" name="name" value={editingConnection.name} onChange={handleEditChange} required />
                      <textarea
                        name="uri"
                        value={editingConnection.uri}
                        onChange={handleEditChange}
                        rows={3}
                        required
                      />
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setEditingConnection(null)}>Cancel</button>
                    </form>
                  ) : (
                    <div className="connection-details">
                      <h4>{conn.name}</h4>
                      <p>URI: {conn.uri}</p>
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
