import React, { useState, useEffect, useCallback } from 'react';
import { Container, Toast, ToastContainer } from 'react-bootstrap';
import type { ConnectionStatus } from '../types';
import { connectToMongo, disconnectFromMongo } from '../api/backend';
import { AppHeader } from '../components/AppHeader';
import { ConnectionManager } from './ConnectionManager';
import { DatabaseBrowser } from './DatabaseBrowser';

export const HomePage: React.FC = () => {
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    if (notificationMessage) {
      setShowNotification(true);
      const timer = setTimeout(() => {
        setShowNotification(false);
        setNotificationMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowNotification(false);
    }
  }, [notificationMessage]);

  const handleConnect = useCallback(async (connectionId: string, attemptId: string) => {
    setError(null);
    try {
      const status = await connectToMongo(connectionId, attemptId);
      setCurrentStatus(status);
      setNotificationMessage(`Connected to ${status.database || 'MongoDB'}!`);
      return status;
    } catch (err: unknown) {
      setCurrentStatus(null);
      if (err instanceof Error) {
        setError(`Failed to connect: ${err.message}`);
      } else {
        setError('Failed to connect: Unknown error');
      }
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(`Failed to disconnect from ${disconnectedDbName || 'MongoDB'}: ${err.message}`);
      } else {
        setError(`Failed to disconnect from ${disconnectedDbName || 'MongoDB'}: Unknown error`);
      }
    }
  }, [currentStatus]);

  return (
    <Container fluid className="home-page-container py-3">
      <AppHeader />
      <ToastContainer position="top-center" className="p-3">
        {error && (
          <Toast
            show={!!error}
            onClose={() => setError(null)}
            delay={5000}
            autohide
          >
            <Toast.Body className="bg-danger text-white text-center p-2">
              {error}
            </Toast.Body>
          </Toast>
        )}
        {notificationMessage && (
          <Toast
            show={showNotification}
            onClose={() => setShowNotification(false)}
            delay={3000}
            autohide
          >
            <Toast.Body className="bg-secondary text-white text-center p-2">
              {notificationMessage}
            </Toast.Body>
          </Toast>
        )}
      </ToastContainer>
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
