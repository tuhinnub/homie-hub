/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { connectDB, db } from './server/db.js';
import { authRouter } from './server/auth.js';
import { chatsRouter } from './server/chats.js';
import { aiRouter } from './server/ai.js';
import { adminRouter } from './server/admin.js';

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  // Attach Socket.IO to the Server
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Express Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware to audit all incoming traffic
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logLine = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms) - IP: ${req.ip}\n`;
      try {
        fs.appendFileSync(path.join(process.cwd(), 'data', 'request_logs.txt'), logLine);
      } catch (e) {
        console.error('Failed to write request log:', e);
      }
    });
    next();
  });

  // Attempt database connection
  await connectDB();

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/admin', adminRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // ----------------------------------------------------
  // Socket.IO Real-Time Core Event Handlers
  // ----------------------------------------------------
  
  const activeSockets = new Map<string, string>(); // socketId -> userId

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // User Identifies
    socket.on('identify', (userId: string) => {
      activeSockets.set(socket.id, userId);
      // Set user status to online
      db.users.findByIdAndUpdate(userId, { onlineStatus: 'online', lastSeen: new Date().toISOString() });
      io.emit('user-status-change', { userId, status: 'online' });
      console.log(`👤 User identified: ${userId} on socket ${socket.id}`);
    });

    // Join room (chat or group)
    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
      console.log(`🚪 Socket ${socket.id} joined room: ${roomId}`);
    });

    socket.on('leave-room', (roomId: string) => {
      socket.leave(roomId);
      console.log(`🚪 Socket ${socket.id} left room: ${roomId}`);
    });

    // Message sending & distribution
    socket.on('send-message', (data: {
      id: string;
      chatId: string;
      sender: any;
      content: string;
      messageType: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system';
      mediaUrl?: string;
      mediaName?: string;
      replyToId?: string;
      replyToMessage?: any;
      reactions: any[];
      isPinned: boolean;
      status: 'sent' | 'delivered' | 'read';
      createdAt: string;
    }) => {
      // Broadcast message to everyone in the chat room (excluding sender optionally, or simple emit)
      io.to(data.chatId).emit('receive-message', data);
      
      // Update participants' list with an update event
      const chat = db.chats.findById(data.chatId);
      if (chat) {
        chat.participants.forEach((pid: string) => {
          io.to(`user-${pid}`).emit('chat-update', { chatId: data.chatId });
        });
      }
    });

    // Typing Indicators
    socket.on('typing', (data: { chatId: string; username: string }) => {
      socket.to(data.chatId).emit('typing', data);
    });

    socket.on('stop-typing', (data: { chatId: string; username: string }) => {
      socket.to(data.chatId).emit('stop-typing', data);
    });

    // Register User Direct messaging sockets (rooms named user-userId)
    socket.on('register-user-channel', (userId: string) => {
      socket.join(`user-${userId}`);
      console.log(`📡 Registered direct notification channel for user-${userId}`);
    });

    // ----------------------------------------------------
    // WebRTC Real-Time Calling Negotiation Signaling
    // ----------------------------------------------------

    socket.on('call-user', (data: {
      targetUserId: string;
      callerId: string;
      callerName: string;
      callerAvatar: string;
      type: 'voice' | 'video';
      offer: any;
    }) => {
      console.log(`📞 Signaling: ${data.callerName} calling user-${data.targetUserId}`);
      io.to(`user-${data.targetUserId}`).emit('incoming-call', {
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        type: data.type,
        offer: data.offer,
        socketId: socket.id
      });
    });

    socket.on('answer-call', (data: {
      callerSocketId: string;
      targetUserId: string;
      answer: any;
    }) => {
      console.log(`📞 Signaling: Call answered by user-${data.targetUserId}`);
      io.to(data.callerSocketId).emit('call-answered', {
        answer: data.answer,
        answererId: data.targetUserId
      });
    });

    socket.on('ice-candidate', (data: {
      targetSocketId?: string;
      targetUserId?: string;
      candidate: any;
    }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('ice-candidate', { candidate: data.candidate });
      } else if (data.targetUserId) {
        io.to(`user-${data.targetUserId}`).emit('ice-candidate', { candidate: data.candidate });
      }
    });

    socket.on('decline-call', (data: { targetSocketId?: string; targetUserId?: string }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('call-declined');
      } else if (data.targetUserId) {
        io.to(`user-${data.targetUserId}`).emit('call-declined');
      }
    });

    socket.on('end-call', (data: { targetSocketId?: string; targetUserId?: string }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('call-ended');
      } else if (data.targetUserId) {
        io.to(`user-${data.targetUserId}`).emit('call-ended');
      }
    });

    // Handle Disconnections
    socket.on('disconnect', () => {
      const userId = activeSockets.get(socket.id);
      if (userId) {
        activeSockets.delete(socket.id);
        db.users.findByIdAndUpdate(userId, { onlineStatus: 'offline', lastSeen: new Date().toISOString() });
        io.emit('user-status-change', { userId, status: 'offline' });
        console.log(`🔌 User disconnected: ${userId}`);
      }
    });
  });

  // ----------------------------------------------------
  // Vite Integration & Asset Route Handlers
  // ----------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('⚡ Vite dev server integrated as Express middleware.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('📦 Serving production built static assets from dist/.');
  }

  // Listen on PORT 3000
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HomieHub Full Stack server running at http://localhost:${PORT}`);
  });
}

startServer();
