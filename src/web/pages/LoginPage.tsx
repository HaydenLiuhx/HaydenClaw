import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/auth.js';

export function LoginPage() {
  const { initialized, loading, error, checkStatus, setup, login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    try {
      if (initialized === false) {
        await setup(username.trim(), password.trim());
      } else {
        await login(username.trim(), password.trim());
      }
    } catch { /* error shown via store */ }
  };

  const isSetup = initialized === false;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">HaydenClaw</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isSetup ? 'Create your admin account' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              placeholder="Enter username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              placeholder="Enter password"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full bg-primary-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50"
          >
            {loading ? 'Loading...' : isSetup ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
