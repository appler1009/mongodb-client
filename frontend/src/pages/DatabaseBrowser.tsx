import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import type { ConnectionStatus } from '../types';
import { CollectionBrowser } from '../components/CollectionBrowser';
import { DocumentViewer } from '../components/DocumentViewer';
import { QueryForm } from '../components/QueryForm';
import { PaginationControls } from '../components/PaginationControls';
import { useDatabaseBrowser } from '../components/useDatabaseBrowser';
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
  const {
    collections,
    selectedCollection,
    documents,
    totalDocumentCount,
    collectionsLoading,
    documentsLoading,
    currentPage,
    documentsPerPage,
    fetchDocuments,
    setSelectedCollection,
    setCurrentPage,
    setDocumentsPerPage,
  } = useDatabaseBrowser({ currentStatus, setError });

  const handleCollectionSelect = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setCurrentPage(1);
  };

  const handlePageSelect = (page: number) => {
    setCurrentPage(page);
    fetchDocuments({ readPreference: 'primary' });
  };

  const handleDocumentsPerPageChange = (perPage: number) => {
    setDocumentsPerPage(perPage);
    setCurrentPage(1);
    fetchDocuments({ readPreference: 'primary' });
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
              currentStatus={currentStatus}
              onSelectCollection={handleCollectionSelect}
              onDisconnect={onDisconnect}
            />
          )}
        </Col>
        <Col md={9} className="document-panel-right">
          <QueryForm
            selectedCollection={selectedCollection}
            documentsLoading={documentsLoading}
            setNotificationMessage={setNotificationMessage}
            setError={setError}
            onQueryExecute={fetchDocuments}
          />
          {selectedCollection && (
            <PaginationControls
              currentPage={currentPage}
              documentsPerPage={documentsPerPage}
              totalDocumentCount={totalDocumentCount}
              documentsLoading={documentsLoading}
              aiLoading={false}
              hasQueryBeenExecuted={totalDocumentCount > 0}
              onPageSelect={handlePageSelect}
              onDocumentsPerPageChange={handleDocumentsPerPageChange}
            />
          )}
          {documentsLoading ? (
            <p className="text-center mt-3">Loading documents...</p>
          ) : (
            <DocumentViewer
              collectionName={selectedCollection}
              documents={documents}
              currentPage={currentPage}
              documentsPerPage={documentsPerPage}
              queryParams={{ readPreference: 'primary' }}
              setNotificationMessage={setNotificationMessage}
              setError={setError}
            />
          )}
        </Col>
      </Row>
    </Container>
  );
};
