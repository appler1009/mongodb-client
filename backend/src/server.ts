// backend/src/server.ts
import express from 'express';
import pino from 'pino';
import dotenv from 'dotenv';
import { MongoClient, Db } from 'mongodb';
import { ConnectionService } from './services/ConnectionService';
import { ConnectionConfig } from './types';

dotenv.config();

const app = express();
// Configure pino-pretty for development. For production, you might remove transport.
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Global state for active MongoDB connection ---
let activeMongoClient: MongoClient | null = null;
let activeDb: Db | null = null;
let activeConnectionId: string | null = null; // To keep track of which connection config is active

// Initialize ConnectionService
const connectionService = new ConnectionService(logger);

// Helper function to disconnect
async function disconnectFromMongo() {
  if (activeMongoClient) {
    logger.info('Closing existing MongoDB connection...');
    await activeMongoClient.close();
    activeMongoClient = null;
    activeDb = null;
    activeConnectionId = null;
    logger.info('MongoDB connection closed.');
  }
}

// --- API Routes ---

// Health Check
app.get('/api/health', (req, res) => {
  logger.info('Health check request received.');
  res.status(200).json({ status: 'ok', message: 'Backend is running!' });
});

// Get all saved connections
app.get('/api/connections', async (req, res) => {
  try {
    const connections = await connectionService.getConnections();
    res.json(connections);
  } catch (error) {
    logger.error({ error }, 'Failed to get connections');
    res.status(500).json({ message: 'Failed to retrieve connections', error: (error as Error).message });
  }
});

// Add a new connection
app.post('/api/connections', async (req, res) => {
  try {
    const newConnection: ConnectionConfig = req.body;
    const addedConnection = await connectionService.addConnection(newConnection);
    res.status(201).json(addedConnection);
    logger.info({ id: addedConnection.id, name: addedConnection.name }, 'New connection added');
  } catch (error) {
    logger.error({ error, body: req.body }, 'Failed to add new connection');
    res.status(400).json({ message: 'Failed to add connection', error: (error as Error).message });
  }
});

// Update an existing connection
app.put('/api/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedConnection: ConnectionConfig = req.body;
    const result = await connectionService.updateConnection(id, updatedConnection);
    if (result) {
      // If the updated connection is the active one, disconnect it
      if (activeConnectionId === id) {
        await disconnectFromMongo();
        logger.warn(`Updated active connection ${id}. Disconnected existing connection.`);
      }
      res.json(result);
      logger.info({ id }, 'Connection updated');
    } else {
      res.status(404).json({ message: 'Connection not found' });
    }
  } catch (error) {
    logger.error({ error, params: req.params, body: req.body }, 'Failed to update connection');
    res.status(400).json({ message: 'Failed to update connection', error: (error as Error).message });
  }
});

// Delete a connection
app.delete('/api/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await connectionService.deleteConnection(id);
    if (deleted) {
      // If the deleted connection was the active one, disconnect it
      if (activeConnectionId === id) {
        await disconnectFromMongo();
        logger.warn(`Deleted active connection ${id}. Disconnected existing connection.`);
      }
      res.status(204).send(); // No content for successful deletion
      logger.info({ id }, 'Connection deleted');
    } else {
      res.status(404).json({ message: 'Connection not found' });
    }
  } catch (error) {
    logger.error({ error, params: req.params }, 'Failed to delete connection');
    res.status(500).json({ message: 'Failed to delete connection', error: (error as Error).message });
  }
});

// Disconnect from the current MongoDB instance
app.post('/api/disconnect', async (req, res) => {
  try {
    await disconnectFromMongo();
    logger.info('Successfully disconnected from MongoDB.');
    res.status(200).json({ message: 'Successfully disconnected from MongoDB.' });
  } catch (error) {
    logger.error({ error }, 'Failed to disconnect from MongoDB');
    res.status(500).json({ message: 'Failed to disconnect from MongoDB', error: (error as Error).message });
  }
});

app.post('/api/connect', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ message: 'Connection ID is required.' });
  }

  try {
    // Disconnect any existing connection first
    if (activeMongoClient) {
      await disconnectFromMongo();
    }

    const connectionConfig = await connectionService.getConnectionById(id);
    if (!connectionConfig) {
      return res.status(404).json({ message: 'Connection configuration not found.' });
    }

    const uri = connectionConfig.uri; // Assuming URI is complete, or build it from parts

    logger.info(`Attempting to connect to MongoDB using ID: ${id}`);
    const client = new MongoClient(uri);
    await client.connect();
    activeMongoClient = client;
    activeDb = client.db(connectionConfig.database); // Default to specified database
    activeConnectionId = id;

    logger.info(`Successfully connected to MongoDB: ${connectionConfig.name}`);
    res.status(200).json({
      message: 'Successfully connected to MongoDB.',
      connectionId: activeConnectionId,
      database: connectionConfig.database
    });
  } catch (error) {
    logger.error({ error, connectionId: id }, 'Failed to connect to MongoDB');
    res.status(500).json({ message: 'Failed to connect to MongoDB', error: (error as Error).message });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, req: { method: req.method, url: req.url, body: req.body } }, 'Unhandled API error');
  res.status(500).json({ message: 'An unexpected server error occurred.', error: err.message });
});

app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`);
  logger.info(`Access health check at http://localhost:${PORT}/api/health`);
});
