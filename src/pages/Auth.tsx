/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Sparkles, MessageSquare, Flame, Shield, Users } from 'lucide-react';
import { motion } from 'motion/react';

export const Auth: React.FC = () => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const result = await login(email || username, password);
        if (!result.success) setError(result.error || 'Invalid credentials');
      } else {
        const result = await register(username, email, password, displayName);
        if (!result.success) setError(result.error || 'Registration failed');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mesh text-gray-100 flex flex-col justify-center items-center p-4 overflow-hidden relative">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-glow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-glow"></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-cyan-400 to-purple-600 rounded-2xl shadow-lg shadow-cyan-500/20 mb-4 border border-cyan-400/20">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display font-extrabold text-4xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent">
            HomieHub
          </h1>
          <p className="text-gray-400 mt-2 text-sm max-w-xs mx-auto">
            A private social lounge to chat, call, share memories, and collaborate with your homies.
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass-card rounded-3xl p-8 relative overflow-hidden">
          <div className="flex justify-around border-b border-gray-800 pb-4 mb-6">
            <button
              onClick={() => { setIsLogin(true); setError(null); }}
              className={`font-display font-semibold pb-2 transition-all relative ${
                isLogin ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign In
              {isLogin && (
                <motion.div 
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                />
              )}
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(null); }}
              className={`font-display font-semibold pb-2 transition-all relative ${
                !isLogin ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign Up
              {!isLogin && (
                <motion.div 
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                />
              )}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Display Name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. johndoe"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                {isLogin ? 'Username or Email' : 'Email Address'}
              </label>
              <input
                type={isLogin ? 'text' : 'email'}
                required
                value={isLogin ? (username || email) : email}
                onChange={(e) => {
                  if (isLogin) {
                    setUsername(e.target.value);
                    setEmail(e.target.value);
                  } else {
                    setEmail(e.target.value);
                  }
                }}
                placeholder={isLogin ? "your_username or mail@domain.com" : "mail@domain.com"}
                className="w-full glass-input rounded-xl px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full glass-input rounded-xl px-4 py-3 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-display font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>{isLogin ? 'Login to HomieHub' : 'Create Account'}</span>
                  <Sparkles className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Core Feature Highlights */}
          <div className="mt-6 pt-6 border-t border-gray-800/60 flex justify-between text-[11px] text-gray-500 font-mono">
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-cyan-400" /> Friends Lounge</span>
            <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" /> Daily Streaks</span>
            <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Gemini AI</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
