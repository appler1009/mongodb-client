import React from 'react';
import { ListGroup } from 'react-bootstrap';
import type { CollectionInfo } from '../types';
import '../styles/CollectionBrowser.css';

interface CollectionBrowserProps {
  collections: CollectionInfo[];
  selectedCollection: string | null;
  onSelectCollection: (collectionName: string) => void;
}

export const CollectionBrowser: React.FC<CollectionBrowserProps> = ({
  collections,
  selectedCollection,
  onSelectCollection,
}) => {
  return (
    <div className="collection-browser">
      <h4>Collections ({collections.length})</h4>
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
