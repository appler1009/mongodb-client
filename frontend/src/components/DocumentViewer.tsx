import React, { useMemo, useState, useContext, useCallback } from 'react';
import type { Document, MongoQueryParams } from '../types';
import { Button, ButtonGroup, ToggleButton, Table, Alert } from 'react-bootstrap';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { ThemeContext } from '../context/ThemeContext';
import { exportCollectionDocuments } from '../api/backend';
import '../styles/DocumentViewer.css';

interface DocumentViewerProps {
  collectionName: string | null;
  documents: Document[];
  currentPage: number;
  documentsPerPage: number;
  queryParams: MongoQueryParams;
  setNotificationMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
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

interface JsonViewProps {
  documents: Document[];
  collectionName: string | null;
  jsonContent: string;
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

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  collectionName,
  documents,
  currentPage,
  documentsPerPage,
  queryParams,
  setNotificationMessage,
  setError,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [exportLoading, setExportLoading] = useState<boolean>(false);

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

  const jsonContent = useMemo(() => {
    if (!collectionName || documents.length === 0) {
      return '';
    }
    return JSON.stringify(documents, null, 2);
  }, [documents, collectionName]);

  const csvContent = useMemo(() => {
    if (!collectionName || documents.length === 0 || columns.length === 0) {
      return '';
    }
    const header = columns.join(',');
    const rows = documents.map(doc =>
      columns.map(col => {
        const value = doc[col];
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  }, [documents, columns, collectionName]);

  const handleCopy = useCallback(async () => {
    const content = viewMode === 'json' ? jsonContent : csvContent;
    if (content) {
      try {
        await navigator.clipboard.writeText(content);
        setAlertMessage(`${viewMode === 'json' ? 'JSON' : 'CSV'} copied!`);
      } catch (err) {
        console.error(`Failed to copy ${viewMode === 'json' ? 'JSON' : 'CSV'}:`, err);
        setAlertMessage('Failed to copy!');
      }
      setShowAlert(true);
      setTimeout(() => setShowAlert(false), 2000);
    }
  }, [viewMode, jsonContent, csvContent]);

  const handleExport = async () => {
    if (!collectionName) {
      setNotificationMessage('Please select a collection to export.');
      return;
    }
    setError(null);
    setExportLoading(true);
    try {
      const { success, filePath, error: exportError } = await exportCollectionDocuments(collectionName, queryParams);
      if (success && filePath) {
        setNotificationMessage(`Exported to: ${filePath}`);
      } else if (!success && exportError) {
        setNotificationMessage(`Export failed: ${exportError}`);
        setError(`Export failed: ${exportError}`);
      } else {
        setNotificationMessage('Export cancelled or failed.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`An unexpected error occurred during export: ${errorMessage}`);
      setNotificationMessage(`An unexpected error occurred: ${errorMessage}`);
    } finally {
      setExportLoading(false);
    }
  };

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
          <div className="copy-json-container">
            <div className="json-actions">
              <Button
                onClick={handleExport}
                variant="secondary"
                title="Export all documents matching the current query to a JSON Lines file"
                disabled={!collectionName || exportLoading}
                className="me-2"
              >
                {exportLoading ? 'Exporting...' : 'Export'}
              </Button>
              <Button
                onClick={handleCopy}
                variant="primary"
                title={viewMode === 'json' ? 'Copy formatted JSON to clipboard' : 'Copy CSV to clipboard'}
                disabled={!collectionName || documents.length === 0}
              >
                Copy
              </Button>
              {showAlert && (
                <Alert
                  variant={alertMessage.includes('copied') ? 'success' : 'danger'}
                  className="mb-0 small-alert"
                >{alertMessage}</Alert>
              )}
            </div>
          </div>
          <div className="view-toggle-container">
            <ButtonGroup>
              <ToggleButton
                id="json-toggle"
                type="radio"
                variant={viewMode === 'json' ? 'success' : 'outline-success'}
                value="json"
                checked={viewMode === 'json'}
                onChange={() => setViewMode('json')}
                aria-pressed={viewMode === 'json'}
              >
                JSON
              </ToggleButton>
              <ToggleButton
                id="table-toggle"
                type="radio"
                variant={viewMode === 'table' ? 'success' : 'outline-success'}
                value="table"
                checked={viewMode === 'table'}
                onChange={() => setViewMode('table')}
                aria-pressed={viewMode === 'table'}
              >
                Table
              </ToggleButton>
            </ButtonGroup>
          </div>
        </div>
      </div>
      {viewMode === 'table' ? (
        <div className="document-table-container">
          <Table striped bordered hover responsive>
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
          </Table>
        </div>
      ) : (
        <JsonDocumentDisplay documents={documents} collectionName={collectionName} jsonContent={jsonContent} />
      )}
    </div>
  );
};
