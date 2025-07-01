import React from 'react';
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
                {col.documentCount.toLocaleString()}
              </Badge>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
};
