import React, { useState, useEffect, useCallback, ChangeEvent, KeyboardEvent } from 'react';
import { Container, Row, Col, Form, Button, Alert, ToggleButton } from 'react-bootstrap';
import type { ConnectionStatus, CollectionInfo, Document } from '../types';
import {
  getDatabaseCollections,
  getCollectionDocuments,
  exportCollectionDocuments,
  getCollectionSchemaAndSampleDocuments,
  generateAIQuery,
} from '../api/backend';
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [documentsPerPage, setDocumentsPerPage] = useState<number>(25);
  const [promptText, setPromptText] = useState<string>('');
  const [queryText, setQueryText] = useState<string>('{}');
  const [parsedQuery, setParsedQuery] = useState<object>({});
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasQueryBeenExecuted, setHasQueryBeenExecuted] = useState<boolean>(false);
  const [autoRunGeneratedQuery, setAutoRunGeneratedQuery] = useState<boolean>(true);

  const totalDocuments = selectedCollection
    ? collections.find((c) => c.name === selectedCollection)?.documentCount || 0
    : 0;
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);

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
    setAutoRunGeneratedQuery(true);
  }, []);

  const fetchCollections = useCallback(async () => {
    if (!currentStatus?.database) {
      resetBrowserState();
      return;
    }
    setCollectionsLoading(true);
    setError(null);
    try {
      const fetchedCollections = await getDatabaseCollections();
      fetchedCollections.sort((a, b) => a.name.localeCompare(b.name));
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

  const fetchDocuments = useCallback(async () => {
    if (!selectedCollection) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
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
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const handleDocumentsPerPageChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setDocumentsPerPage(parseInt(e.target.value, 10));
    setCurrentPage(1);
  };

  const handlePromptTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPromptText(e.target.value);
    setQueryError(null);
  };

  const handleQueryTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setQueryText(e.target.value);
    setQueryError(null);
  };

  const handleAutoRunToggleChange = (checked: boolean) => {
    setAutoRunGeneratedQuery(checked);
  };

  const handlePromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerateAIQuery();
    }
  };

  const handleQueryKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecuteManualQuery();
    }
  };

  const handleGenerateAIQuery = useCallback(async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection before asking Query Helper to generate a query.');
      return;
    }
    const userPrompt = promptText.trim();
    if (!userPrompt) {
      setQueryError('Please provide a description for the Query Helper (e.g., "find users older than 30").');
      return;
    }

    setAiLoading(true);
    setQueryError(null);
    setNotificationMessage('Generating query...');

    try {
      const { sampleDocuments, schemaSummary } = await getCollectionSchemaAndSampleDocuments(selectedCollection, 2);
      const { generatedQuery, error: backendError } = await generateAIQuery(
        userPrompt,
        selectedCollection,
        schemaSummary,
        sampleDocuments,
      );

      if (backendError) {
        setQueryError(`Query Helper Error: ${backendError}`);
        setNotificationMessage(`Query Helper generation failed: ${backendError}`);
      } else if (generatedQuery) {
        setQueryText(generatedQuery);
        if (autoRunGeneratedQuery) {
          try {
            const parsedQueryHelperQuery = JSON.parse(generatedQuery);
            setParsedQuery(parsedQueryHelperQuery);
            setCurrentPage(1);
            setHasQueryBeenExecuted(true);
            setNotificationMessage('Query Helper generated and executed query successfully!');
          } catch (parseError: any) {
            setQueryError(`Query Helper generated invalid JSON: ${parseError.message}. Please check the Query Helper's output.`);
            setNotificationMessage('Query Helper generated invalid JSON. Manual correction might be needed.');
            setHasQueryBeenExecuted(false);
          }
        } else {
          setNotificationMessage('Query Helper generated query successfully! Review and click "Run Query" to execute.');
          setHasQueryBeenExecuted(false);
        }
      } else {
        setQueryError('Query Helper did not return a query. Please try rephrasing your request.');
        setNotificationMessage('Query Helper generation failed: No query returned.');
      }
    } catch (err: any) {
      console.error('Frontend error during Query Helper generation:', err);
      setError(`Failed to communicate with Query Helper: ${err.message}`);
      setNotificationMessage('Failed to communicate with Query Helper.');
    } finally {
      setAiLoading(false);
    }
  }, [selectedCollection, promptText, autoRunGeneratedQuery, setNotificationMessage, setError]);

  const handleExecuteManualQuery = () => {
    if (documentsLoading || aiLoading) {
      setQueryError('System is busy. Please wait for current operations to complete.');
      return;
    }
    try {
      const newQuery = JSON.parse(queryText);
      setParsedQuery(newQuery);
      setCurrentPage(1);
      setQueryError(null);
      setHasQueryBeenExecuted(true);
    } catch (e: any) {
      setQueryError('Invalid JSON query. Please ensure it\'s a valid JSON object (e.g., {"field": "value"}).');
      setHasQueryBeenExecuted(false);
    }
  };

  const handleExport = async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection to export.');
      return;
    }
    setError(null);
    setDocumentsLoading(true);
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
      setDocumentsLoading(false);
    }
  };

  if (!currentStatus?.database) {
    return <p className="text-center mt-4">Select a connection to browse databases.</p>;
  }

  return (
    <Container fluid className="database-browser-section py-4">
      <Row>
        <Col md={3} className="collections-pane">
          {collectionsLoading ? (
            <p className="text-center mt-3">Loading collections...</p>
          ) : (
            <CollectionBrowser
              collections={collections}
              selectedCollection={selectedCollection}
              onSelectCollection={handleCollectionSelect}
            />
          )}
        </Col>
        <Col md={9} className="document-panel-right">
          {queryError && (
            <Alert variant="danger" className="mt-3">
              {queryError}
            </Alert>
          )}
          <div className="query-editor-container mb-4">
            <h4>Query Helper</h4>
            <Form.Control
              as="textarea"
              className="prompt-editor mb-2"
              value={promptText}
              onChange={handlePromptTextChange}
              onKeyDown={handlePromptKeyDown}
              placeholder="Enter natural language prompt (e.g., 'find users older than 30')"
              rows={3}
              disabled={documentsLoading || aiLoading}
            />
            <div className="d-flex align-items-center mb-3">
              <ToggleButton
                id="auto-run-toggle"
                type="checkbox"
                variant={autoRunGeneratedQuery ? 'primary' : 'outline-secondary'}
                checked={autoRunGeneratedQuery}
                value="1"
                onChange={(e) => handleAutoRunToggleChange(e.currentTarget.checked)}
                disabled={aiLoading}
                className="me-2"
              >
                Auto-run
              </ToggleButton>
              <Button
                variant="primary"
                onClick={handleGenerateAIQuery}
                disabled={documentsLoading || aiLoading || !selectedCollection || promptText.trim().length === 0}
                title="Generate MongoDB query using Query Helper based on your natural language prompt"
              >
                {aiLoading ? 'Generating Query...' : 'Generate Query'}
              </Button>
            </div>
            <h4>Find Query (JSON)</h4>
            <Form.Control
              as="textarea"
              className="query-editor mb-2"
              value={queryText}
              onChange={handleQueryTextChange}
              onKeyDown={handleQueryKeyDown}
              placeholder='Enter MongoDB query JSON (e.g., {"age": {"$gt": 30}})'
              rows={5}
              disabled={documentsLoading || aiLoading}
            />
            <div className="d-flex">
              <Button
                variant="secondary"
                onClick={handleExport}
                disabled={!selectedCollection || documentsLoading || aiLoading}
                title="Export all documents matching the current query to a JSON Lines file"
                className="me-2"
              >
                Export
              </Button>
              <Button
                variant="success"
                onClick={handleExecuteManualQuery}
                disabled={documentsLoading || aiLoading || !selectedCollection}
              >
                Run Query
              </Button>
            </div>
          </div>
          {selectedCollection && (
            <div className="pagination-controls d-flex align-items-center mb-3">
              <div className="me-auto">
                <Form.Select
                  value={documentsPerPage}
                  onChange={handleDocumentsPerPageChange}
                  disabled={documentsLoading || aiLoading}
                  className="me-2"
                  style={{ width: 'auto' }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </Form.Select>
                <Form.Text className="me-2">
                  Page {currentPage} of {totalPages} (Total: {totalDocuments} documents)
                </Form.Text>
              </div>
              <div className="d-flex">
                <Button
                  variant="outline-primary"
                  onClick={handlePrevPage}
                  disabled={currentPage === 1 || documentsLoading || aiLoading}
                  className="me-2"
                >
                  <i className="bi bi-arrow-left me-1"></i>
                  Previous
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || documentsLoading || aiLoading}
                >
                  Next
                  <i className="bi bi-arrow-right ms-1"></i>
                </Button>
              </div>
            </div>
          )}
          {documentsLoading ? (
            <p className="text-center mt-3">Loading documents...</p>
          ) : (
            <DocumentViewer
              collectionName={selectedCollection}
              documents={documents}
              currentPage={currentPage}
              documentsPerPage={documentsPerPage}
            />
          )}
        </Col>
      </Row>
    </Container>
  );
};
