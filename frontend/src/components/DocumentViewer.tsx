// frontend/src/components/DocumentViewer.tsx
import React, { useMemo, useState, useContext } from 'react';
import type { Document } from '../types';

// Import SyntaxHighlighter component
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';

// Import light and dark themes from highlight.js styles
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { ThemeContext, Theme } from '../context/ThemeContext';


interface DocumentViewerProps {
  collectionName: string | null;
  documents: Document[];
  currentPage: number;
  documentsPerPage: number;
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

// --- JSON View Component ---
interface JsonViewProps {
  documents: Document[];
  collectionName: string | null;
}

const JsonDocumentDisplay: React.FC<JsonViewProps> = ({ documents, collectionName }) => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    // This error will be thrown if JsonDocumentDisplay is not wrapped by ThemeProvider
    throw new Error('JsonDocumentDisplay must be used within a ThemeProvider');
  }
  const { theme } = themeContext; // Get the current theme mode from the context

  if (!collectionName) {
    return <p>Please select a collection to view documents.</p>;
  }

  if (documents.length === 0) {
    return (
      <div className="json-viewer-container">
        <p>No documents found to display as JSON.</p>
      </div>
    );
  }

  const jsonContent = JSON.stringify(documents, null, 2);

  const syntaxHighlighterTheme = theme === 'dark' ? vs2015 : vs; // Use vs for light, vs2015 for dark

  return (
    <div className="json-viewer-container">
      <SyntaxHighlighter
        language="json"
        style={syntaxHighlighterTheme} // Apply the dynamically chosen theme
        customStyle={{
          // These custom styles are important to maintain consistency with your app's main theme variables
          backgroundColor: 'var(--card-bg)', // Uses your app's themed background
          color: 'var(--text-color)',       // Uses your app's themed text color
          padding: '15px',
          margin: '0',
          borderRadius: '8px',
          fontSize: '0.85em',
          lineHeight: '1.4',
          maxHeight: 'calc(100vh - 250px)', // Maintain the max-height for scrolling
          overflow: 'auto', // Ensure scrolling
          border: '1px solid var(--border-color)' // Maintain border
        }}
        codeTagProps={{ style: { fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace" } }}
      >
        {jsonContent}
      </SyntaxHighlighter>
    </div>
  );
};
// --- End JSON Component ---


export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  collectionName,
  documents,
  currentPage,
  documentsPerPage,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

  const columns = useMemo(() => {
    if (!Array.isArray(documents)) {
      return [];
    }

    const uniqueKeys = new Set<string>();
    documents.forEach(doc => {
      if (typeof doc === 'object' && doc !== null) {
        Object.keys(doc).forEach(key => uniqueKeys.add(key));
      }
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
        <p>No documents found to display as JSON.</p>
      </div>
    );
  }

  return (
    <div className="document-viewer">
      <div className="document-viewer-header">
        <h4>Documents in "{collectionName}" (Showing {documents.length} records)</h4>
        <div className="view-toggle">
          <button
            onClick={() => setViewMode('table')}
            className={viewMode === 'table' ? 'active' : ''}
            aria-pressed={viewMode === 'table'}
          >Table</button>
          <button
            onClick={() => setViewMode('json')}
            className={viewMode === 'json' ? 'active' : ''}
            aria-pressed={viewMode === 'json'}
          >JSON</button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="document-table-container">
          <table className="document-table">
            <thead>
              <tr>
                <th className="index-column-header"></th>
                {columns.map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, docIndex) => {
                const globalIndex = (currentPage - 1) * documentsPerPage + docIndex + 1;

                return (
                  <tr key={doc._id ? String(doc._id) : `doc-${globalIndex}`}>
                    <td className="document-index-cell">{globalIndex}</td>
                    {columns.map(col => (
                      <td key={`${doc._id || globalIndex}-${col}`} className="document-data-cell">
                        {formatCellValue(doc[col])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <JsonDocumentDisplay documents={documents} collectionName={collectionName} />
      )}
    </div>
  );
};
