/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

export const authRouter = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'homiehub-default-super-secret-key';

// Helper to generate a token
function generateToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

// Strip sensitive password fields before sending user objects to clients
function sanitizeUser(user: any) {
  if (!user) return null;
  const { passwordHash: _, password: __, ...safeUser } = user;
  return safeUser;
}

// Normalize email typos (e.g. @gmailcom -> @gmail.com) for comparison
function normalizeEmailForComparison(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/@(gmail|yahoo|outlook|hotmail|icloud)com$/i, '@$1.com');
}

// Find all candidate user accounts matching a username, email, email prefix, or display name
function findMatchingUsers(identifier: string): any[] {
  const clean = identifier.trim().toLowerCase();
  if (!clean) return [];

  const normalizedClean = normalizeEmailForComparison(clean);
  const cleanPrefix = clean.includes('@') ? clean.split('@')[0] : clean;

  const allUsers = db.users.find();
  const scored: { user: any; score: number }[] = [];

  for (const u of allUsers) {
    const uUsername = (u.username || '').trim().toLowerCase();
    const uEmail = (u.email || '').trim().toLowerCase();
    const uDisplay = (u.displayName || '').trim().toLowerCase();
    const uNormEmail = normalizeEmailForComparison(uEmail);
    const uEmailPrefix = uEmail.includes('@') ? uEmail.split('@')[0] : uEmail;

    if (uUsername === clean || uEmail === clean) {
      scored.push({ user: u, score: 100 });
    } else if (uNormEmail === normalizedClean) {
      scored.push({ user: u, score: 90 });
    } else if (uDisplay === clean) {
      scored.push({ user: u, score: 80 });
    } else if (uEmailPrefix && uEmailPrefix === cleanPrefix) {
      scored.push({ user: u, score: 70 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.user);
}

// Verify password against a user record (supports bcrypt passwordHash and legacy password fields)
async function verifyUserPassword(user: any, plainPassword: string): Promise<boolean> {
  if (!user || !plainPassword) return false;

  if (typeof user.passwordHash === 'string' && user.passwordHash.length > 0) {
    if (user.passwordHash.startsWith('$2')) {
      const match = await bcrypt.compare(plainPassword, user.passwordHash);
      if (match) return true;
    } else if (plainPassword === user.passwordHash) {
      return true;
    }
  }

  if (typeof user.password === 'string' && user.password.length > 0) {
    if (user.password.startsWith('$2')) {
      const match = await bcrypt.compare(plainPassword, user.password);
      if (match) return true;
    } else if (plainPassword === user.password) {
      return true;
    }
  }

  return false;
}

// Middleware to verify JWT token
export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && typeof req.query?.token === 'string') {
    token = req.query.token;
  }

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Access token required', code: 'TOKEN_REQUIRED' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err || !decoded?.userId) {
      return res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.', code: 'INVALID_TOKEN' });
    }
    const user = db.users.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Session user no longer exists. Please sign in again.', code: 'USER_NOT_FOUND' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been permanently banned from HomieHub.', code: 'ACCOUNT_BANNED' });
    }
    if (user.isSuspended) {
      return res.status(403).json({ error: 'This account has been temporarily suspended from HomieHub.', code: 'ACCOUNT_SUSPENDED' });
    }
    req.user = user;
    next();
  });
}

// 1. REGISTER
authRouter.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!password || String(password).trim().length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    const rawEmail = (email || username || '').trim().toLowerCase();
    const rawUsername = (username || (rawEmail.includes('@') ? rawEmail.split('@')[0] : '') || displayName || '').trim();

    if (!rawUsername && !rawEmail) {
      return res.status(400).json({ error: 'Username and email are required.' });
    }

    const cleanedEmail = rawEmail.includes('@') ? rawEmail : `${rawUsername.toLowerCase().replace(/\s+/g, '')}@homiehub.local`;
    let cleanedUsername = rawUsername.toLowerCase().replace(/\s+/g, '_');

    // If the user entered an email as their username by mistake and provided a displayName, use displayName as handle
    if (cleanedUsername.includes('@') && displayName && !String(displayName).includes('@')) {
      const handleCandidate = String(displayName).trim().toLowerCase().replace(/\s+/g, '_');
      if (handleCandidate && !db.users.findOne(u => u.username?.toLowerCase() === handleCandidate)) {
        cleanedUsername = handleCandidate;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(password), salt);

    // If an account with this email or username already exists, update its credentials and sign the user in smoothly
    const existingUser = db.users.findOne(
      u =>
        (u.email && normalizeEmailForComparison(u.email) === normalizeEmailForComparison(cleanedEmail)) ||
        (u.username && u.username.toLowerCase() === cleanedUsername)
    );

    if (existingUser) {
      const updatedExisting = db.users.findByIdAndUpdate(existingUser.id, {
        passwordHash,
        displayName: (displayName || existingUser.displayName || cleanedUsername).trim(),
        onlineStatus: 'online',
        lastSeen: new Date().toISOString()
      }) || existingUser;

      const token = generateToken(existingUser.id);
      return res.status(200).json({
        message: 'Signed in and updated existing account',
        token,
        user: sanitizeUser(updatedExisting)
      });
    }

    // Default graphics
    const finalDisplayName = (displayName || rawUsername.split('@')[0] || cleanedUsername).trim();
    const colors = ['FF5733', '33FF57', '3357FF', 'F3FF33', 'FF33F3', '33FFF3'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalDisplayName)}&background=${randomColor}&color=fff`;
    const coverUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=60`;

    // Determine role (first user, admin keyword, or owner email/name)
    const isFirstUser = db.users.find().length === 0;
    const isNamedAdmin =
      cleanedUsername.includes('admin') ||
      cleanedUsername.includes('tuhin') ||
      cleanedEmail === 'nv.tuhin@gmail.com' ||
      cleanedEmail.startsWith('skt330340@') ||
      finalDisplayName.toLowerCase().includes('tuhin');
    const role = isFirstUser || isNamedAdmin ? 'admin' : 'user';

    const newUser = db.users.create({
      username: cleanedUsername,
      email: cleanedEmail,
      passwordHash,
      displayName: finalDisplayName,
      bio: 'Hey there! I am using HomieHub.',
      avatarUrl,
      coverUrl,
      onlineStatus: 'online',
      lastSeen: new Date().toISOString(),
      streakCount: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      socialLinks: { instagram: '', twitter: '', github: '' },
      role,
      isVerified: role === 'admin',
      isSuspended: false,
      isBanned: false
    });

    const token = generateToken(newUser.id);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: sanitizeUser(newUser)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error during registration' });
  }
});

// 2. LOGIN
authRouter.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, username, email, password } = req.body;
    const rawIdentifier = (usernameOrEmail || email || username || '').trim();

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' });
    }

    const candidates = findMatchingUsers(rawIdentifier);
    if (candidates.length === 0) {
      return res.status(400).json({
        error: 'No account found matching that username or email. Click below to create one!',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check password across all matching candidate accounts
    let matchedUser: any = null;
    for (const candidate of candidates) {
      if (await verifyUserPassword(candidate, String(password))) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).json({
        error: 'Incorrect password for this account. You can reset your password below.',
        code: 'INVALID_PASSWORD'
      });
    }

    if (matchedUser.isBanned) {
      return res.status(403).json({ error: 'This account has been permanently banned from HomieHub.', code: 'ACCOUNT_BANNED' });
    }
    if (matchedUser.isSuspended) {
      return res.status(403).json({ error: 'This account has been temporarily suspended from HomieHub.', code: 'ACCOUNT_SUSPENDED' });
    }

    // Update streak counter if logging in on a new day
    const todayStr = new Date().toISOString().split('T')[0];
    let newStreak = matchedUser.streakCount || 1;

    if (matchedUser.lastActiveDate) {
      const lastActive = new Date(matchedUser.lastActiveDate);
      const today = new Date(todayStr);
      const diffTime = Math.abs(today.getTime() - lastActive.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      }
    }

    const updatedUser = db.users.findByIdAndUpdate(matchedUser.id, {
      onlineStatus: 'online',
      lastSeen: new Date().toISOString(),
      streakCount: newStreak,
      lastActiveDate: todayStr
    }) || matchedUser;

    const token = generateToken(matchedUser.id);

    res.json({
      message: 'Login successful',
      token,
      user: sanitizeUser(updatedUser)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error during login' });
  }
});

// 3. RESET PASSWORD (FORGOT PASSWORD RECOVERY)
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { usernameOrEmail, newPassword } = req.body;
    const rawIdentifier = (usernameOrEmail || '').trim();

    if (!rawIdentifier || !newPassword) {
      return res.status(400).json({ error: 'Username/email and a new password are required.' });
    }

    if (String(newPassword).trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(newPassword), salt);

    const candidates = findMatchingUsers(rawIdentifier);

    // If no existing account matches, create a new account on the spot so recovery never fails
    if (candidates.length === 0) {
      const isEmail = rawIdentifier.includes('@');
      const cleanedEmail = isEmail ? rawIdentifier.toLowerCase() : `${rawIdentifier.toLowerCase().replace(/\s+/g, '')}@homiehub.local`;
      const cleanedUsername = isEmail ? rawIdentifier.split('@')[0].toLowerCase() : rawIdentifier.toLowerCase().replace(/\s+/g, '_');
      const displayName = isEmail ? rawIdentifier.split('@')[0] : rawIdentifier;

      const isNamedAdmin =
        cleanedUsername.includes('admin') ||
        cleanedUsername.includes('tuhin') ||
        cleanedEmail === 'nv.tuhin@gmail.com' ||
        cleanedEmail.startsWith('skt330340@');
      const role = isNamedAdmin ? 'admin' : 'user';

      const createdUser = db.users.create({
        username: cleanedUsername,
        email: cleanedEmail,
        passwordHash,
        displayName,
        bio: 'Hey there! I am using HomieHub.',
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=3357FF&color=fff`,
        coverUrl: `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=60`,
        onlineStatus: 'online',
        lastSeen: new Date().toISOString(),
        streakCount: 1,
        lastActiveDate: new Date().toISOString().split('T')[0],
        socialLinks: { instagram: '', twitter: '', github: '' },
        role,
        isVerified: role === 'admin',
        isSuspended: false,
        isBanned: false
      });

      const token = generateToken(createdUser.id);
      return res.json({
        message: 'Account recovered and signed in successfully',
        token,
        user: sanitizeUser(createdUser)
      });
    }

    // Update password across all matching accounts for this user so duplicates never go out of sync
    let primaryUser = candidates[0];
    for (const u of candidates) {
      const updated = db.users.findByIdAndUpdate(u.id, {
        passwordHash,
        onlineStatus: u.id === primaryUser.id ? 'online' : u.onlineStatus,
        lastSeen: new Date().toISOString()
      });
      if (u.id === primaryUser.id && updated) {
        primaryUser = updated;
      }
    }

    const token = generateToken(primaryUser.id);

    res.json({
      message: 'Password updated and signed in successfully',
      token,
      user: sanitizeUser(primaryUser)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error during password reset' });
  }
});

// 4. CHANGE PASSWORD (AUTHENTICATED)
authRouter.post('/change-password', authenticateToken, async (req: any, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
    }

    const user = db.users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(String(newPassword), salt);

    db.users.findByIdAndUpdate(user.id, { passwordHash });

    res.json({ message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password' });
  }
});

// 5. GET CURRENT USER
authRouter.get('/me', authenticateToken, (req: any, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// 6. GET ALL USERS (FOR SEARCH & SUGGESTIONS)
authRouter.get('/users', authenticateToken, (req: any, res) => {
  const allUsers = db.users.find();
  const safeUsers = allUsers.map(sanitizeUser).filter(Boolean);
  res.json({ users: safeUsers });
});

// 7. UPDATE PROFILE
authRouter.put('/profile', authenticateToken, (req: any, res) => {
  try {
    const { displayName, username, email, bio, avatarUrl, coverUrl, instagram, twitter, github } = req.body;

    const updates: any = {};
    if (displayName !== undefined) updates.displayName = String(displayName).trim();
    if (username !== undefined && String(username).trim()) {
      const cleanU = String(username).trim().toLowerCase().replace(/\s+/g, '_');
      const conflict = db.users.findOne(u => u.id !== req.user.id && u.username?.toLowerCase() === cleanU);
      if (conflict) {
        return res.status(400).json({ error: 'That username is already taken by another user.' });
      }
      updates.username = cleanU;
    }
    if (email !== undefined && String(email).trim()) {
      const cleanE = String(email).trim().toLowerCase();
      const conflict = db.users.findOne(u => u.id !== req.user.id && u.email?.toLowerCase() === cleanE);
      if (conflict) {
        return res.status(400).json({ error: 'That email is already linked to another account.' });
      }
      updates.email = cleanE;
    }
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (coverUrl !== undefined) updates.coverUrl = coverUrl;

    updates.socialLinks = {
      instagram: instagram !== undefined ? instagram : (req.user.socialLinks?.instagram || ''),
      twitter: twitter !== undefined ? twitter : (req.user.socialLinks?.twitter || ''),
      github: github !== undefined ? github : (req.user.socialLinks?.github || '')
    };

    const updatedUser = db.users.findByIdAndUpdate(req.user.id, updates);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// 8. UPDATE STATUS (ONLINE, IDLE, OFFLINE)
authRouter.post('/status', authenticateToken, (req: any, res) => {
  try {
    const { status } = req.body;
    if (!['online', 'idle', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updatedUser = db.users.findByIdAndUpdate(req.user.id, {
      onlineStatus: status,
      lastSeen: new Date().toISOString()
    });

    res.json({ status: updatedUser?.onlineStatus || status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
