// frontend/src/pages/DatabaseBrowser.tsx
// Moved from components to pages directory
import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import type { ConnectionStatus, CollectionInfo, Document } from '../types';
import {
  getDatabaseCollections,
  getCollectionDocuments,
  exportCollectionDocuments,
  getCollectionSchemaAndSampleDocuments,
  generateAIQuery,
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
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [documentsPerPage, setDocumentsPerPage] = useState<number>(25); // Default items per page
  // totalDocuments is derived from selectedCollection's documentCount
  const totalDocuments = selectedCollection
    ? collections.find(c => c.name === selectedCollection)?.documentCount || 0
    : 0;
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);

  // --- Query Editor State ---
  const [promptText, setPromptText] = useState<string>(''); // AI prompt input
  const [queryText, setQueryText] = useState<string>('{}'); // MongoDB query JSON
  const [parsedQuery, setParsedQuery] = useState<object>({}); // Parsed query object
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasQueryBeenExecuted, setHasQueryBeenExecuted] = useState<boolean>(false);


  // --- Helper function to reset collection/document related states ---
  const resetBrowserState = useCallback(() => {
    setCollections([]);
    setSelectedCollection(null);
    setDocuments([]);
    setCurrentPage(1);
    setPromptText('');
    setQueryText('{}');
    setParsedQuery({});
    setQueryError(null);
    setHasQueryBeenExecuted(false);
    setAiLoading(false);
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
      setPromptText('');
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

  // Fetch documents for the selected collection with the current parsedQuery
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
    if (selectedCollection && hasQueryBeenExecuted) {
      fetchDocuments();
    } else if (selectedCollection && !hasQueryBeenExecuted) {
      setDocuments([]);
    }
  }, [selectedCollection, currentPage, documentsPerPage, parsedQuery, hasQueryBeenExecuted, fetchDocuments]);

  // --- Pagination Handlers ---
  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setCurrentPage(1);
    setDocuments([]);
    setPromptText('');
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
  const handlePromptTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPromptText(e.target.value);
    setQueryError(null); // Clear previous query errors on new input
  };

  const handleQueryTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setQueryText(e.target.value);
    setQueryError(null);
  };

  // Handles triggering AI query generation
  const handleGenerateAIQuery = useCallback(async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection before asking AI to generate a query.');
      return;
    }
    const userPrompt = promptText.trim(); // Use promptText state directly
    if (!userPrompt) {
        setQueryError('Please provide a description for the AI query helper (e.g., "find users older than 30").');
        return;
    }

    setAiLoading(true);
    setQueryError(null);
    setNotificationMessage('Generating query with AI...');

    try {
      // 1. Get schema and sample documents for AI context
      const { sampleDocuments, schemaSummary } = await getCollectionSchemaAndSampleDocuments(selectedCollection, 5); // Fetch 5 samples

      // 2. Call the AI backend to generate the query
      const { generatedQuery, error: aiError } = await generateAIQuery(
        userPrompt,
        selectedCollection,
        schemaSummary,
        sampleDocuments
      );

      if (aiError) {
        setQueryError(`AI Error: ${aiError}`);
        setNotificationMessage(`AI query generation failed: ${aiError}`);
      } else if (generatedQuery) {
        // Set the AI-generated query to the query editor
        setQueryText(generatedQuery);
        // Attempt to parse and run it immediately
        try {
          const parsedAiQuery = JSON.parse(generatedQuery);
          setParsedQuery(parsedAiQuery);
          setCurrentPage(1); // Reset to first page for new AI query
          setHasQueryBeenExecuted(true); // Mark as executed
          setNotificationMessage('AI generated and executed query successfully!');
        } catch (parseError: any) {
          setQueryError(`AI generated invalid JSON: ${parseError.message}. Please check the AI's output.`);
          setNotificationMessage('AI generated invalid JSON. Manual correction might be needed.');
          setHasQueryBeenExecuted(false); // Don't execute if parsing fails
        }
      } else {
        setQueryError('AI did not return a query. Please try rephrasing your request.');
        setNotificationMessage('AI query generation failed: No query returned.');
      }

    } catch (err: any) {
      console.error('Frontend error during AI query generation:', err);
      setError(`Failed to communicate with AI helper: ${err.message}`);
      setNotificationMessage('Failed to communicate with AI helper.');
    } finally {
      setAiLoading(false);
    }
  }, [selectedCollection, promptText, setNotificationMessage, setError]);

  // Handles execution of a manually typed JSON query
  const handleExecuteManualQuery = () => {
    if (documentsLoading || aiLoading) { // Disable if data or AI is loading
        setQueryError("System is busy. Please wait for current operations to complete.");
        return;
    }
    try {
        const newQuery = JSON.parse(queryText);
        setParsedQuery(newQuery); // This will trigger fetchDocuments via useEffect
        setCurrentPage(1); // Reset to first page for new query
        setQueryError(null);
        setHasQueryBeenExecuted(true);
    } catch (e: any) {
        setQueryError('Invalid JSON query. Please ensure it\'s a valid JSON object (e.g., {"field": "value"}).');
        setHasQueryBeenExecuted(false); // Don't run query if invalid
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
            <h4>Query Helper</h4>
            <textarea
              className="prompt-editor"
              value={promptText}
              onChange={handlePromptTextChange}
              placeholder='Enter natural language prompt (e.g., "find users older than 30")'
              rows={3}
              disabled={documentsLoading || aiLoading}
            />
            {/* AI Generate Query Button below the prompt textarea */}
            <button
              onClick={handleGenerateAIQuery}
              disabled={documentsLoading || aiLoading || !selectedCollection || promptText.trim().length === 0}
              className="ai-generate-button"
              title="Generate MongoDB query using AI based on your natural language prompt"
            >
              {aiLoading ? 'Generating Query...' : 'Generate Query'}
            </button>

            <h4>Find Query (JSON)</h4>
            <textarea
              className="query-editor"
              value={queryText}
              onChange={handleQueryTextChange}
              placeholder='Enter MongoDB query JSON (e.g., {"age": {"$gt": 30}})'
              rows={5}
              disabled={documentsLoading || aiLoading} // Disable when documents loading OR AI loading
            />
            <div className="query-controls">
              <button
                onClick={handleExport}
                disabled={!selectedCollection || documentsLoading || aiLoading}
                className="export-button"
                title="Export all documents matching the current query to a JSON Lines file"
              >
                Export
              </button>
              {/* The Run Query button, now exclusively for manual JSON execution */}
              <button
                onClick={handleExecuteManualQuery} // Changed to new handler
                disabled={documentsLoading || aiLoading || !selectedCollection} // Disable Run Query if AI is loading or no collection selected
              >
                Run Query
              </button>
            </div>
          </div>

          {selectedCollection && (
            <div className="pagination-controls">
              <span>
                Documents per page:
                <select value={documentsPerPage} onChange={handleDocumentsPerPageChange} disabled={documentsLoading || aiLoading}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </span>
              <span>
                Page {currentPage} of {totalPages} (Total: {totalDocuments} documents)
              </span>
              <button onClick={handlePrevPage} disabled={currentPage === 1 || documentsLoading || aiLoading}>Previous</button>
              <button onClick={handleNextPage} disabled={currentPage === totalPages || documentsLoading || aiLoading}>Next</button>
            </div>
          )}

          {documentsLoading ? (
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
