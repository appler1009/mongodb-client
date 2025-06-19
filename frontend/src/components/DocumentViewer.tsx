// frontend/src/components/DocumentViewer.tsx
import React from 'react';
import type { Document } from '../types';

interface DocumentViewerProps {
  collectionName: string | null;
  documents: Document[];
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  collectionName,
  documents,
}) => {
  if (!collectionName) {
    return <div className="document-viewer"><p>Please select a collection to view documents.</p></div>;
  }

  return (
    <div className="document-viewer">
      <h4>Documents in "{collectionName}" ({documents.length})</h4>
      {documents.length === 0 ? (
        <p>No documents found in this collection.</p>
      ) : (
        <pre className="document-json-display">
          {JSON.stringify(documents, null, 2)}
        </pre>
      )}
    </div>
  );
};
