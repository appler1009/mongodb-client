// src/utils/disconnectMongo.ts
import { Logger } from 'pino';
import { DatabaseService } from '../services/DatabaseService';
import {
  getActiveMongoClient,
  setActiveMongoClient,
  setActiveDb,
  setActiveConnectionId,
  setActiveDatabaseName,
  setActiveDriverVersion,
} from '../index';

export async function disconnectMongo(dbService: DatabaseService, logger: Logger) {
  console.log(`disconnectMongoInternal original called`);
  const activeMongoClient = getActiveMongoClient();
  if (activeMongoClient) {
    logger.debug('Closing existing MongoDB connection...');
    await activeMongoClient.close();
    setActiveMongoClient(null);
    setActiveDb(null);
    setActiveConnectionId(undefined);
    setActiveDatabaseName(undefined);
    setActiveDriverVersion(null);
    dbService.setActiveDb(null);
    logger.debug('MongoDB connection closed.');
  }
}
