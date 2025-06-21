// frontend/src/components/DocumentViewer.tsx
import React, { useMemo } from 'react';
import type { Document } from '../types';

interface DocumentViewerProps {
  collectionName: string | null;
  documents: Document[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isArray = (value: unknown): value is unknown[] => {
  return Array.isArray(value);
};

const formatCellValue = (value: unknown): React.ReactNode => {
  if (value === null) {
    return <span className="nested-data-indicator">null</span>;
  }
  if (value === undefined) {
    return <span className="nested-data-indicator">undefined</span>;
  }
  if (isPlainObject(value)) {
    return <span className="nested-data-indicator">[Object]</span>;
  }
  if (isArray(value)) {
    return <span className="nested-data-indicator">[Array ({value.length})]</span>;
  }
  return String(value);
};

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  collectionName,
  documents,
}) => {
  const columns = useMemo(() => {
    // Defensive check: Ensure documents is an array before trying to iterate
    if (!Array.isArray(documents)) {
      return [];
    }

    const uniqueKeys = new Set<string>();
    documents.forEach(doc => {
      Object.keys(doc).forEach(key => uniqueKeys.add(key));
    });
    const sortedKeys = Array.from(uniqueKeys).sort((a, b) => {
      if (a === '_id') return -1;
      if (b === '_id') return 1;
      return a.localeCompare(b);
    });
    return sortedKeys;
  }, [documents]);


  if (!collectionName) {
    return <div className="document-viewer"><p>Please select a collection to view documents.</p></div>;
  }

  if (documents.length === 0) {
    return (
      <div className="document-viewer">
        <h4>Documents in "{collectionName}" (0)</h4>
        <p>No documents found in this collection.</p>
      </div>
    );
  }

  return (
    <div className="document-viewer">
      <h4>Documents in "{collectionName}" (Showing {documents.length} records)</h4>
      <div className="document-table-container">
        <table className="document-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc, docIndex) => (
              <tr key={doc._id ? String(doc._id) : docIndex}>
                {columns.map(col => (
                  <td key={`${doc._id || docIndex}-${col}`}>
                    {formatCellValue(doc[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
