/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Sparkles, MessageSquare, Flame, Shield, Users, Eye, EyeOff, KeyRound, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

type AuthMode = 'login' | 'register' | 'reset';

export const Auth: React.FC = () => {
  const { login, register, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');

  // Separate state for Sign In vs Sign Up vs Reset Password so fields never collide
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const [resetIdentifier, setResetIdentifier] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // Switch between modes cleanly and pre-populate helpful fields without corrupting state
  const switchToMode = (targetMode: AuthMode) => {
    setError(null);
    setErrorCode(undefined);

    if (targetMode === 'register' && loginIdentifier.trim()) {
      const clean = loginIdentifier.trim();
      if (clean.includes('@')) {
        if (!email) setEmail(clean);
        const prefix = clean.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (!username && prefix) setUsername(prefix);
        if (!displayName && prefix) setDisplayName(prefix);
      } else {
        if (!username) setUsername(clean.toLowerCase().replace(/\s+/g, '_'));
        if (!displayName) setDisplayName(clean);
      }
      if (!registerPassword && loginPassword) {
        setRegisterPassword(loginPassword);
      }
    } else if (targetMode === 'reset') {
      const candidate = loginIdentifier.trim() || email.trim() || username.trim();
      if (candidate && !resetIdentifier) {
        setResetIdentifier(candidate);
      }
    } else if (targetMode === 'login') {
      const candidate = email.trim() || username.trim() || resetIdentifier.trim();
      if (candidate && !loginIdentifier) {
        setLoginIdentifier(candidate);
      }
    }

    setMode(targetMode);
  };

  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    if (!usernameTouched) {
      const suggested = val.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      setUsername(suggested);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorCode(undefined);
    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await login(loginIdentifier, loginPassword);
        if (!result.success) {
          setError(result.error || 'Invalid credentials');
          setErrorCode(result.code);
        }
      } else if (mode === 'register') {
        const finalUsername = username.trim() || email.split('@')[0] || displayName.trim();
        const result = await register(finalUsername, email, registerPassword, displayName || finalUsername);
        if (!result.success) {
          setError(result.error || 'Registration failed');
          setErrorCode(result.code);
        }
      } else if (mode === 'reset') {
        const result = await resetPassword(resetIdentifier, newPassword);
        if (!result.success) {
          setError(result.error || 'Password reset failed');
          setErrorCode(result.code);
        }
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
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-glow pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-glow pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
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
              type="button"
              onClick={() => switchToMode('login')}
              className={`font-display font-semibold pb-2 transition-all relative text-sm ${
                mode === 'login' ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign In
              {mode === 'login' && (
                <motion.div
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => switchToMode('register')}
              className={`font-display font-semibold pb-2 transition-all relative text-sm ${
                mode === 'register' ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Sign Up
              {mode === 'register' && (
                <motion.div
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => switchToMode('reset')}
              className={`font-display font-semibold pb-2 transition-all relative text-sm ${
                mode === 'reset' ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Reset Password
              {mode === 'reset' && (
                <motion.div
                  layoutId="activeTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                />
              )}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl space-y-2">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {errorCode === 'USER_NOT_FOUND' && mode !== 'register' && (
                <button
                  type="button"
                  onClick={() => switchToMode('register')}
                  className="w-full py-2 px-3 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all"
                >
                  <span>Create a new account with these details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {(errorCode === 'INVALID_PASSWORD' || errorCode === 'EMAIL_EXISTS') && mode !== 'reset' && (
                <button
                  type="button"
                  onClick={() => switchToMode('reset')}
                  className="w-full py-2 px-3 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Reset password & sign in now</span>
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SIGN IN FORM */}
            {mode === 'login' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Username, Email, or Display Name
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. tuhin or mail@domain.com"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchToMode('reset')}
                      className="text-[11px] text-cyan-400 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full glass-input rounded-xl px-4 py-3 pr-11 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* SIGN UP FORM */}
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => handleDisplayNameChange(e.target.value)}
                    placeholder="e.g. Tuhin"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Username Handle
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsernameTouched(true);
                      setUsername(e.target.value);
                    }}
                    placeholder="e.g. tuhin"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mail@domain.com"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      autoComplete="new-password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      className="w-full glass-input rounded-xl px-4 py-3 pr-11 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* RESET PASSWORD FORM */}
            {mode === 'reset' && (
              <>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Enter your existing username, email, or display name and choose a new password to immediately recover and sign in to your account.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Username, Email, or Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="e.g. tuhin or mail@domain.com"
                    className="w-full glass-input rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full glass-input rounded-xl px-4 py-3 pr-11 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-display font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>
                    {mode === 'login'
                      ? 'Login to HomieHub'
                      : mode === 'register'
                      ? 'Create Account'
                      : 'Reset Password & Login'}
                  </span>
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
