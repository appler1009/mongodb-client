import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Container, Row, Col, Form, Button, Alert, ToggleButton, Pagination, Accordion, Card } from 'react-bootstrap';
import type { ConnectionStatus, CollectionInfo, Document, MongoQueryParams } from '../types';
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
  onDisconnect: () => void;
}

export const DatabaseBrowser: React.FC<DatabaseBrowserProps> = ({
  currentStatus,
  setNotificationMessage,
  setError,
  onDisconnect,
}) => {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocumentCount, setFilteredDocumentCount] = useState<number>(0);
  const [collectionsLoading, setCollectionsLoading] = useState<boolean>(false);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [documentsPerPage, setDocumentsPerPage] = useState<number>(25);
  const [promptText, setPromptText] = useState<string>('');
  const [queryParams, setQueryParams] = useState<MongoQueryParams>({ readPreference: 'primary' });
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasQueryBeenExecuted, setHasQueryBeenExecuted] = useState<boolean>(false);
  const [autoRunGeneratedQuery, setAutoRunGeneratedQuery] = useState<boolean>(true);
  const [accordionActiveKey, setAccordionActiveKey] = useState<string | null>('0');
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const totalDocuments = hasQueryBeenExecuted ? filteredDocumentCount : 0;
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);

  const resetBrowserState = useCallback(() => {
    setCollections([]);
    setSelectedCollection(null);
    setDocuments([]);
    setFilteredDocumentCount(0);
    setCurrentPage(1);
    setPromptText('');
    setQueryParams({ readPreference: 'primary' });
    setQueryError(null);
    setHasQueryBeenExecuted(false);
    setAiLoading(false);
    setAutoRunGeneratedQuery(true);
    setAccordionActiveKey('0');
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
      setFilteredDocumentCount(0);
      setCurrentPage(1);
      setPromptText('');
      setQueryParams({ readPreference: 'primary' });
      setQueryError(null);
      setHasQueryBeenExecuted(false);
      setCollections(fetchedCollections);
      if (fetchedCollections.length > 0) {
        setSelectedCollection(fetchedCollections[0].name);
      } else {
        setSelectedCollection(null);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`Failed to fetch collections: ${errorMessage}`);
      setCollections([]);
      setSelectedCollection(null);
      resetBrowserState();
    } finally {
      setCollectionsLoading(false);
    }
  }, [currentStatus?.database, resetBrowserState, setError]);

  const debouncedFetchCollections = useCallback(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      fetchCollections();
    }, 100);
  }, [fetchCollections]);

  const fetchDocuments = useCallback(async (params: MongoQueryParams) => {
    if (!selectedCollection) {
      setDocuments([]);
      setFilteredDocumentCount(0);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * documentsPerPage;
      const response = await getCollectionDocuments(selectedCollection, documentsPerPage, skip, params);
      setDocuments(response.documents);
      setFilteredDocumentCount(response.totalDocuments || 0);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`Failed to fetch documents for ${selectedCollection}: ${errorMessage}`);
      setDocuments([]);
      setFilteredDocumentCount(0);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection, currentPage, documentsPerPage, setError]);

  useEffect(() => {
    if (currentStatus?.database) {
      debouncedFetchCollections();
    } else {
      resetBrowserState();
    }
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [currentStatus?.database, debouncedFetchCollections, resetBrowserState]);

  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setCurrentPage(1);
    setDocuments([]);
    setFilteredDocumentCount(0);
    setPromptText('');
    setQueryParams({ readPreference: 'primary' });
    setQueryError(null);
    setHasQueryBeenExecuted(false);
    setAccordionActiveKey('0');
  };

  const handlePageSelect = (page: number) => {
    setCurrentPage(page);
    if (hasQueryBeenExecuted) {
      fetchDocuments(queryParams);
    }
  };

  const handleDocumentsPerPageChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setDocumentsPerPage(parseInt(e.target.value, 10));
    setCurrentPage(1);
    if (hasQueryBeenExecuted) {
      fetchDocuments(queryParams);
    }
  };

  const handlePromptTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setPromptText(e.target.value);
    setQueryError(null);
  };

  const handleParamChange = (key: keyof MongoQueryParams, value: string | string[]) => {
    if (value === '') {
      setQueryParams((prev) => {
        const newParams = { ...prev };
        delete newParams[key];
        return newParams;
      });
    } else {
      setQueryParams((prev) => ({ ...prev, [key]: value }));
    }
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

  const handleParamKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, key: keyof MongoQueryParams) => {
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
      setQueryError('Please provide a description for the Query Helper (e.g., "find users older than 30, sorted by name").');
      return;
    }

    setAiLoading(true);
    setQueryError(null);
    setNotificationMessage('Generating query...');

    try {
      const { sampleDocuments, schemaMap } = await getCollectionSchemaAndSampleDocuments(selectedCollection, 2);
      const { generatedQuery, error: backendError } = await generateAIQuery(
        userPrompt,
        selectedCollection,
        schemaMap,
        sampleDocuments,
      );

      if (backendError) {
        setQueryError(`Query Helper Error: ${backendError}`);
        setNotificationMessage(`Query Helper generation failed: ${backendError}`);
      } else if (generatedQuery) {
        try {
          const parsedQuery = JSON.parse(generatedQuery) as MongoQueryParams;
          const formattedParams: MongoQueryParams = { readPreference: 'primary' };
          if (parsedQuery.query) formattedParams.query = parsedQuery.query as string;
          if (parsedQuery.sort) formattedParams.sort = parsedQuery.sort as string;
          if (parsedQuery.filter) formattedParams.filter = parsedQuery.filter as string;
          if (parsedQuery.pipeline) formattedParams.pipeline = parsedQuery.pipeline as string[];
          if (parsedQuery.projection) formattedParams.projection = parsedQuery.projection as string;
          if (parsedQuery.collation) formattedParams.collation = parsedQuery.collation as string;
          if (parsedQuery.hint) formattedParams.hint = parsedQuery.hint as string;
          if (parsedQuery.readPreference) formattedParams.readPreference = parsedQuery.readPreference;

          setQueryParams(formattedParams);
          if (autoRunGeneratedQuery) {
            setCurrentPage(1);
            setHasQueryBeenExecuted(true);
            await fetchDocuments(formattedParams);
            setAccordionActiveKey(null);
            setNotificationMessage('Query Helper generated and executed query successfully!');
          } else {
            setHasQueryBeenExecuted(false);
            setNotificationMessage('Query Helper generated query successfully! Review and click "Run Query" to execute.');
          }
        } catch (parseError: unknown) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'An unexpected error occurred';
          setQueryError(`Query Helper generated invalid JSON: ${errorMessage}. Please check the Query Helper's output.`);
          setNotificationMessage('Query Helper generated invalid JSON. Manual correction might be needed.');
          setQueryParams({ readPreference: 'primary' });
          setHasQueryBeenExecuted(false);
        }
      } else {
        setQueryError('Query Helper did not return a query. Please try rephrasing your request.');
        setNotificationMessage('Query Helper generation failed: No query returned.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Frontend error during Query Helper generation:', err);
      setError(`Failed to communicate with Query Helper: ${errorMessage}`);
      setNotificationMessage('Failed to communicate with Query Helper.');
    } finally {
      setAiLoading(false);
    }
  }, [selectedCollection, promptText, autoRunGeneratedQuery, setNotificationMessage, setError, fetchDocuments]);

  const handleExecuteManualQuery = async () => {
    if (documentsLoading || aiLoading) {
      setQueryError('System is busy. Please wait for current operations to complete.');
      return;
    }
    if (Object.keys(queryParams).length === 0 || (Object.keys(queryParams).length === 1 && queryParams.readPreference)) {
      queryParams.query = '{}';
    }
    setCurrentPage(1);
    setQueryError(null);
    setHasQueryBeenExecuted(true);
    await fetchDocuments(queryParams);
    setAccordionActiveKey(null);
  };

  const handleExport = async () => {
    if (!selectedCollection) {
      setNotificationMessage('Please select a collection to export.');
      return;
    }
    setError(null);
    setDocumentsLoading(true);
    try {
      const { success, filePath, error: exportError } = await exportCollectionDocuments(selectedCollection, queryParams);
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
      setDocumentsLoading(false);
    }
  };

  const paginationItems = [];
  if (filteredDocumentCount > 0) {
    let startPage = Math.max(1, currentPage - 2);
    const maxPageButtons = 5;
    const endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

    if (endPage === totalPages) {
      startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    if (startPage > 1) {
      paginationItems.push(
        <Pagination.Item
          key={1}
          active={1 === currentPage}
          onClick={() => handlePageSelect(1)}
          disabled={documentsLoading || aiLoading}
        >
          1
        </Pagination.Item>
      );
      if (startPage > 2) {
        paginationItems.push(<Pagination.Ellipsis key="start-ellipsis" />);
      }
    }

    for (let page = startPage; page <= endPage; page++) {
      paginationItems.push(
        <Pagination.Item
          key={page}
          active={page === currentPage}
          onClick={() => handlePageSelect(page)}
          disabled={documentsLoading || aiLoading}
        >
          {page}
        </Pagination.Item>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationItems.push(<Pagination.Ellipsis key="end-ellipsis" />);
      }
      paginationItems.push(
        <Pagination.Item
          key={totalPages}
          active={totalPages === currentPage}
          onClick={() => handlePageSelect(totalPages)}
          disabled={documentsLoading || aiLoading}
        >
          {totalPages}
        </Pagination.Item>
      );
    }
  }

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
              currentStatus={currentStatus}
              onSelectCollection={handleCollectionSelect}
              onDisconnect={onDisconnect}
            />
          )}
        </Col>
        <Col md={9} className="document-panel-right">
          {queryError && (
            <Alert variant="danger" className="mt-3">
              {queryError}
            </Alert>
          )}
          <Accordion activeKey={accordionActiveKey} onSelect={(key) => setAccordionActiveKey(key as string | null)} className="mb-4">
            <Card>
              <Accordion.Item eventKey="0">
                <Accordion.Header>Query</Accordion.Header>
                <Accordion.Body>
                  <Form.Group className="mb-3">
                    <Form.Label>Query Helper</Form.Label>
                    <Form.Control
                      as="textarea"
                      className="prompt-editor mb-2"
                      value={promptText}
                      onChange={handlePromptTextChange}
                      onKeyDown={handlePromptKeyDown}
                      placeholder="Enter natural language prompt (e.g., 'find users older than 30, sorted by name')"
                      rows={3}
                      disabled={documentsLoading || aiLoading}
                    />
                    <div className="d-flex align-items-center mb-3">
                      <div className="me-auto">
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
                          <i className={autoRunGeneratedQuery ? 'bi bi-check-circle me-1' : 'bi bi-x-circle me-1'}></i>
                          Auto-run
                        </ToggleButton>
                      </div>
                      <div className="d-flex">
                        <Button
                          variant="primary"
                          onClick={handleGenerateAIQuery}
                          disabled={documentsLoading || aiLoading || !selectedCollection || promptText.trim().length === 0}
                          title="Generate MongoDB query using Query Helper based on your natural language prompt"
                        >
                          {aiLoading ? 'Generating Query...' : 'Generate Query'}
                        </Button>
                      </div>
                    </div>
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Query</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.query || ''}
                      onChange={(e) => handleParamChange('query', e.target.value)}
                      onKeyDown={(e) => handleParamKeyDown(e, 'query')}
                      placeholder='e.g., {"timestamp":{"$gte":"2025-06-30T00:00:00.000Z"}}'
                      rows={2}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Sort</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.sort || ''}
                      onChange={(e) => handleParamChange('sort', e.target.value)}
                      onKeyDown={(e) => handleParamKeyDown(e, 'sort')}
                      placeholder='e.g., {"name":1}'
                      rows={2}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Filter</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.filter || ''}
                      onChange={(e) => handleParamChange('filter', e.target.value)}
                      onKeyDown={(e) => handleParamKeyDown(e, 'filter')}
                      placeholder='e.g., {"status":"active"}'
                      rows={2}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Pipeline</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.pipeline ? queryParams.pipeline.join('\n') : ''}
                      onChange={(e) => handleParamChange('pipeline', e.target.value.split('\n').filter((v) => v.trim()))}
                      onKeyDown={(e) => handleParamKeyDown(e, 'pipeline')}
                      placeholder='e.g., {"$match":{"age":30}}'
                      rows={3}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Projection</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.projection || ''}
                      onChange={(e) => handleParamChange('projection', e.target.value)}
                      onKeyDown={(e) => handleParamKeyDown(e, 'projection')}
                      placeholder='e.g., {"name":1}'
                      rows={2}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Collation</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.collation || ''}
                      onChange={(e) => handleParamChange('collation', e.target.value)}
                      onKeyDown={(e) => handleParamKeyDown(e, 'collation')}
                      placeholder='e.g., {"locale":"en"}'
                      rows={2}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Hint</Form.Label>
                    <Form.Control
                      as="textarea"
                      value={queryParams.hint || ''}
                      onChange={(e) => handleParamChange('hint', e.target.value)}
                      onKeyDown={(e) => handleParamKeyDown(e, 'hint')}
                      placeholder='e.g., {"name":1} or "indexName"'
                      rows={2}
                      disabled={documentsLoading || aiLoading}
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Read Preference</Form.Label>
                    <Form.Select
                      value={queryParams.readPreference || 'primary'}
                      onChange={(e) => handleParamChange('readPreference', e.target.value)}
                      disabled={documentsLoading || aiLoading}
                    >
                      <option value="primary">primary</option>
                      <option value="primaryPreferred">primaryPreferred</option>
                      <option value="secondary">secondary</option>
                      <option value="secondaryPreferred">secondaryPreferred</option>
                      <option value="nearest">nearest</option>
                    </Form.Select>
                  </Form.Group>
                  <div className="d-flex">
                    <div className="me-auto">
                      <Button
                        variant="secondary"
                        onClick={handleExport}
                        disabled={!selectedCollection || documentsLoading || aiLoading}
                        title="Export all documents matching the current query to a JSON Lines file"
                        className="me-2"
                      >
                        Export
                      </Button>
                    </div>
                    <div className="d-flex">
                      <Button
                        variant="success"
                        onClick={handleExecuteManualQuery}
                        disabled={documentsLoading || aiLoading || !selectedCollection}
                      >
                        Run Query
                      </Button>
                    </div>
                  </div>
                </Accordion.Body>
              </Accordion.Item>
            </Card>
          </Accordion>
          {selectedCollection && (
            <div className="pagination-controls d-flex align-items-center mb-3">
              <div className="me-auto d-flex align-items-center">
                <Form.Select
                  value={documentsPerPage}
                  onChange={handleDocumentsPerPageChange}
                  disabled={documentsLoading || aiLoading || filteredDocumentCount === 0}
                  className="me-2"
                  style={{ width: 'auto' }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </Form.Select>
                {hasQueryBeenExecuted && filteredDocumentCount > 0 && (
                  <Form.Text className="me-2">
                    Total {filteredDocumentCount} docs
                  </Form.Text>
                )}
              </div>
              <div className="d-flex">
                <Pagination>
                  <Pagination.Prev
                    onClick={() => handlePageSelect(currentPage - 1)}
                    disabled={currentPage === 1 || documentsLoading || aiLoading || filteredDocumentCount === 0}
                  >
                    <i className="bi bi-arrow-left"></i>
                  </Pagination.Prev>
                  {paginationItems}
                  <Pagination.Next
                    onClick={() => handlePageSelect(currentPage + 1)}
                    disabled={currentPage === totalPages || documentsLoading || aiLoading || filteredDocumentCount === 0}
                  >
                    <i className="bi bi-arrow-right"></i>
                  </Pagination.Next>
                </Pagination>
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
