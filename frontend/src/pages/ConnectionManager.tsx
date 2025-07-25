import React, { useState, useEffect, useCallback } from 'react';
import { Container, Form, Button, InputGroup, Alert, Accordion, Card, Spinner } from 'react-bootstrap';
import { v4 as uuidv4 } from 'uuid';
import type { ConnectionConfig, ConnectionStatus } from '../types';
import {
  getConnections,
  addConnection,
  updateConnection,
  deleteConnection,
} from '../api/backend';
import { Dialog } from '../components/Dialog';
import '../styles/ConnectionManager.css';

interface ConnectionManagerProps {
  currentStatus: ConnectionStatus | null;
  onConnect: (connectionId: string, attemptId: string) => Promise<ConnectionStatus|undefined>;
  setNotificationMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
}

const initialNewConnection: Omit<ConnectionConfig, 'id'> = {
  name: '',
  uri: '',
};

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
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectionToDeleteId, setConnectionToDeleteId] = useState<string | null>(null);
  const [attemptIds, setAttemptIds] = useState<{ [connId: string]: string | null }>({}); // Map<connId, attemptId>

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(`Failed to fetch connections: ${error.message}`);
      } else {
        setError('Failed to fetch connections: An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewConnection((prev) => ({
      ...prev,
      [name]: name === 'uri' ? value.trim() : value, // Trim whitespace from URI
    }));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditingConnection((prev) =>
      prev ? {
        ...prev,
        [name]: name === 'uri' ? value.trim() : value, // Trim whitespace from URI
      } : null
    );
  };

  const handleDriverVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setEditingConnection((prev) =>
      prev ? { ...prev, driverVersion: value === 'unknown' ? undefined : (value as 'v6' | 'v5' | 'v4' | 'v3') } : null
    );
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
      if (updated) {
        setConnections((prev) =>
          prev.map((conn) => (conn.id === updated.id ? updated : conn)).filter((conn): conn is ConnectionConfig => conn !== null)
        );
        setEditingConnection(null);
        setNotificationMessage('Connection updated successfully!');
      } else {
        setError('Failed to update connection: Update returned null');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(`Failed to update connection: ${err.message}`);
      } else {
        setError('Failed to update connection: Unknown error');
      }
    }
  };

  const confirmDeleteConnection = useCallback((id: string) => {
    setConnectionToDeleteId(id);
    setShowConfirmDeleteDialog(true);
  }, []);

  const handleDeleteConnection = useCallback(async () => {
    setShowConfirmDeleteDialog(false);
    setError(null);
    if (!connectionToDeleteId) return;

    try {
      await deleteConnection(connectionToDeleteId);
      setConnections((prev) => prev.filter((conn) => conn.id !== connectionToDeleteId));
      if (currentStatus?.connectionId === connectionToDeleteId) {
        // Optionally handle disconnection if the deleted connection is active
      }
      setNotificationMessage('Connection deleted successfully!');
    } catch (err: any) {
      setError(`Failed to delete connection: ${err.message}`);
    } finally {
      setConnectionToDeleteId(null);
    }
  }, [connectionToDeleteId, currentStatus, setNotificationMessage, setError]);

  const handleCancelDelete = useCallback(() => {
    setShowConfirmDeleteDialog(false);
    setConnectionToDeleteId(null);
  }, []);

  if (loading) {
    return <div className="text-center mt-4">Loading connections...</div>;
  }

  return (
    <Container className="py-4">
      <Accordion defaultActiveKey={null}>
        <Accordion.Item eventKey="0">
          <Accordion.Header>
            <i className="bi bi-plus-circle theme-icon me-2"></i>
            Add New Connection
          </Accordion.Header>
          <Accordion.Body>
            <Form onSubmit={handleAddConnection} className="mb-4">
              <Form.Group className="mb-3">
                <Form.Label>Connection Name</Form.Label>
                <Form.Control
                  type="text"
                  name="name"
                  placeholder="Connection Name"
                  value={newConnection.name}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>MongoDB URI</Form.Label>
                <Form.Control
                  as="textarea"
                  name="uri"
                  placeholder="MongoDB URI (e.g., mongodb://user:pass@host:port/database?replicaSet=mySet)"
                  value={newConnection.uri}
                  onChange={handleChange}
                  rows={3}
                  required
                />
              </Form.Group>
              <Button type="submit" variant="primary">Add Connection</Button>
            </Form>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>

      <h3 className="mt-4">Saved Connections</h3>
      {connections.length === 0 ? (
        <Alert variant="info">No connections saved yet.</Alert>
      ) : (
        <div className="connection-list">
          {connections.map((conn) => (
            <Card key={conn.id} className="mb-3">
              <Card.Body className="p-3">
                {editingConnection && editingConnection.id === conn.id ? (
                  <Form onSubmit={handleUpdateConnection}>
                    <Form.Group className="mb-3">
                      <Form.Label>Connection Name</Form.Label>
                      <Form.Control
                        type="text"
                        name="name"
                        value={editingConnection.name}
                        onChange={handleEditChange}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>MongoDB URI</Form.Label>
                      <Form.Control
                        as="textarea"
                        name="uri"
                        value={editingConnection.uri}
                        onChange={handleEditChange}
                        rows={3}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Driver Version</Form.Label>
                      <div>
                        {['v6', 'v5', 'v4', 'v3', 'unknown'].map((version) => (
                          <Form.Check
                            key={version}
                            type="radio"
                            label={version}
                            name="driverVersion"
                            value={version}
                            checked={
                              editingConnection.driverVersion === version ||
                              (version === 'unknown' && editingConnection.driverVersion === undefined)
                            }
                            onChange={handleDriverVersionChange}
                          />
                        ))}
                      </div>
                    </Form.Group>
                    <InputGroup>
                      <Button type="submit" variant="success">Save</Button>
                      <Button variant="secondary" onClick={() => setEditingConnection(null)}>Cancel</Button>
                    </InputGroup>
                  </Form>
                ) : (
                  <div className="connection-details">
                    <h4>{conn.name}</h4>
                    <p className="connection-uri">{conn.uri}</p>
                    <p>
                      Driver Version: {conn.driverVersion || 'unknown'}
                    </p>
                    <InputGroup>
                      {connectingId === conn.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Spinner animation="border" size="sm" /> Connecting...
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              const attemptId = attemptIds[conn.id];
                              if (attemptId && attemptId !== 'pending') {
                                try {
                                  await window.electronAPI.cancelConnectionAttempt(attemptId);
                                  setAttemptIds(prev => ({ ...prev, [conn.id]: null }));
                                  setConnectingId(null);
                                } catch (error: unknown) {
                                  if (error instanceof Error) {
                                    setError(`Failed to cancel connection: ${error.message}`);
                                  } else {
                                    setError('Failed to cancel connection: Unknown error');
                                  }
                                }
                              } else {
                                console.warn('Cannot cancel connection: No valid attemptId available', { attemptId });
                                setConnectingId(null);
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="primary"
                            onClick={async () => {
                              const attemptId = uuidv4();
                              setConnectingId(conn.id);
                              setAttemptIds(prev => ({ ...prev, [conn.id]: attemptId }));
                              try {
                                await onConnect(conn.id, attemptId);
                              } catch (error: unknown) {
                                if (error instanceof Error) {
                                  setError(`Connection failed: ${error.message}`);
                                } else {
                                  setError('Connection failed: Unknown error');
                                }
                              } finally {
                                setAttemptIds(prev => ({ ...prev, [conn.id]: null }));
                                setConnectingId(null);
                              }
                            }}
                            disabled={currentStatus !== null}
                          >
                            Connect
                          </Button>
                          <Button
                            variant="outline-warning"
                            onClick={() => setEditingConnection(conn)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline-danger"
                            onClick={() => confirmDeleteConnection(conn.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </InputGroup>
                  </div>
                )}
              </Card.Body>
            </Card>
          ))}
        </div>
      )}

      {showConfirmDeleteDialog && (
        <Dialog
          title="Confirm Deletion"
          message="Are you sure you want to delete this connection? This action cannot be undone."
          onConfirm={handleDeleteConnection}
          onCancel={handleCancelDelete}
        />
      )}
    </Container>
  );
};
