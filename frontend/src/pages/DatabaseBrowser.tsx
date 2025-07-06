import React, { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Container, Row, Col, Form, Button, Alert, ToggleButton, Pagination, Accordion, Card } from 'react-bootstrap';
import { z } from 'zod';
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

// Zod schema for MongoQueryParams
const MongoQueryParamsSchema = z.object({
  query: z.record(z.any()).optional(),
  sort: z
    .record(
      z.union([
        z.number().refine(val => val === 1 || val === -1, {
          message: 'Sort value must be 1 or -1',
        }),
        z.enum(['asc', 'desc']),
      ]).transform(val => (val === 'asc' ? 1 : val === 'desc' ? -1 : val))
    )
    .optional(),
  filter: z.record(z.any()).optional(),
  pipeline: z.array(z.record(z.any())).optional(),
  projection: z.record(z.any()).optional(),
  collation: z
    .object({
      locale: z.string(),
      caseLevel: z.boolean().optional(),
      caseFirst: z.enum(['upper', 'lower', 'off']).optional(),
      strength: z.number().min(1).max(5).optional(),
      numericOrdering: z.boolean().optional(),
      alternate: z.enum(['non-ignorable', 'shifted']).optional(),
      maxVariable: z.enum(['punct', 'space']).optional(),
      backwards: z.boolean().optional(),
      normalization: z.boolean().optional(),
    })
    .optional(),
  hint: z.union([z.record(z.any()), z.string()]).optional(),
  readPreference: z.enum(['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest']).optional(),
}).strict();

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
  const [queryText, setQueryText] = useState<string>('{}');
  const [parsedParams, setParsedParams] = useState<MongoQueryParams>({});
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasQueryBeenExecuted, setHasQueryBeenExecuted] = useState<boolean>(false);
  const [autoRunGeneratedQuery, setAutoRunGeneratedQuery] = useState<boolean>(true);
  const [accordionActiveKey, setAccordionActiveKey] = useState<string[]>(['0', '1']);

  const totalDocuments = hasQueryBeenExecuted

 ? filteredDocumentCount : 0;
  const totalPages = Math.ceil(totalDocuments / documentsPerPage);

  const resetBrowserState = useCallback(() => {
    setCollections([]);
    setSelectedCollection(null);
    setDocuments([]);
    setFilteredDocumentCount(0);
    setCurrentPage(1);
    setPromptText('');
    setQueryText('{}');
    setParsedParams({});
    setQueryError(null);
    setHasQueryBeenExecuted(false);
    setAiLoading(false);
    setAutoRunGeneratedQuery(true);
    setAccordionActiveKey(['0', '1']);
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
      setQueryText('{}');
      setParsedParams({});
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

  const fetchDocuments = useCallback(async () => {
    if (!selectedCollection) {
      setDocuments([]);
      setFilteredDocumentCount(0);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
    try {
      const skip = (currentPage - 1) * documentsPerPage;
      const response = await getCollectionDocuments(selectedCollection, documentsPerPage, skip, parsedParams);
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
  }, [selectedCollection, currentPage, documentsPerPage, parsedParams, setError]);

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
      setFilteredDocumentCount(0);
    }
  }, [selectedCollection, currentPage, documentsPerPage, parsedParams, hasQueryBeenExecuted, fetchDocuments]);

  useEffect(() => {
    if (hasQueryBeenExecuted && documents.length > 0) {
      setAccordionActiveKey([]);
    }
  }, [hasQueryBeenExecuted, documents]);

  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setCurrentPage(1);
    setDocuments([]);
    setFilteredDocumentCount(0);
    setPromptText('');
    setQueryText('{}');
    setParsedParams({});
    setQueryError(null);
    setHasQueryBeenExecuted(false);
    setAccordionActiveKey(['0', '1']);
  };

  const handlePageSelect = (page: number) => {
    setCurrentPage(page);
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

  const validateMongoQueryParams = (params: object): MongoQueryParams | null => {
    try {
      const result = MongoQueryParamsSchema.safeParse(params);
      if (!result.success) {
        const errorMessage = result.error.errors
          .map(err => `${err.path.join('.')} - ${err.message}`)
          .join('; ');
        setQueryError(`Invalid MongoQueryParams: ${errorMessage}`);
        return null;
      }
      return result.data as MongoQueryParams;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred';
      setQueryError(`Invalid MongoQueryParams: ${errorMessage}`);
      return null;
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
        setQueryText(JSON.stringify(JSON.parse(generatedQuery), null, 2)); // Always set queryText with generated query
        try {
          const parsedGenerated = JSON.parse(generatedQuery);
          const validatedParams = validateMongoQueryParams(parsedGenerated);
          if (validatedParams) {
            if (autoRunGeneratedQuery) {
              setParsedParams(validatedParams);
              setCurrentPage(1);
              setHasQueryBeenExecuted(true);
              setNotificationMessage('Query Helper generated and executed query successfully!');
            } else {
              setParsedParams({});
              setNotificationMessage('Query Helper generated query successfully! Review and click "Run Query" to execute.');
              setHasQueryBeenExecuted(false);
            }
          } else {
            setParsedParams({});
            setNotificationMessage('Query Helper generated query with validation errors. Review and fix in the query editor.');
            setHasQueryBeenExecuted(false);
          }
        } catch (parseError: unknown) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'An unexpected error occurred';
          setQueryError(`Query Helper generated invalid JSON: ${errorMessage}. Please check the Query Helper's output.`);
          setNotificationMessage('Query Helper generated invalid JSON. Manual correction might be needed.');
          setParsedParams({});
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
  }, [selectedCollection, promptText, autoRunGeneratedQuery, setNotificationMessage, setError]);

  const handleExecuteManualQuery = () => {
    if (documentsLoading || aiLoading) {
      setQueryError('System is busy. Please wait for current operations to complete.');
      return;
    }
    try {
      const parsed = JSON.parse(queryText);
      const validatedParams = validateMongoQueryParams(parsed);
      if (validatedParams) {
        setParsedParams(validatedParams);
        setCurrentPage(1);
        setQueryError(null);
        setHasQueryBeenExecuted(true);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unexpected error occurred';
      setQueryError(`Invalid JSON: ${errorMessage}. Please ensure it's a valid MongoQueryParams object (e.g., {"query": {"field": "value"}, "sort": {"field": 1}}).`);
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
      const { success, filePath, error: exportError } = await exportCollectionDocuments(selectedCollection, parsedParams);
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

  // Generate pagination items with limited range
  const maxPageButtons = 5; // Show current page ±2
  const paginationItems = [];
  if (filteredDocumentCount > 0) {
    let startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

    // Adjust startPage if endPage is at totalPages
    if (endPage === totalPages) {
      startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    // Add first page and ellipsis if needed
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

    // Add page range
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

    // Add last page and ellipsis if needed
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
          <Accordion activeKey={accordionActiveKey} onSelect={(key) => setAccordionActiveKey(key ? [key.toString()] : [])} className="mb-4">
            <Card>
              <Accordion.Item eventKey="0">
                <Accordion.Header>Query Helper</Accordion.Header>
                <Accordion.Body>
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
                </Accordion.Body>
              </Accordion.Item>
            </Card>
            <Card>
              <Accordion.Item eventKey="1">
                <Accordion.Header>Find Query (JSON)</Accordion.Header>
                <Accordion.Body>
                  <Form.Control
                    as="textarea"
                    className="query-editor mb-2"
                    value={queryText}
                    onChange={handleQueryTextChange}
                    onKeyDown={handleQueryKeyDown}
                    placeholder='Enter MongoDB query JSON (e.g., {"query": {"age": {"$gt": 30}}, "sort": {"name": 1}, "collation": {"locale": "en"}})'
                    rows={5}
                    disabled={documentsLoading || aiLoading}
                  />
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
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || documentsLoading || aiLoading || filteredDocumentCount === 0}
                  >
                    <i className="bi bi-arrow-left"></i>
                  </Pagination.Prev>
                  {paginationItems}
                  <Pagination.Next
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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
