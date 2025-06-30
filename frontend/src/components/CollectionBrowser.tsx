import React from 'react';
import { ListGroup, Button, Card } from 'react-bootstrap';
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
  return (
    <div className="collection-browser">
      {currentStatus?.database && (
        <Card className="connection-status-header mb-3">
          <Card.Body className="d-flex align-items-center p-2">
            <Card.Title>{currentStatus.database}</Card.Title>
            <Button
              variant="danger"
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
      <h5>Collections ({collections.length})</h5>
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
            >
              {col.name}
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
};
