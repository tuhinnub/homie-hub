/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// User and Profile types
export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  onlineStatus: 'online' | 'idle' | 'offline';
  lastSeen: string; // ISO String
  streakCount: number;
  lastActiveDate?: string; // YYYY-MM-DD
  socialLinks: {
    instagram?: string;
    twitter?: string;
    github?: string;
  };
  role?: 'admin' | 'user';
  isVerified?: boolean;
  isSuspended?: boolean;
  isBanned?: boolean;
  createdAt: string;
}

// Friend system types
export interface FriendRequest {
  id: string;
  sender: User;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

// Message Reactions
export interface MessageReaction {
  userId: string;
  username: string;
  emoji: string;
}

// Chat types
export interface Message {
  id: string;
  chatId: string;
  sender: User;
  content: string;
  messageType: 'text' | 'image' | 'video' | 'voice' | 'file' | 'system';
  mediaUrl?: string;
  mediaName?: string;
  replyToId?: string; // ID of message being replied to
  replyToMessage?: {
    senderName: string;
    content: string;
  };
  reactions: MessageReaction[];
  isPinned: boolean;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  updatedAt?: string;
}

export interface Chat {
  id: string;
  name?: string; // Only for groups
  isGroup: boolean;
  avatarUrl?: string; // Only for groups
  creatorId?: string; // Only for groups
  admins?: string[]; // Only for groups
  participants: User[];
  lastMessage?: Message;
  pinnedMessages?: string[]; // Message IDs
  unreadCounts: { [userId: string]: number };
  createdAt: string;
}

// Story types
export interface Story {
  id: string;
  userId: string;
  user: User;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  viewers: string[]; // User IDs
  reactions: { userId: string; emoji: string }[];
  createdAt: string; // ISO string, expires after 24h
}

// Call types
export interface CallHistory {
  id: string;
  caller: User;
  receiver: User;
  type: 'voice' | 'video';
  status: 'missed' | 'answered' | 'declined';
  durationSeconds?: number;
  createdAt: string;
}

// Shared Calendar Event types
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string; // ISO date/time
  endDate: string; // ISO date/time
  creator: User;
  color: string;
  attendees: User[];
}

// Shared Todo types
export interface TodoItem {
  id: string;
  title: string;
  isCompleted: boolean;
  dueDate?: string;
  assignedTo?: User;
  createdBy: User;
  createdAt: string;
}

// Shared Poll types
export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // User IDs who voted
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  creator: User;
  createdAt: string;
}
