// frontend/src/pages/DatabaseBrowser.tsx
// Moved from components to pages directory
import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import type { ConnectionStatus, CollectionInfo, Document } from '../types';
import {
  getDatabaseCollections,
  getCollectionDocuments,
  exportCollectionDocuments,
} from '../api/backend';

// imports for components that DatabaseBrowser uses
import { CollectionBrowser } from '../components/CollectionBrowser';
import { DocumentViewer } from '../components/DocumentViewer';

import '../styles/DatabaseBrowser.css';

interface DatabaseBrowserProps {
  currentStatus: ConnectionStatus | null;
  setNotificationMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
}

export const DatabaseBrowser: React.FC<DatabaseBrowserProps> = ({
  currentStatus,
  setNotificationMessage,
  setError,
}) => {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState<boolean>(false);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [documentsPerPage, setDocumentsPerPage] = useState<number>(25); // Default items per page
  // totalDocuments is derived from selectedCollection's documentCount
  const totalDocuments = selectedCollection
    ? collections.find(c => c.name === selectedCollection)?.documentCount || 0
    : 0;
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);

  // --- Query Editor State ---
  const [queryText, setQueryText] = useState<string>('{}'); // Default to an empty object for "find all"
  const [parsedQuery, setParsedQuery] = useState<object>({}); // The actual parsed query object to be used for fetching
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasQueryBeenExecuted, setHasQueryBeenExecuted] = useState<boolean>(false);


  // --- Helper function to reset collection/document related states ---
  const resetBrowserState = useCallback(() => {
    setCollections([]);
    setSelectedCollection(null);
    setDocuments([]);
    setCurrentPage(1);
    setQueryText('{}');
    setParsedQuery({});
    setQueryError(null);
    setHasQueryBeenExecuted(false);
  }, []);

  // Fetch collections for the currently active database
  const fetchCollections = useCallback(async () => {
    if (!currentStatus?.database) {
      resetBrowserState();
      return;
    }
    setCollectionsLoading(true);
    setError(null); // Clear main error state
    try {
      const fetchedCollections = await getDatabaseCollections();
      fetchedCollections.sort((a, b) => a.name.localeCompare(b.name));

      // Reset document-specific states when collections are re-fetched
      setDocuments([]);
      setCurrentPage(1);
      setQueryText('{}');
      setParsedQuery({});
      setQueryError(null);
      setHasQueryBeenExecuted(false);

      setCollections(fetchedCollections);

      if (fetchedCollections.length > 0) {
        setSelectedCollection(fetchedCollections[0].name);
      } else {
        setSelectedCollection(null);
      }

    } catch (err: any) {
      setError(`Failed to fetch collections: ${err.message}`);
      setCollections([]);
      setSelectedCollection(null);
      resetBrowserState();
    } finally {
      setCollectionsLoading(false);
    }
  }, [currentStatus?.database, resetBrowserState, setError]);

  // Fetch documents for the currently selected collection with the current parsedQuery
  const fetchDocuments = useCallback(async () => {
    if (!selectedCollection) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    setError(null); // Clear main error state
    try {
      const skip = (currentPage - 1) * documentsPerPage;
      const response = await getCollectionDocuments(selectedCollection, documentsPerPage, skip, parsedQuery);
      setDocuments(response.documents);
    } catch (err: any) {
      setError(`Failed to fetch documents for ${selectedCollection}: ${err.message}`);
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection, currentPage, documentsPerPage, parsedQuery, setError]);

  // --- Effects for Data Loading ---
  useEffect(() => {
    if (currentStatus?.database) {
      fetchCollections();
    } else {
      resetBrowserState();
    }
  }, [currentStatus?.database, fetchCollections, resetBrowserState]);

  useEffect(() => {
    // Only attempt to fetch documents if a collection is selected AND
    // the user has explicitly triggered a query (or pagination/per-page change after a query).
    if (selectedCollection && hasQueryBeenExecuted) {
      fetchDocuments();
    } else if (selectedCollection && !hasQueryBeenExecuted) {
        // If a collection is selected but no query has been executed yet,
        // ensure documents are cleared. This handles the state when a new
        // collection is selected and we're waiting for the first "Run Query".
        setDocuments([]);
    }
  }, [selectedCollection, currentPage, documentsPerPage, parsedQuery, hasQueryBeenExecuted, fetchDocuments]);

  // --- Pagination Handlers ---
  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    // Keep these specific resets as they're tied to collection selection
    setCurrentPage(1);
    setDocuments([]);
    setQueryText('{}');
    setParsedQuery({});
    setQueryError(null);
    setHasQueryBeenExecuted(false);
  };

  const handlePrevPage = () => {
    const newPage = Math.max(1, currentPage - 1);
    setCurrentPage(newPage);
  };

  const handleNextPage = () => {
    const newPage = Math.min(totalPages, currentPage + 1);
    setCurrentPage(newPage);
  };

  const handleDocumentsPerPageChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setDocumentsPerPage(parseInt(e.target.value, 10));
    setCurrentPage(1);
  };

  // --- Query Editor Handlers ---
  const handleQueryTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setQueryText(e.target.value);
    setQueryError(null);
  };

  const handleRunQuery = () => {
    try {
      const newQuery = JSON.parse(queryText);
      setParsedQuery(newQuery); // This will trigger fetchDocuments via useEffect
      setCurrentPage(1); // Reset to first page for new query
      setQueryError(null);
      setHasQueryBeenExecuted(true);
    } catch (e: any) {
      setQueryError('Invalid JSON query. Please ensure it\'s a valid JSON object (e.g., {"field": "value"}).');
    }
  };

  // --- Export Handler ---
  const handleExport = async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection to export.');
      return;
    }
    setError(null); // Clear any previous error
    setDocumentsLoading(true); // Indicate loading state for export operation
    try {
      const { success, filePath, error: exportError } = await exportCollectionDocuments(selectedCollection, parsedQuery);

      if (success && filePath) {
        setNotificationMessage(`Exported to: ${filePath}`);
      } else if (!success && exportError) {
        setNotificationMessage(`Export failed: ${exportError}`);
        setError(`Export failed: ${exportError}`);
      } else {
        setNotificationMessage('Export cancelled or failed.');
      }
    } catch (err: any) {
      setError(`An unexpected error occurred during export: ${err.message}`);
      setNotificationMessage(`An unexpected error occurred: ${err.message}`);
    } finally {
      setDocumentsLoading(false); // Always reset loading flag
    }
  };

  if (!currentStatus?.database) {
    return <p>Select a connection to browse databases.</p>; // Should ideally not be reached if rendered conditionally
  }

  return (
    <div className="database-browser-section">
      <div className="browser-content">
        <div className="collections-pane">
          {collectionsLoading ? (
            <p>Loading collections...</p>
          ) : (
            <CollectionBrowser
              collections={collections}
              selectedCollection={selectedCollection}
              onSelectCollection={handleCollectionSelect}
            />
          )}
        </div>
        <div className="document-panel-right">
          {queryError && <div className="query-error-message">{queryError}</div>}

          <div className="query-editor-container">
            <h4>Find Query (JSON)</h4>
            <textarea
              className="query-editor"
              value={queryText}
              onChange={handleQueryTextChange}
              placeholder='e.g., {"name": "Alice", "age": {"$gt": 30}}'
              rows={5}
              disabled={documentsLoading}
            />
            <div className="query-controls">
              <button
                onClick={handleExport}
                disabled={!selectedCollection || documentsLoading}
                className="export-button"
                title="Export all documents matching the current query to a JSON Lines file"
              >
                Export
              </button>
              <button onClick={handleRunQuery} disabled={documentsLoading}>
                Run Query
              </button>
            </div>
          </div>

          {selectedCollection && (
            <div className="pagination-controls">
              <span>
                Documents per page:
                <select value={documentsPerPage} onChange={handleDocumentsPerPageChange} disabled={documentsLoading}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </span>
              <span>
                Page {currentPage} of {totalPages} (Total: {totalDocuments} documents)
              </span>
              <button onClick={handlePrevPage} disabled={currentPage === 1 || documentsLoading}>Previous</button>
              <button onClick={handleNextPage} disabled={currentPage === totalPages || documentsLoading}>Next</button>
            </div>
          )}

          {documentsLoading && !setNotificationMessage ? ( // Changed condition to match new component prop usage
            <p>Loading documents...</p>
          ) : (
            <DocumentViewer
              collectionName={selectedCollection}
              documents={documents}
              currentPage={currentPage}
              documentsPerPage={documentsPerPage}
            />
          )}
        </div>
      </div>
    </div>
  );
};
