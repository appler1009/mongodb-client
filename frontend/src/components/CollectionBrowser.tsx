// frontend/src/components/CollectionBrowser.tsx
import React from 'react';
import type { CollectionInfo } from '../types';

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
        <p>No collections found in this database.</p>
      ) : (
        <ul>
          {collections.map((col) => (
            <li
              key={col.name}
              className={col.name === selectedCollection ? 'selected' : ''}
              onClick={() => onSelectCollection(col.name)}
            >
              {col.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
