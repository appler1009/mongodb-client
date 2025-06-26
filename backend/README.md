# Backend Module for MongoDB Client Application
This directory (`backend/`) contains the main process (backend) code for the Electron-based MongoDB client application. It handles all Node.js-specific operations, including managing connections to MongoDB databases, querying data, and interacting with the file system for tasks like exporting documents.

## Overview
This backend module is responsible for:
- **Connection Management**: Storing, adding, updating, and deleting MongoDB connection configurations.
- **Dynamic Driver Selection**: Automatically connecting to MongoDB servers using the most compatible driver version (v6, v5, v4, or v3) based on the server's wire protocol version.
- **Database Interaction**: Fetching database collections, retrieving documents from collections, and executing queries.
- **Data Export**: Exporting collection documents to external files.
- **Inter-Process Communication (IPC)**: Communicating with the frontend (renderer process) of the Electron application.

## Key Technologies
- **Node.js**: The runtime environment for the backend.
- **TypeScript**: For type safety and better code maintainability.
- **Electron**: Provides desktop application capabilities.
- **MongoDB Node.js Driver**: Multiple versions are included and dynamically selected for broad compatibility with various MongoDB server versions.
- `electron-store`: Used for persisting connection configurations locally.

## Dependencies
The core dependencies for this backend module are listed in `backend/package.json`. Notable points include:
- `mongodb-wrapper-vX` packages: These are local packages (`file:../packages/mongodb-wrapper-vX`) that encapsulate specific major versions of the official MongoDB Node.js driver. This modular approach allows the application to dynamically choose the appropriate driver based on the connected MongoDB server's version.
- `electron-store@8.x.x`:
Important Note: The `electron-store` package is intentionally pinned to major version 8.x.x (e.g., ^8.0.0). This is due to known compatibility issues with newer versions of `electron-store` and certain TypeScript/packaging configurations, particularly when using specific module resolution or transpilation settings in Electron applications. For more context on such issues, refer to this Stack Overflow answer: https://stackoverflow.com/a/78452423.

## Scripts
To manage and build the backend module:
- `npm install`: Installs all required dependencies, including linking the local `mongodb-wrapper-vX` packages. Run this from the `backend/` directory.
- `npm run build`: Compiles the TypeScript code into JavaScript, outputting to the `dist/` directory.

## Getting Started (for Development)
1. **Install dependencies**: Ensure all local `mongodb-wrapper-vX` packages have been built (`npm install && npm run build` in each `packages/mongodb-wrapper-vX` directory first). Then, from this `backend/` directory, run:
```bash
npm install
```
2. **Build the backend**:
```bash
npm run build
```
3. **Run the Electron app**: Typically, the main Electron application in the project root will start this backend process. Refer to the root `README.md` for overall application startup instructions.
