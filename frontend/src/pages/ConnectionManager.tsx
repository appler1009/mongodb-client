// frontend/src/pages/ConnectionManager.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import type { ConnectionConfig, ConnectionStatus } from '../types';
import {
  getConnections,
  addConnection,
  updateConnection,
  deleteConnection,
} from '../api/backend';

import { Dialog } from '../components/Dialog';

// Define props for the refactored ConnectionManager
interface ConnectionManagerProps {
  currentStatus: ConnectionStatus | null;
  onConnect: (id: string) => Promise<void>; // Passed from HomePage
  setNotificationMessage: (message: string | null) => void; // Passed from HomePage
  setError: (message: string | null) => void; // Passed from HomePage
}

// Initial state for a new connection form
const initialNewConnection: Omit<ConnectionConfig, 'id'> = {
  name: '',
  uri: '',
};

// Refactored ConnectionManager component
export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  currentStatus,
  onConnect,
  setNotificationMessage,
  setError,
}) => {
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [newConnection, setNewConnection] = useState<Omit<ConnectionConfig, 'id'>>(initialNewConnection);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [showConfirmDeleteDialog, setShowConfirmDeleteDialog] = useState<boolean>(false);
  const [connectionToDeleteId, setConnectionToDeleteId] = useState<string | null>(null);

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

  // --- Initial Load of Connections ---
  useEffect(() => {
    fetchConnections();
  }, []); // Empty dependency array means run once on mount

  // --- Form Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewConnection((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  // Handler for delete confirmation dialog
  const confirmDeleteConnection = useCallback((id: string) => {
    setConnectionToDeleteId(id);
    setShowConfirmDeleteDialog(true);
  }, []);

  const handleDeleteConnection = useCallback(async () => {
    setShowConfirmDeleteDialog(false); // Close dialog
    setError(null); // This setError comes from props
    if (!connectionToDeleteId) return;

    try {
      await deleteConnection(connectionToDeleteId);
      setConnections((prev) => prev.filter((conn) => conn.id !== connectionToDeleteId));
      if (currentStatus?.connectionId === connectionToDeleteId) {
        // If the deleted connection was the active one, trigger a disconnect
        // which will be handled by HomePage's `handleDisconnect` via state change.
      }
      setNotificationMessage('Connection deleted successfully!');
    } catch (err: any) {
      setError(`Failed to delete connection: ${err.message}`);
    } finally {
      setConnectionToDeleteId(null);
    }
  }, [connectionToDeleteId, currentStatus, setNotificationMessage, setError]); // Dependencies for useCallback

  const handleCancelDelete = useCallback(() => {
    setShowConfirmDeleteDialog(false);
    setConnectionToDeleteId(null);
  }, []);


  // --- Rendering ---
  if (loading) {
    return <div className="loading">Loading connections...</div>;
  }

  return (
    <div className="connection-manager-view">
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
                    <button onClick={() => onConnect(conn.id)} disabled={currentStatus !== null}>
                      Connect
                    </button>
                    <button onClick={() => setEditingConnection(conn)}>Edit</button>
                    <button onClick={() => confirmDeleteConnection(conn.id)}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showConfirmDeleteDialog && (
        <Dialog
          title="Confirm Deletion"
          message="Are you sure you want to delete this connection? This action cannot be undone."
          onConfirm={handleDeleteConnection}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
};
