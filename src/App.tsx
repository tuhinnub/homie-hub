/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { SocketProvider } from './context/SocketContext.js';
import { Auth } from './pages/Auth.js';
import { Workspace } from './pages/Workspace.js';
import { MessageSquare } from 'lucide-react';

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#05060f] flex flex-col items-center justify-center text-gray-100">
        <div className="relative flex flex-col items-center">
          {/* Animated pulsing outer rings */}
          <div className="absolute w-24 h-24 bg-indigo-500/10 rounded-full scale-125 animate-ping"></div>
          <div className="relative z-10 p-5 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-3xl border border-indigo-400/25 shadow-xl shadow-indigo-500/10 mb-4">
            <MessageSquare className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h2 className="font-display font-bold text-lg tracking-wide text-indigo-300">Entering HomieHub...</h2>
          <p className="text-xs text-gray-500 font-mono mt-2">Setting up private secure tunnels</p>
        </div>
      </div>
    );
  }

  return user ? <Workspace /> : <Auth />;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}
