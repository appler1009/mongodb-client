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

### Release Process

When releasing a new version of the application:

1. **Merge feature branches to master**:
   ```bash
   git checkout master
   git merge feature-branch-name
   # Repeat for all feature branches to be included
   ```

2. **Update version number**:
   ```bash
   # Use npm version to update package.json and create git tag
   npm version patch    # for bug fixes (1.0.40 -> 1.0.41)
   npm version minor    # for new features (1.0.40 -> 1.1.0)
   npm version major    # for breaking changes (1.0.40 -> 2.0.0)

   # Or manually edit package.json if preferred
   # The version should follow semantic versioning (major.minor.patch)
   ```

3. **Commit and tag** (if using manual version update):
   ```bash
   git add package.json
   git commit -m "release: bump version to x.x.x"
   git tag vx.x.x  # e.g., v1.0.41
   git push origin master --tags
   ```

   **Note**: If using `npm version`, it automatically creates the commit and tag, so skip to step 4.

5. **GitHub Actions will automatically**:
   - Build the application for all platforms (Windows, macOS, Linux)
   - Create GitHub releases with the built binaries
   - Upload release assets

**Note**: Ensure all tests pass before merging and that the version number accurately reflects the changes (patch for bug fixes, minor for new features, major for breaking changes).

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