import React, { useState, useEffect, useCallback } from 'react';
import { Container, Alert } from 'react-bootstrap';
import type { ConnectionStatus } from '../types';
import { connectToMongo, disconnectFromMongo } from '../api/backend';
import { AppHeader } from '../components/AppHeader';
import { ConnectionManager } from './ConnectionManager';
import { DatabaseBrowser } from './DatabaseBrowser';

export const HomePage: React.FC = () => {
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (notificationMessage) {
      const timer = setTimeout(() => {
        setNotificationMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationMessage]);

  const handleConnect = useCallback(async (id: string) => {
    setError(null);
    try {
      const status = await connectToMongo(id);
      setCurrentStatus(status);
      setNotificationMessage(`Connected to ${status.database || 'MongoDB'}!`);
    } catch (err: any) {
      setCurrentStatus(null);
      setError(`Failed to connect: ${err.message}`);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setError(null);
    let disconnectedDbName = '';
    if (currentStatus?.database) {
      disconnectedDbName = currentStatus.database;
    }
    try {
      await disconnectFromMongo();
      setCurrentStatus(null);
      setNotificationMessage(`Disconnected from ${disconnectedDbName || 'MongoDB'}!`);
    } catch (err: any) {
      setError(`Failed to disconnect from ${disconnectedDbName || 'MongoDB'}: ${err.message}`);
    }
  }, [currentStatus]);

  return (
    <Container fluid className="home-page-container py-3">
      <AppHeader />
      {error && (
        <Alert variant="danger" className="mt-3 text-center">
          {error}
        </Alert>
      )}
      {notificationMessage && (
        <Alert variant="primary" className="mt-3 text-center">
          {notificationMessage}
        </Alert>
      )}
      {currentStatus?.database ? (
        <DatabaseBrowser
          currentStatus={currentStatus}
          setNotificationMessage={setNotificationMessage}
          setError={setError}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <ConnectionManager
          currentStatus={currentStatus}
          onConnect={handleConnect}
          setNotificationMessage={setNotificationMessage}
          setError={setError}
        />
      )}
    </Container>
  );
};
