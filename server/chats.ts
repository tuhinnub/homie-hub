/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { db } from './db.js';
import { authenticateToken } from './auth.js';

export const chatsRouter = express.Router();

// Helper to expand user references
function expandUser(userId: string) {
  const user = db.users.findById(userId);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

// Expand message references
function expandMessage(msg: any): any {
  if (!msg) return null;
  const sender = expandUser(msg.senderId);
  return {
    ...msg,
    sender: sender || { id: msg.senderId, displayName: 'Deleted User', avatarUrl: '' }
  };
}

// Expand chat references
function expandChat(chat: any, userId: string): any {
  if (!chat) return null;
  const participants = chat.participants.map((pid: string) => expandUser(pid)).filter(Boolean);
  const lastMsg = db.messages.findOne(m => m.chatId === chat.id && m.id === chat.lastMessageId);
  
  return {
    ...chat,
    participants,
    lastMessage: expandMessage(lastMsg),
    unreadCount: chat.unreadCounts?.[userId] || 0
  };
}

// ----------------------------------------------------
// CHATS & MESSAGES ROUTES
// ----------------------------------------------------

// 1. GET ALL CHATS FOR A USER
chatsRouter.get('/list', authenticateToken, (req: any, res) => {
  try {
    const userId = req.user.id;
    const userChats = db.chats.find(c => c.participants.includes(userId));
    const expanded = userChats.map(c => expandChat(c, userId));
    
    // Sort by last message time or creation time
    expanded.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    res.json({ chats: expanded });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list chats' });
  }
});

// 2. CREATE A DIRECT OR GROUP CHAT
chatsRouter.post('/create', authenticateToken, (req: any, res) => {
  try {
    const { isGroup, participantIds, name, avatarUrl } = req.body;
    const userId = req.user.id;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    const allParticipants = Array.from(new Set([userId, ...participantIds]));

    // For Direct Messages (1-to-1), check if chat already exists
    if (!isGroup && allParticipants.length === 2) {
      const existing = db.chats.findOne(c => 
        !c.isGroup && 
        c.participants.includes(allParticipants[0]) && 
        c.participants.includes(allParticipants[1])
      );
      if (existing) {
        return res.json({ chat: expandChat(existing, userId) });
      }
    }

    // Default group avatar
    const defaultGroupAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Group')}&background=7c3aed&color=fff`;

    const unreadCounts: { [key: string]: number } = {};
    allParticipants.forEach(pid => {
      unreadCounts[pid] = 0;
    });

    const newChat = db.chats.create({
      name: isGroup ? (name || 'New Group') : undefined,
      isGroup: !!isGroup,
      avatarUrl: isGroup ? (avatarUrl || defaultGroupAvatar) : undefined,
      creatorId: isGroup ? userId : undefined,
      admins: isGroup ? [userId] : undefined,
      participants: allParticipants,
      unreadCounts,
      pinnedMessages: []
    });

    res.status(201).json({ chat: expandChat(newChat, userId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create chat' });
  }
});

// 3. GET MESSAGES IN A CHAT
chatsRouter.get('/:chatId/messages', authenticateToken, (req: any, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    // Verify participant
    const chat = db.chats.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    // Reset unread count
    const unreadCounts = { ...chat.unreadCounts };
    unreadCounts[userId] = 0;
    db.chats.findByIdAndUpdate(chatId, { unreadCounts });

    const messages = db.messages.find(m => m.chatId === chatId);
    const expanded = messages.map(expandMessage);

    res.json({ messages: expanded });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve messages' });
  }
});

// 4. SEND MESSAGE (API BACKUP)
chatsRouter.post('/:chatId/messages', authenticateToken, (req: any, res) => {
  try {
    const { chatId } = req.params;
    const { content, messageType, mediaUrl, mediaName, replyToId } = req.body;
    const userId = req.user.id;

    const chat = db.chats.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return res.status(403).json({ error: 'You are not authorized' });
    }

    let replyToMessage;
    if (replyToId) {
      const parentMsg = db.messages.findById(replyToId);
      if (parentMsg) {
        const parentSender = db.users.findById(parentMsg.senderId);
        replyToMessage = {
          senderName: parentSender?.displayName || 'Unknown',
          content: parentMsg.content
        };
      }
    }

    const newMessage = db.messages.create({
      chatId,
      senderId: userId,
      content,
      messageType: messageType || 'text',
      mediaUrl,
      mediaName,
      replyToId,
      replyToMessage,
      reactions: [],
      isPinned: false,
      status: 'sent'
    });

    // Update Chat last message & unread counts
    const unreadCounts = { ...chat.unreadCounts };
    chat.participants.forEach((pid: string) => {
      if (pid !== userId) {
        unreadCounts[pid] = (unreadCounts[pid] || 0) + 1;
      }
    });

    db.chats.findByIdAndUpdate(chatId, {
      lastMessageId: newMessage.id,
      unreadCounts
    });

    res.status(201).json({ message: expandMessage(newMessage) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send message' });
  }
});

// 5. MESSAGE REACTION
chatsRouter.post('/messages/:messageId/react', authenticateToken, (req: any, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;

    const message = db.messages.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    let reactions = [...(message.reactions || [])];
    const existingIndex = reactions.findIndex(r => r.userId === userId);

    if (existingIndex > -1) {
      if (reactions[existingIndex].emoji === emoji) {
        // Remove reaction if clicking same emoji
        reactions.splice(existingIndex, 1);
      } else {
        // Change emoji
        reactions[existingIndex].emoji = emoji;
      }
    } else {
      reactions.push({
        userId,
        username: req.user.username,
        emoji
      });
    }

    const updated = db.messages.findByIdAndUpdate(messageId, { reactions });
    res.json({ message: expandMessage(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to react' });
  }
});

// 6. PIN/UNPIN MESSAGE
chatsRouter.post('/messages/:messageId/pin', authenticateToken, (req: any, res) => {
  try {
    const { messageId } = req.params;
    const message = db.messages.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const updated = db.messages.findByIdAndUpdate(messageId, { isPinned: !message.isPinned });
    res.json({ message: expandMessage(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to pin message' });
  }
});


// ----------------------------------------------------
// STORIES SYSTEM (24-hour expiring updates)
// ----------------------------------------------------

chatsRouter.post('/stories', authenticateToken, (req: any, res) => {
  try {
    const { mediaUrl, mediaType } = req.body;
    if (!mediaUrl || !mediaType) {
      return res.status(400).json({ error: 'Media URL and Type are required' });
    }

    const story = db.stories.create({
      userId: req.user.id,
      mediaUrl,
      mediaType,
      viewers: [],
      reactions: []
    });

    res.status(201).json({ story: { ...story, user: req.user } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to post story' });
  }
});

chatsRouter.get('/stories/feed', authenticateToken, (req: any, res) => {
  try {
    const stories = db.stories.find();
    // Exclude stories older than 24 hours
    const activeStories = stories.filter(s => {
      const createdAt = new Date(s.createdAt).getTime();
      const now = new Date().getTime();
      return (now - createdAt) < (24 * 60 * 60 * 1000);
    });

    const expanded = activeStories.map(s => ({
      ...s,
      user: expandUser(s.userId)
    })).filter(s => s.user !== null);

    res.json({ stories: expanded });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch stories' });
  }
});

chatsRouter.post('/stories/:storyId/view', authenticateToken, (req: any, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const story = db.stories.findById(storyId);
    if (!story) return res.status(404).json({ error: 'Story not found' });

    const viewers = Array.from(new Set([...(story.viewers || []), userId]));
    const updated = db.stories.findByIdAndUpdate(storyId, { viewers });
    res.json({ story: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to view story' });
  }
});


// ----------------------------------------------------
// COLLABORATION UTILS (TODOS, POLLS, CALENDAR)
// ----------------------------------------------------

// TODOs
chatsRouter.get('/todos/list', authenticateToken, (req: any, res) => {
  res.json({ todos: db.todos.find() });
});

chatsRouter.post('/todos/create', authenticateToken, (req: any, res) => {
  try {
    const { title, dueDate, assignedToId } = req.body;
    if (!title) return res.status(400).json({ error: 'Todo title required' });

    const assignedTo = assignedToId ? expandUser(assignedToId) : undefined;
    const newTodo = db.todos.create({
      title,
      isCompleted: false,
      dueDate,
      assignedTo,
      createdBy: expandUser(req.user.id)
    });

    res.status(201).json({ todo: newTodo });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create todo' });
  }
});

chatsRouter.put('/todos/:todoId/toggle', authenticateToken, (req: any, res) => {
  try {
    const { todoId } = req.params;
    const todo = db.todos.findById(todoId);
    if (!todo) return res.status(404).json({ error: 'Todo not found' });

    const updated = db.todos.findByIdAndUpdate(todoId, { isCompleted: !todo.isCompleted });
    res.json({ todo: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed' });
  }
});

// POLLs
chatsRouter.get('/polls/list', authenticateToken, (req: any, res) => {
  res.json({ polls: db.polls.find().map(p => ({ ...p, creator: expandUser(p.creator.id) })) });
});

chatsRouter.post('/polls/create', authenticateToken, (req: any, res) => {
  try {
    const { question, options } = req.body;
    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Question and at least two options are required' });
    }

    const formattedOptions = options.map((opt: string) => ({
      id: Math.random().toString(36).substr(2, 9),
      text: opt,
      votes: []
    }));

    const newPoll = db.polls.create({
      question,
      options: formattedOptions,
      creator: expandUser(req.user.id)
    });

    res.status(201).json({ poll: newPoll });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create poll' });
  }
});

chatsRouter.post('/polls/:pollId/vote', authenticateToken, (req: any, res) => {
  try {
    const { pollId } = req.params;
    const { optionId } = req.body;
    const userId = req.user.id;

    const poll = db.polls.findById(pollId);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    // Remove user's previous vote on this poll first (single choice)
    const options = poll.options.map((opt: any) => {
      let votes = opt.votes.filter((vid: string) => vid !== userId);
      if (opt.id === optionId) {
        votes.push(userId);
      }
      return { ...opt, votes };
    });

    const updated = db.polls.findByIdAndUpdate(pollId, { options });
    res.json({ poll: { ...updated, creator: expandUser(updated.creator.id) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to vote' });
  }
});

// CALENDAR
chatsRouter.get('/calendar/events', authenticateToken, (req: any, res) => {
  res.json({ events: db.events.find() });
});

chatsRouter.post('/calendar/events', authenticateToken, (req: any, res) => {
  try {
    const { title, description, startDate, endDate, color } = req.body;
    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'Title, start date, and end date are required' });
    }

    const newEvent = db.events.create({
      title,
      description,
      startDate,
      endDate,
      color: color || 'indigo',
      creator: expandUser(req.user.id),
      attendees: [expandUser(req.user.id)]
    });

    res.status(201).json({ event: newEvent });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add event' });
  }
});
