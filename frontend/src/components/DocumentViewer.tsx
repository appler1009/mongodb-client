import React, { useMemo, useState, useContext, useCallback } from 'react';
import type { Document } from '../types';

// Import SyntaxHighlighter component
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';

// Import light and dark themes from highlight.js styles
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { ThemeContext } from '../context/ThemeContext';

import '../styles/DocumentViewer.css';

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
  jsonContent: string; // Now receives pre-formatted jsonContent
}

const JsonDocumentDisplay: React.FC<JsonViewProps> = ({ documents, collectionName, jsonContent }) => {
  const themeContext = useContext(ThemeContext);
  if (!themeContext) {
    throw new Error('JsonDocumentDisplay must be used within a ThemeProvider');
  }
  const { theme } = themeContext;

  const syntaxHighlighterTheme = theme === 'dark' ? vs2015 : vs;

  if (!collectionName) {
    return <p>Please select a collection to view documents.</p>;
  }

  if (documents.length === 0) {
    return (
      <div className="json-viewer-container">
        <p>Empty</p>
      </div>
    );
  }

  return (
    <div className="json-viewer-container">
      <SyntaxHighlighter
        language="json"
        style={syntaxHighlighterTheme}
        customStyle={{
          backgroundColor: 'var(--card-bg)',
          color: 'var(--text-color)',
          padding: '15px',
          margin: '0',
          borderRadius: '8px',
          fontSize: '0.85em',
          lineHeight: '1.4',
          maxHeight: 'calc(100vh - 250px)',
          overflow: 'auto',
          border: '1px solid var(--border-color)'
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
  const [copyFeedback, setCopyFeedback] = useState(''); // State for "Copied!" message

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

  // Generate JSON content here for the button and for the JsonDocumentDisplay
  const jsonContent = useMemo(() => {
    if (!collectionName || documents.length === 0) {
      return '';
    }
    return JSON.stringify(documents, null, 2);
  }, [documents, collectionName]);

  // Handle copying JSON content to clipboard
  const handleCopyJson = useCallback(async () => {
    if (jsonContent) {
      try {
        await navigator.clipboard.writeText(jsonContent);
        setCopyFeedback('Copied!');
        setTimeout(() => setCopyFeedback(''), 2000); // Clear message after 2 seconds
      } catch (err) {
        console.error('Failed to copy JSON:', err);
        setCopyFeedback('Failed to copy!');
        setTimeout(() => setCopyFeedback(''), 2000);
      }
    }
  }, [jsonContent]);

  if (!collectionName) {
    return <div className="document-viewer"><p>Please select a collection to view documents.</p></div>;
  }

  if (documents.length === 0) {
    return (
      <div className="document-viewer">
        <p>Empty</p>
      </div>
    );
  }

  return (
    <div className="document-viewer">
      <div className="document-viewer-header">
        <div className="view-controls-group">
          {/* 1. Copy JSON button aligned to the left */}
          <div className="copy-json-container">
            {viewMode === 'json' && (
              <div className="json-actions">
                <button
                  onClick={handleCopyJson}
                  className="copy-json-button"
                  title="Copy formatted JSON to clipboard"
                >
                  Copy JSON
                </button>
                {copyFeedback && <span className="copy-feedback">{copyFeedback}</span>}
              </div>
            )}
          </div>

          {/* 2. View Mode Toggles: JSON and Table aligned to the right */}
          <div className="view-toggle-container">
            <div className="view-toggle">
              <button
                onClick={() => setViewMode('json')}
                className={viewMode === 'json' ? 'active' : ''}
                aria-pressed={viewMode === 'json'}
              >JSON</button>
              <button
                onClick={() => setViewMode('table')}
                className={viewMode === 'table' ? 'active' : ''}
                aria-pressed={viewMode === 'table'}
              >Table</button>
            </div>
          </div>
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
        <JsonDocumentDisplay documents={documents} collectionName={collectionName} jsonContent={jsonContent} />
      )}
    </div>
  );
};
