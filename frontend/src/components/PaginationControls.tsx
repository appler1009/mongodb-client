import React from 'react';
import { Form, Pagination } from 'react-bootstrap';
import type { MongoQueryParams } from '../types';

interface PaginationControlsProps {
  currentPage: number;
  documentsPerPage: number;
  totalDocumentCount: number;
  documentsLoading: boolean;
  aiLoading: boolean;
  hasQueryBeenExecuted: boolean;
  queryParams: MongoQueryParams;
  onPageSelect: (page: number, queryParams: MongoQueryParams) => void;
  onDocumentsPerPageChange: (perPage: number) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  documentsPerPage,
  totalDocumentCount,
  documentsLoading,
  aiLoading,
  hasQueryBeenExecuted,
  queryParams,
  onPageSelect,
  onDocumentsPerPageChange,
}) => {
  const totalPages = Math.ceil(totalDocumentCount / documentsPerPage);
  const paginationItems = [];

  if (totalDocumentCount > 0) {
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
          onClick={() => onPageSelect(1, queryParams)}
          disabled={documentsLoading || aiLoading || 1 === currentPage}
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
          onClick={() => onPageSelect(page, queryParams)}
          disabled={documentsLoading || aiLoading || page === currentPage}
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
          onClick={() => onPageSelect(totalPages, queryParams)}
          disabled={documentsLoading || aiLoading || totalPages === currentPage}
        >
          {totalPages}
        </Pagination.Item>
      );
    }
  }

  return (
    <div className="pagination-controls d-flex align-items-center mb-3">
      <div className="me-auto d-flex align-items-center">
        <Form.Select
          value={documentsPerPage}
          onChange={(e) => onDocumentsPerPageChange(parseInt(e.target.value, 10))}
          disabled={documentsLoading || aiLoading || totalDocumentCount === 0}
          className="me-2"
          style={{ width: 'auto' }}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </Form.Select>
        {hasQueryBeenExecuted && totalDocumentCount > 0 && (
          <Form.Text className="me-2">
            Showing {Math.min(documentsPerPage, totalDocumentCount)} of {totalDocumentCount} docs
          </Form.Text>
        )}
      </div>
      <div className="d-flex">
        <Pagination>
          <Pagination.Prev
            onClick={() => onPageSelect(currentPage - 1, queryParams)}
            disabled={currentPage === 1 || documentsLoading || aiLoading || totalDocumentCount === 0}
          >
            <i className="bi bi-arrow-left"></i>
          </Pagination.Prev>
          {paginationItems}
          <Pagination.Next
            onClick={() => onPageSelect(currentPage + 1, queryParams)}
            disabled={currentPage === totalPages || documentsLoading || aiLoading || totalDocumentCount === 0}
          >
            <i className="bi bi-arrow-right"></i>
          </Pagination.Next>
        </Pagination>
      </div>
    </div>
  );
};
