import React, { useState, useEffect } from 'react';
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

  // Fetch document counts for collections with negative counts
  useEffect(() => {
    collections.forEach(col => {
      if (col.documentCount < 0 && !fetchingCounts.has(col.name)) {
        // Mark this collection as being fetched to avoid duplicate requests
        setFetchingCounts(prev => {
          const newSet = new Set(prev);
          newSet.add(col.name);
          return newSet;
        });

        // Fetch the document count in the background
        (async () => {
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
        })();
      }
    });
  }, [collections, fetchingCounts]);

  return (
    <div className="collection-browser">
      {currentStatus?.database && (
        <Card className="connection-status-header mb-3">
          <Card.Body className="d-flex align-items-center p-2">
            <Card.Title><strong className="connected-db-name">{currentStatus.database}</strong></Card.Title>
          </Card.Body>
          <Card.Footer className="text-muted">
            <Button
              variant="danger"
              size="sm"
              onClick={onDisconnect}
              className="ms-auto"
              title="Disconnect from current database"
            >
              Disconnect
            </Button>
          </Card.Footer>
        </Card>
      )}
      {collections.length === 0 ? (
        <p className="text-muted">No collections found in this database.</p>
      ) : (
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
      )}
    </div>
  );
};
