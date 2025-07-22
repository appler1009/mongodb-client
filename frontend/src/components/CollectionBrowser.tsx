import React, { useState, useEffect, useCallback } from 'react';
import { ListGroup, Button, Card, Badge } from 'react-bootstrap';
import type { ConnectionStatus, CollectionInfo } from '../types';
import '../styles/CollectionBrowser.css';

interface CollectionBrowserProps {
  collections: CollectionInfo[];
  selectedCollection: string | null;
  currentStatus: ConnectionStatus | null;
  onSelectCollection: (collectionName: string) => void;
  onDisconnect: () => void;
}

export const CollectionBrowser: React.FC<CollectionBrowserProps> = ({
  collections,
  selectedCollection,
  currentStatus,
  onSelectCollection,
  onDisconnect,
}) => {
  // Local state to store fetched document counts
  const [localDocumentCounts, setLocalDocumentCounts] = useState<Record<string, number>>({});
  // Track which collections we've already started to fetch count for
  const [fetchingCounts, setFetchingCounts] = useState<Set<string>>(new Set());

  // Function to fetch document counts for collections with negative counts
  const fetchDocumentCounts = useCallback(async () => {
    const collectionsToFetch = collections.filter(col => col.documentCount < 0 && !fetchingCounts.has(col.name));

    if (collectionsToFetch.length === 0) return;

    // Mark collections as being fetched
    setFetchingCounts(prev => {
      const newSet = new Set(prev);
      collectionsToFetch.forEach(col => newSet.add(col.name));
      return newSet;
    });

    // Fetch counts concurrently
    await Promise.all(collectionsToFetch.map(async col => {
      try {
        const documentCount = await window.electronAPI.getCollectionDocumentCount(col.name);
        console.debug(`Fetched document count for ${col.name}: ${documentCount}`);

        // Update local state with the fetched count if it's valid
        if (documentCount >= 0) {
          setLocalDocumentCounts(prev => ({
            ...prev,
            [col.name]: documentCount
          }));
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.warn(`Failed to get document count for ${col.name}: ${err.message}`);
        } else {
          console.warn(`Failed to get document count for ${col.name}: Unknown error`);
        }
      }
    }));
  }, [collections, fetchingCounts]);

  // Fetch document counts on initial load
  useEffect(() => {
    fetchDocumentCounts();
  }, [fetchDocumentCounts]);

  // Handle Re-count button click
  const handleRecount = useCallback(() => {
    // Reset fetching counts to allow re-fetching all collections
    setFetchingCounts(new Set());
    // Clear existing counts to trigger re-fetch
    setLocalDocumentCounts({});
    // Fetch counts again
    fetchDocumentCounts();
  }, [fetchDocumentCounts]);

  const connectionInfoVariant = "info";
  const collectionActionVariant = "secondary";

  return (
    <div className="collection-browser">
      {currentStatus?.database && (
        <Card className="connection-status-header mb-3"
            bg={connectionInfoVariant.toLowerCase()}
            key={connectionInfoVariant}
            text={connectionInfoVariant.toLowerCase() === 'light' ? 'dark' : 'white'}>
          <Card.Header>{currentStatus.name}</Card.Header>
          <Card.Body className="d-flex align-items-center p-2 text-center">
            <Card.Title><strong className="connected-db-name">{currentStatus.database}</strong></Card.Title>
            <Button
              variant="warning"
              size="sm"
              onClick={onDisconnect}
              className="ms-auto"
              title="Disconnect from current database"
            >
              Disconnect
            </Button>
          </Card.Body>
        </Card>
      )}
      {collections.length === 0 ? (
        <p className="text-muted">No collections found in this database.</p>
      ) : (
        <div>
          <ListGroup>
            {collections.map((col) => (
              <ListGroup.Item
                key={col.name}
                active={col.name === selectedCollection}
                onClick={() => onSelectCollection(col.name)}
                action
                className="d-flex align-items-center"
              >
                <span>{col.name}</span>
                <Badge bg="secondary" className="ms-auto collection-badge" pill>
                  {col.documentCount < 0 && localDocumentCounts[col.name] !== undefined
                    ? localDocumentCounts[col.name].toLocaleString()
                    : col.documentCount < 0
                      ? '...'
                      : col.documentCount.toLocaleString()}
                </Badge>
              </ListGroup.Item>
            ))}
          </ListGroup>
          <Card className="collection-list-actions mb-3"
              bg={collectionActionVariant.toLowerCase()}
              key={collectionActionVariant}
              text={collectionActionVariant.toLowerCase() === 'light' ? 'dark' : 'white'}>
            <Card.Body className="d-flex align-items-center p-2 text-center">
              <Button
                variant="primary"
                size="sm"
                onClick={handleRecount}
                className="ms-auto"
                title="Re-count all collections"
              >
                Re-count
              </Button>
            </Card.Body>
          </Card>
        </div>
      )}
    </div>
  );
};
