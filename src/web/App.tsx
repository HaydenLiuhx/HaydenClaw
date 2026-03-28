import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/auth.js';
import { LoginPage } from './pages/LoginPage.js';
import { Layout } from './components/Layout.js';

export function App() {
  const { token, checkAuth } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (token) {
      checkAuth().then(ok => {
        setAuthenticated(ok);
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, [token, checkAuth]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return <Layout />;
}
