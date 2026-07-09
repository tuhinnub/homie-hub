/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import mongoose, { Schema } from 'mongoose';
import fs from 'fs';
import path from 'path';

// Load environment variables
const MONGO_URI = process.env.MONGO_URI || '';
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure local db file exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    users: [],
    messages: [],
    chats: [],
    stories: [],
    calls: [],
    events: [],
    todos: [],
    polls: [],
    reports: [],
    logs: [],
    featureFlags: []
  }, null, 2));
}

// ----------------------------------------------------
// Real Mongoose Schemas (Production MongoDB)
// ----------------------------------------------------

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, default: '' },
  bio: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  onlineStatus: { type: String, enum: ['online', 'idle', 'offline'], default: 'offline' },
  lastSeen: { type: Date, default: Date.now },
  streakCount: { type: Number, default: 0 },
  lastActiveDate: { type: String, default: '' },
  socialLinks: {
    instagram: { type: String, default: '' },
    twitter: { type: String, default: '' },
    github: { type: String, default: '' }
  }
}, { timestamps: true });

const MessageSchema = new Schema({
  chatId: { type: String, required: true },
  senderId: { type: String, required: true },
  content: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'image', 'video', 'voice', 'file', 'system'], default: 'text' },
  mediaUrl: { type: String },
  mediaName: { type: String },
  replyToId: { type: String },
  replyToMessage: {
    senderName: { type: String },
    content: { type: String }
  },
  reactions: [{
    userId: { type: String },
    username: { type: String },
    emoji: { type: String }
  }],
  isPinned: { type: Boolean, default: false },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' }
}, { timestamps: true });

const ChatSchema = new Schema({
  name: { type: String },
  isGroup: { type: Boolean, default: false },
  avatarUrl: { type: String },
  creatorId: { type: String },
  admins: [{ type: String }],
  participants: [{ type: String }], // User IDs
  lastMessageId: { type: String },
  pinnedMessages: [{ type: String }], // Message IDs
  unreadCounts: { type: Map, of: Number, default: {} }
}, { timestamps: true });

const StorySchema = new Schema({
  userId: { type: String, required: true },
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  viewers: [{ type: String }], // User IDs
  reactions: [{
    userId: { type: String },
    emoji: { type: String }
  }],
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hours TTL
});

// Models (Lazy initialized on demand)
let MongoUser: any = null;
let MongoChat: any = null;
let MongoMessage: any = null;
let MongoStory: any = null;

let isMongoConnected = false;

export async function connectDB() {
  if (!MONGO_URI) {
    console.log('⚠️ MongoDB URI not configured. Running in Local Persistent JSON Database mode.');
    return false;
  }
  if (isMongoConnected) return true;

  try {
    await mongoose.connect(MONGO_URI);
    isMongoConnected = true;
    console.log('✅ Connected to MongoDB Atlas successfully.');
    
    // Initialize models
    MongoUser = mongoose.models.User || mongoose.model('User', UserSchema);
    MongoChat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);
    MongoMessage = mongoose.models.Message || mongoose.model('Message', MessageSchema);
    MongoStory = mongoose.models.Story || mongoose.model('Story', StorySchema);
    
    return true;
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    console.log('⚠️ Falling back to Local Persistent JSON Database mode.');
    isMongoConnected = false;
    return false;
  }
}

// ----------------------------------------------------
// Local Persistent JSON Database Implementation
// ----------------------------------------------------

class LocalCollection<T extends { id: string }> {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  private read(): T[] {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return data[this.key] || [];
    } catch {
      return [];
    }
  }

  private write(items: T[]) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      data[this.key] = items;
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Failed to write database key: ${this.key}`, err);
    }
  }

  find(queryFn?: (item: T) => boolean): T[] {
    const items = this.read();
    if (queryFn) {
      return items.filter(queryFn);
    }
    return items;
  }

  findOne(queryFn: (item: T) => boolean): T | null {
    const items = this.read();
    return items.find(queryFn) || null;
  }

  findById(id: string): T | null {
    return this.findOne(item => item.id === id);
  }

  create(item: Omit<T, 'id'> & { id?: string }): T {
    const items = this.read();
    const newItem = {
      ...item,
      id: item.id || Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    } as unknown as T;
    
    items.push(newItem);
    this.write(items);
    return newItem;
  }

  findByIdAndUpdate(id: string, updates: Partial<T>): T | null {
    const items = this.read();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;

    items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
    this.write(items);
    return items[index];
  }

  deleteOne(id: string): boolean {
    const items = this.read();
    const initialLength = items.length;
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === initialLength) return false;
    this.write(filtered);
    return true;
  }

  deleteMany(queryFn: (item: T) => boolean): number {
    const items = this.read();
    const kept = items.filter(item => !queryFn(item));
    const deletedCount = items.length - kept.length;
    this.write(kept);
    return deletedCount;
  }
}

// Export collections for fallback
export const db = {
  users: new LocalCollection<any>('users'),
  messages: new LocalCollection<any>('messages'),
  chats: new LocalCollection<any>('chats'),
  stories: new LocalCollection<any>('stories'),
  calls: new LocalCollection<any>('calls'),
  events: new LocalCollection<any>('events'),
  todos: new LocalCollection<any>('todos'),
  polls: new LocalCollection<any>('polls'),
  reports: new LocalCollection<any>('reports'),
  logs: new LocalCollection<any>('logs'),
  featureFlags: new LocalCollection<any>('featureFlags'),
};
