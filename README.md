# mongodb-client

## Development

### Testing

Run all tests (backend and frontend):
```bash
npm test
```

Run tests and generate coverage report:
```bash
npm run test && npm run test-coverage
```

Run backend tests only:
```bash
npm run test-backend
```

Run frontend tests only:
```bash
npm run test-frontend
```

Generate coverage report from existing test results:
```bash
npm run test-coverage
```

View coverage reports:
```bash
# Open unified coverage report (backend + frontend)
open coverage/index.html

# Open backend coverage report only
open coverage/backend/lcov-report/index.html

# Open frontend coverage report only
open coverage/frontend/lcov-report/index.html
```

**Note**: The `test-coverage` command reads existing coverage reports generated from previous test runs. It does not run tests itself.

### Building

Build backend:
```bash
npm run build-backend
```

Build frontend:
```bash
npm run build-frontend
```

Build for production:
```bash
npm run package
```

### Development Server

Start development environment (frontend + electron):
```bash
npm run dev
```

Start frontend development server only:
```bash
npm run start-frontend-dev-server
```

## Features

- **Connection Management**: Add, edit, delete, and manage multiple MongoDB connections with support for different driver versions (v3, v4, v5, v6).
- **Database Browser**: Browse databases, collections, and documents with a user-friendly interface.
- **Document Viewer**: View documents in table or JSON format, with syntax highlighting and copy/export functionality.
- **Query Builder**: Execute custom MongoDB queries with support for find, sort, filter, projection, and aggregation pipelines.
- **AI-Powered Query Generation**: Generate MongoDB queries from natural language prompts using Grok AI.
- **Document Export**: Export collection documents to NDJSON format.
- **Pagination**: Navigate through large datasets with configurable page sizes.
- **Theme Support**: Light and dark theme modes, including system preference detection.
- **Cross-Platform Desktop App**: Built with Electron for Windows, macOS, and Linux.
- **Driver Fallback**: Automatically selects the appropriate MongoDB driver version based on the server.
- **Connection Cancellation**: Cancel ongoing connection attempts.
- **Document Count Display**: View document counts for each collection.
- **Schema Inference**: Analyze collection schemas from sample documents for query assistance.