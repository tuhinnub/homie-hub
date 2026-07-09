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
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// Middleware to verify JWT token
export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    const user = db.users.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  });
}

// 1. REGISTER
authRouter.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const cleanedUsername = username.trim().toLowerCase();
    const cleanedEmail = email.trim().toLowerCase();

    // Check if user exists
    const existingUser = db.users.findOne(u => u.username === cleanedUsername || u.email === cleanedEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Default graphics
    const colors = ['FF5733', '33FF57', '3357FF', 'F3FF33', 'FF33F3', '33FFF3'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || username)}&background=${randomColor}&color=fff`;
    const coverUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=60`;

    // Determine role (first user, username has admin, or target email is admin)
    const isFirstUser = db.users.find().length === 0;
    const isNamedAdmin = cleanedUsername.includes('admin') || cleanedEmail === 'nv.tuhin@gmail.com';
    const role = (isFirstUser || isNamedAdmin) ? 'admin' : 'user';

    // Create user
    const newUser = db.users.create({
      username: cleanedUsername,
      email: cleanedEmail,
      passwordHash,
      displayName: displayName || username,
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
    const { passwordHash: _, ...safeUser } = newUser;

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error during registration' });
  }
});

// 2. LOGIN
authRouter.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    const identifier = usernameOrEmail.trim().toLowerCase();

    // Find user
    const user = db.users.findOne(u => u.username === identifier || u.email === identifier);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username/email or password' });
    }

    // Compare passwords
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid username/email or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been permanently banned from HomieHub.' });
    }
    if (user.isSuspended) {
      return res.status(403).json({ error: 'This account has been temporarily suspended from HomieHub.' });
    }

    // Update streak counter if logging in on a new day
    const todayStr = new Date().toISOString().split('T')[0];
    let newStreak = user.streakCount || 0;
    
    if (user.lastActiveDate) {
      const lastActive = new Date(user.lastActiveDate);
      const today = new Date(todayStr);
      const diffTime = Math.abs(today.getTime() - lastActive.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1; // Reset streak
      }
    } else {
      newStreak = 1;
    }

    // Update user status
    const updatedUser = db.users.findByIdAndUpdate(user.id, {
      onlineStatus: 'online',
      lastSeen: new Date().toISOString(),
      streakCount: newStreak,
      lastActiveDate: todayStr
    });

    const token = generateToken(user.id);
    const { passwordHash: _, ...safeUser } = updatedUser;

    res.json({
      message: 'Login successful',
      token,
      user: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error during login' });
  }
});

// 3. GET CURRENT USER
authRouter.get('/me', authenticateToken, (req: any, res) => {
  const { passwordHash: _, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

// 4. GET ALL USERS (FOR SEARCH & SUGGESTIONS)
authRouter.get('/users', authenticateToken, (req: any, res) => {
  const allUsers = db.users.find();
  const safeUsers = allUsers.map(({ passwordHash: _, ...u }) => u);
  res.json({ users: safeUsers });
});

// 5. UPDATE PROFILE
authRouter.put('/profile', authenticateToken, (req: any, res) => {
  try {
    const { displayName, bio, avatarUrl, coverUrl, instagram, twitter, github } = req.body;
    
    const updates: any = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (coverUrl !== undefined) updates.coverUrl = coverUrl;
    
    updates.socialLinks = {
      instagram: instagram || req.user.socialLinks?.instagram || '',
      twitter: twitter || req.user.socialLinks?.twitter || '',
      github: github || req.user.socialLinks?.github || ''
    };

    const updatedUser = db.users.findByIdAndUpdate(req.user.id, updates);
    const { passwordHash: _, ...safeUser } = updatedUser;

    res.json({
      message: 'Profile updated successfully',
      user: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// 6. UPDATE STATUS (ONLINE, IDLE, OFFLINE)
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

    res.json({ status: updatedUser.onlineStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});
