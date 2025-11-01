import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseBrowser } from '../pages/DatabaseBrowser';
import { getDatabaseCollections, getCollectionDocuments } from '../api/backend';
import type { ConnectionStatus } from '../types';

// Mock the components
jest.mock('../components/CollectionBrowser', () => ({
  CollectionBrowser: ({ collections, selectedCollection, onSelectCollection, onDisconnect }: any) => (
    <div data-testid="collection-browser">
      <div data-testid="collections-list">
        {collections.map((col: any) => (
          <button
            key={col.name}
            data-testid={`collection-${col.name}`}
            onClick={() => onSelectCollection(col.name)}
            className={selectedCollection === col.name ? 'selected' : ''}
          >
            {col.name} ({col.documentCount})
          </button>
        ))}
      </div>
      <button data-testid="disconnect-btn" onClick={onDisconnect}>Disconnect</button>
    </div>
  ),
}));

jest.mock('../components/DocumentViewer', () => ({
  DocumentViewer: ({ documents, collectionName }: any) => (
    <div data-testid="document-viewer">
      <h3>Documents for {collectionName}</h3>
      <div data-testid="documents-list">
        {documents.map((doc: any, index: number) => (
          <div key={index} data-testid={`document-${index}`}>
            {JSON.stringify(doc)}
          </div>
        ))}
      </div>
    </div>
  ),
}));

jest.mock('../components/QueryForm', () => ({
  QueryForm: ({ onQueryExecute, onQueryParamsChange }: any) => (
    <div data-testid="query-form">
      <button
        data-testid="execute-query-btn"
        onClick={() => onQueryExecute({ readPreference: 'primary' })}
      >
        Execute Query
      </button>
      <button
        data-testid="change-params-btn"
        onClick={() => onQueryParamsChange({ readPreference: 'secondary' })}
      >
        Change Params
      </button>
    </div>
  ),
}));

jest.mock('../components/PaginationControls', () => ({
  PaginationControls: ({ onPageSelect, onDocumentsPerPageChange }: any) => (
    <div data-testid="pagination-controls">
      <button
        data-testid="page-2-btn"
        onClick={() => onPageSelect(2, { readPreference: 'primary' })}
      >
        Page 2
      </button>
      <button
        data-testid="per-page-50-btn"
        onClick={() => onDocumentsPerPageChange(50)}
      >
        50 per page
      </button>
    </div>
  ),
}));

const mockGetDatabaseCollections = getDatabaseCollections as jest.MockedFunction<typeof getDatabaseCollections>;
const mockGetCollectionDocuments = getCollectionDocuments as jest.MockedFunction<typeof getCollectionDocuments>;

describe('DatabaseBrowser', () => {
  const mockSetNotificationMessage = jest.fn();
  const mockSetError = jest.fn();
  const mockOnDisconnect = jest.fn();

  const defaultProps = {
    currentStatus: null,
    setNotificationMessage: mockSetNotificationMessage,
    setError: mockSetError,
    onDisconnect: mockOnDisconnect,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders message when no connection status', () => {
    render(<DatabaseBrowser {...defaultProps} />);

    expect(screen.getByText('Select a connection to browse databases.')).toBeTruthy();
  });

  it('renders message when connection status has no database', () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123' } as ConnectionStatus,
    };

    render(<DatabaseBrowser {...props} />);

    expect(screen.getByText('Select a connection to browse databases.')).toBeTruthy();
  });

  it('renders database browser when connected to database', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [
      { name: 'users', documentCount: 100 },
      { name: 'posts', documentCount: 50 },
    ];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    expect(screen.getByTestId('collection-browser')).toBeTruthy();
    expect(screen.getByTestId('query-form')).toBeTruthy();
  });

  it('loads collections on mount when database is available', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [
      { name: 'users', documentCount: 100 },
      { name: 'posts', documentCount: 50 },
    ];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    expect(screen.getByTestId('collection-users')).toBeTruthy();
    expect(screen.getByTestId('collection-posts')).toBeTruthy();
  });

  it('handles collection selection', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [
      { name: 'posts', documentCount: 50 },
      { name: 'users', documentCount: 100 },
    ];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // The first collection should be auto-selected
    expect(screen.getByTestId('collection-posts').className).toBe('selected');
    expect(screen.getByText('No documents to display. Run a query to fetch documents.')).toBeTruthy();
  });

  it('handles query execution', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [{ name: 'users', documentCount: 100 }];
    const mockDocuments = [{ _id: '1', name: 'John Doe' }];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);
    mockGetCollectionDocuments.mockResolvedValue({ documents: mockDocuments, totalDocuments: 1 });

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // Execute query
    await act(async () => {
      userEvent.click(screen.getByTestId('execute-query-btn'));
    });

    await waitFor(() => {
      expect(mockGetCollectionDocuments).toHaveBeenCalledTimes(1);
      expect(mockGetCollectionDocuments).toHaveBeenLastCalledWith('users', 25, 0, { readPreference: 'primary' });
    });
  });

  it('handles pagination', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [{ name: 'users', documentCount: 100 }];
    const mockDocuments = [{ _id: '1', name: 'John Doe' }];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);
    mockGetCollectionDocuments.mockResolvedValue({ documents: mockDocuments, totalDocuments: 100 });

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // Execute initial query to load documents
    await act(async () => {
      userEvent.click(screen.getByTestId('execute-query-btn'));
    });

    await waitFor(() => {
      expect(mockGetCollectionDocuments).toHaveBeenCalledTimes(1);
    });

    // Wait for documents to be loaded and pagination controls to appear
    await waitFor(() => {
      expect(screen.getByTestId('document-viewer')).toBeTruthy();
    });

    // Change page
    await act(async () => {
      userEvent.click(screen.getByTestId('page-2-btn'));
    });

    await waitFor(() => {
      expect(mockGetCollectionDocuments).toHaveBeenCalledTimes(2);
      expect(mockGetCollectionDocuments).toHaveBeenLastCalledWith('users', 25, 25, { readPreference: 'primary' });
    });
  });

  it('handles documents per page change', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [{ name: 'users', documentCount: 100 }];
    const mockDocuments = [{ _id: '1', name: 'John Doe' }];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);
    mockGetCollectionDocuments.mockResolvedValue({ documents: mockDocuments, totalDocuments: 100 });

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // Execute initial query to load documents
    await act(async () => {
      userEvent.click(screen.getByTestId('execute-query-btn'));
    });

    await waitFor(() => {
      expect(mockGetCollectionDocuments).toHaveBeenCalledTimes(1);
    });

    // Wait for documents to be loaded and pagination controls to appear
    await waitFor(() => {
      expect(screen.getByTestId('document-viewer')).toBeTruthy();
    });

    // Change documents per page
    await act(async () => {
      userEvent.click(screen.getByTestId('per-page-50-btn'));
    });

    await waitFor(() => {
      expect(mockGetCollectionDocuments).toHaveBeenCalledTimes(2);
      expect(mockGetCollectionDocuments).toHaveBeenNthCalledWith(2, 'users', 25, 0, { readPreference: 'primary' });
    });
  });

  it('handles disconnect', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb', name: 'test-connection' } as ConnectionStatus,
    };

    const mockCollections = [{ name: 'users', documentCount: 100 }];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // The disconnect button should be visible and clickable
    const disconnectBtn = screen.getByTestId('disconnect-btn');
    expect(disconnectBtn).toBeTruthy();

    // Click the disconnect button - the mock should be called directly
    fireEvent.click(disconnectBtn);

    // The mock should have been called
    expect(mockOnDisconnect).toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    mockGetDatabaseCollections.mockRejectedValue(new Error('API Error'));

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('Failed to fetch collections: API Error');
    });
  });

  it('shows loading states', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    // Mock a delay in API call
    mockGetDatabaseCollections.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 100)));

    render(<DatabaseBrowser {...props} />);

    // Initially should show loading (debounced, so might not show immediately)
    await waitFor(() => {
      expect(screen.getByText('Loading collections...')).toBeTruthy();
    }, { timeout: 200 });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // After loading completes, should not show loading anymore
    await waitFor(() => {
      expect(screen.queryByText('Loading collections...')).toBeNull();
    });
  });

  it('shows no documents message when collection has no documents', async () => {
    const props = {
      ...defaultProps,
      currentStatus: { message: 'Connected', connectionId: '123', database: 'testdb' } as ConnectionStatus,
    };

    const mockCollections = [{ name: 'emptyCollection', documentCount: 0 }];

    mockGetDatabaseCollections.mockResolvedValue(mockCollections);

    await act(async () => {
      render(<DatabaseBrowser {...props} />);
    });

    await waitFor(() => {
      expect(mockGetDatabaseCollections).toHaveBeenCalled();
    });

    // The collection is auto-selected but no documents are fetched automatically
    expect(screen.getByText('No documents to display. Run a query to fetch documents.')).toBeTruthy();
  });
});