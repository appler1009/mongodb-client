import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConnectionStatus, CollectionInfo, Document, MongoQueryParams } from '../types';
import { getDatabaseCollections, getCollectionDocuments } from '../api/backend';

interface DatabaseBrowserHookProps {
  currentStatus: ConnectionStatus | null;
  setError: (message: string | null) => void;
}

interface DatabaseBrowserState {
  collections: CollectionInfo[];
  selectedCollection: string | null;
  documents: Document[];
  totalDocumentCount: number;
  collectionsLoading: boolean;
  documentsLoading: boolean;
  currentPage: number;
  documentsPerPage: number;
  fetchCollections: () => Promise<void>;
  fetchDocuments: (params: MongoQueryParams, page: number, collectionName?: string) => Promise<void>;
  resetBrowserState: () => void;
  setSelectedCollection: (collectionName: string) => void;
  setCurrentPage: (page: number) => void;
  setDocumentsPerPage: (perPage: number) => void;
}

export const useDatabaseBrowser = ({ currentStatus, setError }: DatabaseBrowserHookProps): DatabaseBrowserState => {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalDocumentCount, setTotalDocumentCount] = useState<number>(0);
  const [collectionsLoading, setCollectionsLoading] = useState<boolean>(false);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [documentsPerPage, setDocumentsPerPage] = useState<number>(25);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const resetBrowserState = useCallback(() => {
    setCollections([]);
    setSelectedCollection(null);
    setDocuments([]);
    setTotalDocumentCount(0);
    setCurrentPage(1);
    setDocumentsPerPage(25);
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
      setTotalDocumentCount(0);
      setCurrentPage(1);
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

  const fetchDocuments = useCallback(async (params: MongoQueryParams, page: number, collectionName?: string) => {
    const targetCollection = collectionName || selectedCollection;
    if (!targetCollection) {
      setDocuments([]);
      setTotalDocumentCount(0);
      return;
    }
    setDocumentsLoading(true);
    setError(null);
    try {
      const skip = (page - 1) * documentsPerPage;
      const response = await getCollectionDocuments(targetCollection, documentsPerPage, skip, params);
      setDocuments(response.documents);
      setTotalDocumentCount(response.totalDocuments || 0);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`Failed to fetch documents for ${targetCollection}: ${errorMessage}`);
      setDocuments([]);
      setTotalDocumentCount(0);
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedCollection, documentsPerPage, setError]);

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

  return {
    collections,
    selectedCollection,
    documents,
    totalDocumentCount,
    collectionsLoading,
    documentsLoading,
    currentPage,
    documentsPerPage,
    fetchCollections,
    fetchDocuments,
    resetBrowserState,
    setSelectedCollection,
    setCurrentPage,
    setDocumentsPerPage,
  };
};
