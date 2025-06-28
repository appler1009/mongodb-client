// frontend/src/pages/HomePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { ConnectionStatus } from '../types';
import { connectToMongo, disconnectFromMongo } from '../api/backend';

// Imports for components that HomePage will orchestrate
import { AppHeader } from '../components/AppHeader';
import { ConnectionManager } from './ConnectionManager';
import { DatabaseBrowser } from './DatabaseBrowser';

export const HomePage: React.FC = () => {
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // --- Notification Message Effect ---
  useEffect(() => {
    if (notificationMessage) {
      const timer = setTimeout(() => {
        setNotificationMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationMessage]);

  // --- Connection/Disconnection Handlers (managed by HomePage) ---
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
    <div className="home-page-container">
      <AppHeader
        currentStatus={currentStatus}
        onDisconnect={handleDisconnect}
      />

      {error && <div className="error-message">{error}</div>}

      {currentStatus?.database ? (
        // Render DatabaseBrowser when connected
        <DatabaseBrowser
          currentStatus={currentStatus}
          setNotificationMessage={setNotificationMessage}
          setError={setError}
        />
      ) : (
        // Render ConnectionManager when disconnected
        <ConnectionManager
          currentStatus={currentStatus}
          onConnect={handleConnect}
          setNotificationMessage={setNotificationMessage}
          setError={setError}
        />
      )}
    </div>
  );
};
