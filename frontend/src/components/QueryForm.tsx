import React, { useState, useCallback } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Form, Button, Alert, ToggleButton, Accordion, Card } from 'react-bootstrap';
import type { MongoQueryParams } from '../types';
import { generateAIQuery } from '../api/backend';

interface QueryFormProps {
  selectedCollection: string | null;
  documentsLoading: boolean;
  setNotificationMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
  onQueryExecute: (params: MongoQueryParams) => void;
}

export const QueryForm: React.FC<QueryFormProps> = ({
  selectedCollection,
  documentsLoading,
  setNotificationMessage,
  setError,
  onQueryExecute,
}) => {
  const [promptText, setPromptText] = useState<string>('');
  const [queryParams, setQueryParams] = useState<MongoQueryParams>({ readPreference: 'primary' });
  const [queryError, setQueryError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [autoRunGeneratedQuery, setAutoRunGeneratedQuery] = useState<boolean>(true);
  const [shareSamples, setShareSamples] = useState<boolean>(false);
  const [accordionActiveKey, setAccordionActiveKey] = useState<string | null>('0');

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

  const handleShareSamplesToggleChange = (checked: boolean) => {
    setShareSamples(checked);
  };

  const handlePromptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerateAIQuery();
    }
  };

  const handleParamKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      const { generatedQuery, error: backendError } = await generateAIQuery(
        userPrompt,
        selectedCollection,
        shareSamples,
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
            onQueryExecute(formattedParams);
            setAccordionActiveKey(null);
            setNotificationMessage('Query Helper generated and executed query successfully!');
          } else {
            setNotificationMessage('Query Helper generated query successfully! Review and click "Run Query" to execute.');
          }
        } catch (parseError: unknown) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'An unexpected error occurred';
          setQueryError(`Query Helper generated invalid JSON: ${errorMessage}. Please check the Query Helper's output.`);
          setNotificationMessage('Query Helper generated invalid JSON. Manual correction might be needed.');
          setQueryParams({ readPreference: 'primary' });
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
  }, [selectedCollection, promptText, autoRunGeneratedQuery, shareSamples, setNotificationMessage, setError, onQueryExecute]);

  const handleExecuteManualQuery = () => {
    if (documentsLoading || aiLoading) {
      setQueryError('System is busy. Please wait for current operations to complete.');
      return;
    }
    const params = Object.keys(queryParams).length === 0 || (Object.keys(queryParams).length === 1 && queryParams.readPreference)
      ? { ...queryParams, query: '{}' }
      : queryParams;
    setQueryError(null);
    onQueryExecute(params);
    setAccordionActiveKey(null);
  };

  return (
    <>
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
                    <ToggleButton
                      id="attach-sample-toggle"
                      type="checkbox"
                      variant={shareSamples ? 'primary' : 'outline-secondary'}
                      checked={shareSamples}
                      value="1"
                      onChange={(e) => handleShareSamplesToggleChange(e.currentTarget.checked)}
                      disabled={aiLoading}
                      className="me-2"
                    >
                      <i className={shareSamples ? 'bi bi-check-circle me-1' : 'bi bi-x-circle me-1'}></i>
                      Share Samples
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                  onKeyDown={(e) => handleParamKeyDown(e as KeyboardEvent<HTMLTextAreaElement>)}
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
                    onClick={handleExecuteManualQuery}
                    disabled={documentsLoading || aiLoading || !selectedCollection}
                    title="Execute the manually entered query"
                  >
                    Run Query
                  </Button>
                </div>
              </div>
            </Accordion.Body>
          </Accordion.Item>
        </Card>
      </Accordion>
    </>
  );
};
