/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useSocket } from '../context/SocketContext.js';
import { Message, Chat, Story, TodoItem, Poll, CalendarEvent, User } from '../types.js';
import { 
  MessageSquare, Users, CheckSquare, BarChart2, Calendar, Settings, Bot, Sparkles, 
  LogOut, Flame, Plus, Send, Search, Image, Mic, X, Heart, Smile, Pin, Share2, 
  Globe, AlertTriangle, Check, CheckCheck, Instagram, Twitter, Github, Phone, Video,
  Paperclip, ArrowRight, CornerUpLeft, Trash2, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Workspace: React.FC = () => {
  const { user, token, logout, updateProfile, updateStatus, searchUsers } = useAuth();
  const { 
    socket, sendMessage, sendTyping, sendStopTyping, typingUsers, incomingMessages, clearIncomingMessages,
    callState, initiateCall, acceptCall, declineCall, endCall, localVideoRef, remoteVideoRef
  } = useSocket();

  // Navigation State
  const [activeMenu, setActiveMenu] = useState<'chat' | 'stories' | 'todo' | 'poll' | 'calendar' | 'ai-chatbot' | 'settings' | 'admin'>('chat');
  
  // Database States
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  // UI / Modal States
  const [searchQuery, setSearchQuery] = useState('');
  const [usersList, setUsersList] = useState<User[]>([]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isGroupChatCreation, setIsGroupChatCreation] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Chat Input State
  const [inputText, setInputText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'voice' | 'file'>('image');
  const [showAttachmentDropdown, setShowAttachmentDropdown] = useState(false);

  // AI Sidebar State
  const [showAIDrawer, setShowAIDrawer] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [safetyAnalysis, setSafetyAnalysis] = useState<{ isToxic: boolean; isSpam: boolean; reason: string } | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);

  // Stories States
  const [showAddStory, setShowAddStory] = useState(false);
  const [newStoryMedia, setNewStoryMedia] = useState('');
  const [viewingStoryGroup, setViewingStoryGroup] = useState<Story[] | null>(null);

  // Todo States
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDue, setNewTodoDue] = useState('');

  // Poll States
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Calendar States
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventColor, setEventColor] = useState('indigo');

  // AI Chatbot State
  const [chatbotInput, setChatbotInput] = useState('');
  const [chatbotHistory, setChatbotHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [chatbotLoading, setChatbotLoading] = useState(false);

  // Settings State
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatarUrl || '');
  const [editCover, setEditCover] = useState(user?.coverUrl || '');
  const [editInsta, setEditInsta] = useState(user?.socialLinks?.instagram || '');
  const [editTwitter, setEditTwitter] = useState(user?.socialLinks?.twitter || '');
  const [editGit, setEditGit] = useState(user?.socialLinks?.github || '');

  // Admin Panel States
  const [adminTab, setAdminTab] = useState<'overview' | 'users' | 'moderation' | 'flags' | 'logs'>('overview');
  const [adminAnalytics, setAdminAnalytics] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [adminFeatureFlags, setAdminFeatureFlags] = useState<any[]>([]);
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load initial data
  useEffect(() => {
    if (!token) return;

    fetchChats();
    fetchStories();
    fetchTodos();
    fetchPolls();
    fetchEvents();

    searchUsers().then(users => setUsersList(users.filter(u => u.id !== user?.id)));
  }, [token]);

  // Handle incoming sockets
  useEffect(() => {
    if (incomingMessages.length > 0) {
      const latest = incomingMessages[incomingMessages.length - 1];
      if (activeChat && latest.chatId === activeChat.id) {
        setMessages(prev => {
          // Prevent duplicates
          if (prev.some(m => m.id === latest.id)) return prev;
          return [...prev, latest];
        });
        scrollToBottom();
      }
      
      // Update chats list counters
      fetchChats();
      clearIncomingMessages();
    }
  }, [incomingMessages, activeChat]);

  // Listen to socket triggers to refresh panels
  useEffect(() => {
    if (!socket) return;
    
    socket.on('chat-update', () => {
      fetchChats();
    });

    socket.on('user-status-change', () => {
      fetchChats();
    });

    return () => {
      socket.off('chat-update');
      socket.off('user-status-change');
    };
  }, [socket]);

  // Dynamic suggested replies loader on active chat message change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
      loadSuggestedReplies();
    } else {
      setSuggestedReplies([]);
    }
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // ----------------------------------------------------
  // BACKEND API CONNECTORS
  // ----------------------------------------------------

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/chats/list', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats);
      }
    } catch (err) { console.error(err); }
  };

  const fetchStories = async () => {
    try {
      const res = await fetch('/api/chats/stories/feed', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories);
      }
    } catch (err) { console.error(err); }
  };

  const fetchTodos = async () => {
    try {
      const res = await fetch('/api/chats/todos/list', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTodos(data.todos);
      }
    } catch (err) { console.error(err); }
  };

  const fetchPolls = async () => {
    try {
      const res = await fetch('/api/chats/polls/list', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPolls(data.polls);
      }
    } catch (err) { console.error(err); }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/chats/calendar/events', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      }
    } catch (err) { console.error(err); }
  };

  const selectChat = async (chat: Chat) => {
    setActiveChat(chat);
    setReplyingTo(null);
    setSafetyAnalysis(null);
    setInputText('');
    
    if (socket) {
      socket.emit('join-room', chat.id);
    }

    try {
      const res = await fetch(`/api/chats/${chat.id}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        scrollToBottom();
      }
    } catch (err) { console.error(err); }
  };

  // ----------------------------------------------------
  // MESSAGE SENDING
  // ----------------------------------------------------

  const handleSendMessage = () => {
    if (!inputText.trim() && !mediaUrl) return;
    if (!activeChat) return;

    sendMessage(
      activeChat.id,
      inputText,
      mediaUrl ? mediaType : 'text',
      mediaUrl || undefined,
      mediaUrl ? `Attachment.${mediaType === 'image' ? 'png' : 'mp4'}` : undefined,
      replyingTo?.id || undefined
    );

    setInputText('');
    setMediaUrl('');
    setReplyingTo(null);
    setSafetyAnalysis(null);
    sendStopTyping(activeChat.id);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!activeChat) return;

    if (e.target.value.length > 0) {
      sendTyping(activeChat.id);
    } else {
      sendStopTyping(activeChat.id);
    }
  };

  // ----------------------------------------------------
  // STORY HANDLERS
  // ----------------------------------------------------

  const handlePostStory = async () => {
    if (!newStoryMedia) return;
    try {
      const res = await fetch('/api/chats/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mediaUrl: newStoryMedia, mediaType: newStoryMedia.includes('mp4') ? 'video' : 'image' })
      });
      if (res.ok) {
        fetchStories();
        setNewStoryMedia('');
        setShowAddStory(false);
      }
    } catch (err) { console.error(err); }
  };

  // ----------------------------------------------------
  // TODO HANDLERS
  // ----------------------------------------------------

  const handleCreateTodo = async () => {
    if (!newTodoTitle) return;
    try {
      const res = await fetch('/api/chats/todos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTodoTitle, dueDate: newTodoDue || undefined })
      });
      if (res.ok) {
        fetchTodos();
        setNewTodoTitle('');
        setNewTodoDue('');
      }
    } catch (err) { console.error(err); }
  };

  const handleToggleTodo = async (id: string) => {
    try {
      const res = await fetch(`/api/chats/todos/${id}/toggle`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchTodos();
    } catch (err) { console.error(err); }
  };

  // ----------------------------------------------------
  // POLL HANDLERS
  // ----------------------------------------------------

  const handleCreatePoll = async () => {
    if (!pollQuestion || pollOptions.some(o => !o.trim())) return;
    try {
      const res = await fetch('/api/chats/polls/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: pollQuestion, options: pollOptions.filter(o => o.trim()) })
      });
      if (res.ok) {
        fetchPolls();
        setPollQuestion('');
        setPollOptions(['', '']);
      }
    } catch (err) { console.error(err); }
  };

  const handleVotePoll = async (pollId: string, optionId: string) => {
    try {
      const res = await fetch(`/api/chats/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optionId })
      });
      if (res.ok) fetchPolls();
    } catch (err) { console.error(err); }
  };

  // ----------------------------------------------------
  // CALENDAR HANDLERS
  // ----------------------------------------------------

  const handleCreateEvent = async () => {
    if (!eventTitle || !eventStart || !eventEnd) return;
    try {
      const res = await fetch('/api/chats/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: eventTitle, description: eventDesc, startDate: eventStart, endDate: eventEnd, color: eventColor })
      });
      if (res.ok) {
        fetchEvents();
        setEventTitle('');
        setEventDesc('');
        setEventStart('');
        setEventEnd('');
      }
    } catch (err) { console.error(err); }
  };

  // ----------------------------------------------------
  // PROFILE HANDLERS
  // ----------------------------------------------------

  const handleSaveProfile = async () => {
    const success = await updateProfile({
      displayName: editDisplayName,
      bio: editBio,
      avatarUrl: editAvatar,
      coverUrl: editCover,
      instagram: editInsta,
      twitter: editTwitter,
      github: editGit
    });
    if (success) {
      alert('Profile updated successfully!');
    } else {
      alert('Failed to update profile.');
    }
  };

  // ----------------------------------------------------
  // ADMIN PANEL CONTROLLERS
  // ----------------------------------------------------

  const fetchAdminAnalytics = async () => {
    try {
      const res = await fetch('/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdminAnalytics(d);
      }
    } catch (err) { console.error(err); }
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdminUsers(d.users);
      }
    } catch (err) { console.error(err); }
  };

  const fetchAdminReports = async () => {
    try {
      const res = await fetch('/api/admin/reports', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdminReports(d.reports);
      }
    } catch (err) { console.error(err); }
  };

  const fetchAdminFeatureFlags = async () => {
    try {
      const res = await fetch('/api/admin/feature-flags', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdminFeatureFlags(d.flags);
      }
    } catch (err) { console.error(err); }
  };

  const fetchAdminLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdminLogs(d.logs);
      }
    } catch (err) { console.error(err); }
  };

  const handleToggleUserVerify = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/verify`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); }
  };

  const handleToggleUserBan = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); }
  };

  const handleToggleUserSuspend = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); }
  };

  const handleChangeUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user account permanently? This action is irreversible.')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); }
  };

  const handleResolveReport = async (reportId: string, action: 'delete' | 'dismiss') => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      if (res.ok) fetchAdminReports();
    } catch (err) { console.error(err); }
  };

  const handleToggleFeatureFlag = async (key: string, currentValue: boolean) => {
    try {
      const res = await fetch(`/api/admin/feature-flags/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: !currentValue })
      });
      if (res.ok) fetchAdminFeatureFlags();
    } catch (err) { console.error(err); }
  };

  const loadAdminData = async () => {
    setAdminLoading(true);
    try {
      if (adminTab === 'overview') await fetchAdminAnalytics();
      else if (adminTab === 'users') await fetchAdminUsers();
      else if (adminTab === 'moderation') await fetchAdminReports();
      else if (adminTab === 'flags') await fetchAdminFeatureFlags();
      else if (adminTab === 'logs') await fetchAdminLogs();
    } catch (err) {
      console.error(err);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenu !== 'admin' || !token) return;
    loadAdminData();
  }, [activeMenu, adminTab, token]);

  // ----------------------------------------------------
  // NEW CHAT MODAL HANDLERS
  // ----------------------------------------------------

  const handleCreateNewChat = async () => {
    if (selectedParticipants.length === 0) return;
    try {
      const res = await fetch('/api/chats/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          isGroup: isGroupChatCreation,
          name: isGroupChatCreation ? (newChatName || 'Homies Group') : undefined,
          participantIds: selectedParticipants
        })
      });
      if (res.ok) {
        const data = await res.json();
        setChats(prev => [data.chat, ...prev]);
        selectChat(data.chat);
        setShowNewChatModal(false);
        setNewChatName('');
        setSelectedParticipants([]);
        setIsGroupChatCreation(false);
      }
    } catch (err) { console.error(err); }
  };

  // ----------------------------------------------------
  // AI SIDEBAR FEATURES (GEMINI)
  // ----------------------------------------------------

  const loadSuggestedReplies = async () => {
    if (messages.length === 0) return;
    try {
      const contextSlice = messages.slice(-4);
      const res = await fetch('/api/ai/suggest-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ context: contextSlice })
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedReplies(data.suggestions || []);
      }
    } catch {
      setSuggestedReplies([]);
    }
  };

  const handleAISummarize = async () => {
    if (messages.length === 0) return;
    setAiLoading(true);
    setShowAIDrawer(true);
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: messages.slice(-25) })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data.summary);
      } else {
        setAiSummary('Failed to summarize conversation. Please ensure your GEMINI_API_KEY is configured in Settings > Secrets.');
      }
    } catch (err: any) {
      setAiSummary(`Error: ${err.message || 'Summarization failed'}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleScanSafety = async () => {
    if (!inputText.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: inputText })
      });
      if (res.ok) {
        const data = await res.json();
        setSafetyAnalysis(data);
      }
    } catch (err) { console.error(err); }
    finally { setAiLoading(false); }
  };

  const handleTranslateMessage = async (msgId: string, text: string, targetLang: string) => {
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, targetLanguage: targetLang })
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: `🌐 [Translated to ${targetLang}]: ${data.translatedText}` } : m));
      }
    } catch (err) { console.error(err); }
  };

  const handleChatbotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatbotInput.trim()) return;

    const userMsg = chatbotInput;
    setChatbotInput('');
    setChatbotHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatbotLoading(true);

    try {
      const res = await fetch('/api/ai/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, chatHistory: chatbotHistory })
      });
      if (res.ok) {
        const data = await res.json();
        setChatbotHistory(prev => [...prev, { role: 'model', text: data.response }]);
      } else {
        setChatbotHistory(prev => [...prev, { role: 'model', text: '⚠️ HomieAI was unable to connect. Ensure your GEMINI_API_KEY is configured under Secrets.' }]);
      }
    } catch (err: any) {
      setChatbotHistory(prev => [...prev, { role: 'model', text: `Error: ${err.message}` }]);
    } finally {
      setChatbotLoading(false);
    }
  };

  // Helper to resolve contact displays
  const getChatDetails = (chat: Chat) => {
    if (chat.isGroup) {
      return {
        name: chat.name || 'Group Chat',
        avatar: chat.avatarUrl || 'https://ui-avatars.com/api/?name=Group'
      };
    }
    const friend = chat.participants.find(p => p.id !== user?.id);
    return {
      name: friend?.displayName || 'Chat Room',
      avatar: friend?.avatarUrl || 'https://ui-avatars.com/api/?name=User',
      status: friend?.onlineStatus || 'offline'
    };
  };

  return (
    <div className="min-h-screen bg-mesh text-gray-100 flex overflow-hidden font-sans select-none relative">
      
      {/* ----------------------------------------------------
          WebRTC FLOATING OVERLAY
          ---------------------------------------------------- */}
      <AnimatePresence>
        {(callState.isIncoming || callState.isActive) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex flex-col justify-center items-center p-6"
          >
            <div className="w-full max-w-4xl glass-card rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-glow"></div>
              
              <div className="relative z-10 w-full flex flex-col items-center">
                <h3 className="text-sm font-mono tracking-widest text-cyan-400 mb-6 uppercase">
                  {callState.isActive ? 'HomieHub Active Call' : 'HomieHub Incoming Call'}
                </h3>

                {/* Local & Remote Feeds */}
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative">
                  {callState.type === 'video' ? (
                    <>
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-950 border border-white/5">
                        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                        <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 rounded-lg text-xs font-mono border border-white/5">You (Local)</span>
                      </div>
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gray-950 border border-white/5">
                        {callState.isActive ? (
                          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col justify-center items-center">
                            <img src={callState.callerAvatar} className="w-20 h-20 rounded-full border border-indigo-500/20 mb-4 animate-bounce" />
                            <p className="text-sm text-gray-400 font-mono">Connecting feed...</p>
                          </div>
                        )}
                        <span className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 rounded-lg text-xs font-mono border border-white/5">{callState.callerName}</span>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 py-12 flex flex-col justify-center items-center">
                      <div className="relative mb-6">
                        <img src={callState.callerAvatar} className="w-32 h-32 rounded-full border-2 border-indigo-500/30 shadow-2xl relative z-10" />
                        {!callState.isActive && (
                          <div className="absolute inset-0 bg-indigo-500/20 rounded-full scale-125 animate-ping z-0"></div>
                        )}
                      </div>
                      <h4 className="font-display font-bold text-2xl mb-1">{callState.callerName}</h4>
                      <p className="text-gray-400 font-mono text-xs">{callState.isActive ? 'Connected (Voice Call)' : 'Ringing...'}</p>
                    </div>
                  )}
                </div>

                {/* Signaling Buttons */}
                <div className="flex gap-4 relative z-10">
                  {callState.isIncoming && !callState.isActive ? (
                    <>
                      <button 
                        onClick={acceptCall}
                        className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-display font-bold rounded-2xl shadow-lg shadow-emerald-500/10 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                      >
                        <Phone className="w-5 h-5 animate-pulse" />
                        Accept Call
                      </button>
                      <button 
                        onClick={declineCall}
                        className="px-8 py-3.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-display font-bold rounded-2xl shadow-lg shadow-rose-500/10 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                      >
                        <X className="w-5 h-5" />
                        Decline
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={endCall}
                      className="px-10 py-3.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-display font-bold rounded-2xl shadow-lg shadow-rose-500/10 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
                    >
                      <Phone className="w-5 h-5 rotate-[135deg]" />
                      End Connection
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ----------------------------------------------------
          SIDEBAR NAVIGATION RAIL
          ---------------------------------------------------- */}
      <div className="w-20 md:w-64 glass-panel border-r border-white/5 flex flex-col justify-between py-6 px-3 flex-shrink-0 z-40">
        <div className="flex flex-col items-center md:items-stretch">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 px-3 mb-8">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-400 to-purple-600 rounded-2xl shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent hidden md:block font-sans">
              HomieHub
            </h1>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1.5">
            {(() => {
              const items = [
                { id: 'chat', label: 'Chat Lounge', icon: MessageSquare },
                { id: 'stories', label: 'Stories Feed', icon: Share2 },
                { id: 'todo', label: 'Shared Todos', icon: CheckSquare },
                { id: 'poll', label: 'Lounge Polls', icon: BarChart2 },
                { id: 'calendar', label: 'Hub Calendar', icon: Calendar },
                { id: 'ai-chatbot', label: 'HomieAI Lounge', icon: Bot },
                { id: 'settings', label: 'Settings', icon: Settings },
              ];
              if (user?.role === 'admin') {
                items.push({ id: 'admin', label: 'Admin Panel', icon: ShieldAlert });
              }
              return items.map(item => {
                const Icon = item.icon;
                const isActive = activeMenu === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveMenu(item.id as any)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all relative ${
                      isActive ? 'text-cyan-400 bg-white/10 border-l-2 border-cyan-400 shadow-md shadow-cyan-500/5' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-display text-sm font-semibold hidden md:block">{item.label}</span>
                  </button>
                );
              });
            })()}
          </nav>
        </div>

        {/* User Footer Profile */}
        <div className="flex flex-col items-center md:items-stretch border-t border-gray-800/60 pt-6 px-2">
          {user && (
            <div className="flex items-center gap-3 mb-4 hidden md:flex">
              <div className="relative">
                <img src={user.avatarUrl} className="w-10 h-10 rounded-full border border-cyan-500/20" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-950 rounded-full"></span>
              </div>
              <div className="overflow-hidden">
                <h4 className="text-xs font-semibold truncate text-gray-200">{user.displayName}</h4>
                <p className="text-[10px] font-mono text-gray-400 truncate">@{user.username}</p>
              </div>
            </div>
          )}

          {/* Streak Badge */}
          {user && user.streakCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 font-mono text-xs mb-4 self-center md:self-start">
              <Flame className="w-4 h-4 fill-amber-500" />
              <span className="hidden md:inline font-semibold">{user.streakCount} Day Streak</span>
              <span className="md:hidden">{user.streakCount}</span>
            </div>
          )}

          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------
          PRIMARY MODULE PANELS
          ---------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ====================================================
            CHAT LOUNGE VIEW
            ==================================================== */}
        {activeMenu === 'chat' && (
          <>
            {/* Contacts sidebar */}
            <div className="w-80 glass-panel border-r border-white/5 flex flex-col flex-shrink-0">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="font-display font-extrabold text-lg text-gray-100">Lounges</h2>
                <button 
                  onClick={() => setShowNewChatModal(true)}
                  className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {chats.map(chat => {
                  const details = getChatDetails(chat);
                  const isSelected = activeChat?.id === chat.id;
                  const isTyping = typingUsers[chat.id]?.length > 0;
                  
                  return (
                    <button
                      key={chat.id}
                      onClick={() => selectChat(chat)}
                      className={`w-full flex items-center gap-3.5 p-3 rounded-xl transition-all relative ${
                        isSelected ? 'bg-white/10 border border-white/10 shadow-lg shadow-cyan-500/5' : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <img src={details.avatar} className="w-11 h-11 rounded-full object-cover" />
                        {!chat.isGroup && details.status && (
                          <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-slate-950 rounded-full ${
                            details.status === 'online' ? 'bg-emerald-500' : details.status === 'idle' ? 'bg-amber-500' : 'bg-gray-600'
                          }`}></span>
                        )}
                      </div>
                      <div className="flex-1 text-left overflow-hidden">
                        <div className="flex justify-between items-baseline">
                          <h4 className="font-display font-semibold text-sm truncate text-gray-200">{details.name}</h4>
                          <span className="text-[10px] font-mono text-gray-400">
                            {chat.lastMessage ? new Date(chat.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {isTyping ? (
                            <span className="text-cyan-400 font-medium animate-pulse">typing...</span>
                          ) : (
                            chat.lastMessage ? chat.lastMessage.content : 'No messages yet'
                          )}
                        </p>
                      </div>
                      {chat.unreadCount > 0 && (
                        <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-cyan-400 text-[10px] font-bold text-gray-950">
                          {chat.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Conversation viewport */}
            <div className="flex-1 flex flex-col bg-slate-950/20 relative overflow-hidden">
              {activeChat ? (
                <>
                  {/* Chat Topbar */}
                  <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-slate-950/40 backdrop-blur-md relative z-10">
                    <div className="flex items-center gap-3">
                      <img src={getChatDetails(activeChat).avatar} className="w-10 h-10 rounded-full" />
                      <div>
                        <h3 className="font-display font-semibold text-sm text-gray-100">{getChatDetails(activeChat).name}</h3>
                        <p className="text-[10px] font-mono text-gray-400">
                          {typingUsers[activeChat.id]?.length > 0 
                            ? `${typingUsers[activeChat.id].join(', ')} is typing...` 
                            : activeChat.isGroup ? `${activeChat.participants.length} homies` : getChatDetails(activeChat).status}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Call Actions */}
                      {!activeChat.isGroup && (
                        <>
                          <button 
                            onClick={() => initiateCall(activeChat.participants.find(p => p.id !== user?.id)!, 'voice')}
                            className="p-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded-xl transition-all"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => initiateCall(activeChat.participants.find(p => p.id !== user?.id)!, 'video')}
                            className="p-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded-xl transition-all"
                          >
                            <Video className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {/* AI Summarize action */}
                      <button 
                        onClick={handleAISummarize}
                        className="px-3.5 py-1.5 bg-cyan-600/20 border border-cyan-400/20 hover:bg-cyan-600/30 text-cyan-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Summarize
                      </button>
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
                    <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
                    
                    {messages.map(msg => {
                      const isMe = msg.sender?.id === user?.id;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group items-start gap-2.5`}>
                          {!isMe && <img src={msg.sender?.avatarUrl} className="w-8 h-8 rounded-full" />}
                          
                          <div className="max-w-[70%] flex flex-col">
                            {/* Reply tag rendering */}
                            {msg.replyToMessage && (
                              <div className="text-[10px] bg-slate-900/60 p-2 rounded-t-xl text-gray-400 border border-white/5 border-b-0 max-w-full flex items-center gap-1 font-mono">
                                <CornerUpLeft className="w-3 h-3 flex-shrink-0" />
                                <span className="font-semibold">{msg.replyToMessage.senderName}:</span>
                                <span className="truncate">{msg.replyToMessage.content}</span>
                              </div>
                            )}

                            <div className={`p-4 rounded-2xl relative ${
                              isMe 
                                ? 'bg-gradient-to-br from-purple-600 to-indigo-700 rounded-tr-none text-white shadow-xl shadow-purple-900/20' 
                                : 'bg-white/10 backdrop-blur-sm rounded-tl-none text-gray-100 border border-white/10'
                            }`}>
                              {!isMe && activeChat.isGroup && (
                                <p className="text-[10px] font-semibold font-mono text-cyan-400 mb-1">@{msg.sender?.username}</p>
                              )}

                              {/* Message Media */}
                              {msg.mediaUrl && (
                                <div className="mb-2 max-w-sm rounded-xl overflow-hidden border border-white/5">
                                  {msg.messageType === 'image' ? (
                                    <img src={msg.mediaUrl} className="w-full object-cover max-h-60" />
                                  ) : (
                                    <video src={msg.mediaUrl} controls className="w-full" />
                                  )}
                                </div>
                              )}

                              {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

                              {/* Pin indicator */}
                              {msg.isPinned && (
                                <div className="absolute top-2 right-2 text-indigo-400">
                                  <Pin className="w-3.5 h-3.5 fill-indigo-400" />
                                </div>
                              )}

                              {/* Footer Timestamp */}
                              <span className="block text-[9px] font-mono text-white/40 mt-1.5 text-right">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* Reactions capsules */}
                            {msg.reactions && msg.reactions.length > 0 && (
                              <div className="flex gap-1.5 mt-1">
                                {msg.reactions.map((r, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-slate-900/70 border border-white/5 rounded-full text-xs font-mono flex items-center gap-1">
                                    <span>{r.emoji}</span>
                                    <span className="text-[9px] text-gray-400">{r.username}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quick Message Actions Panel (appears on hover) */}
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-slate-950/60 backdrop-blur-md border border-white/5 rounded-xl p-1 shadow-lg self-center transition-all">
                            <button 
                              onClick={() => setReplyingTo(msg)}
                              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-cyan-400 transition-all"
                              title="Reply"
                            >
                              <CornerUpLeft className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => {
                                fetch(`/api/chats/messages/${msg.id}/pin`, {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${token}` }
                                }).then(() => selectChat(activeChat));
                              }}
                              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-cyan-400 transition-all"
                              title="Pin Message"
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleTranslateMessage(msg.id, msg.content, 'Spanish')}
                              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-cyan-400 transition-all"
                              title="Translate to Spanish"
                            >
                              <Globe className="w-3.5 h-3.5" />
                            </button>
                            {/* Emoji quick reaction triggers */}
                            {['❤️', '😂', '🔥', '😮'].map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => {
                                  fetch(`/api/chats/messages/${msg.id}/react`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ emoji })
                                  }).then(() => selectChat(activeChat));
                                }}
                                className="p-1 text-xs hover:scale-125 transition-transform"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* AI Quick suggested replies capsule deck */}
                  {suggestedReplies.length > 0 && (
                    <div className="px-6 py-2.5 bg-slate-950/10 flex items-center gap-2 overflow-x-auto border-t border-white/5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="text-[10px] font-mono text-cyan-300 font-semibold uppercase tracking-wider mr-2 flex-shrink-0">Quick AI replies:</span>
                      {suggestedReplies.map((reply, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setInputText(reply);
                            loadSuggestedReplies();
                          }}
                          className="px-3.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/20 text-cyan-300 text-xs rounded-full font-semibold transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Reply indicators bar */}
                  {replyingTo && (
                    <div className="px-6 py-2 bg-slate-900 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center gap-2 truncate">
                        <CornerUpLeft className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span>Replying to <span className="font-semibold text-gray-200">@{replyingTo.sender?.username}</span>:</span>
                        <span className="truncate italic">"{replyingTo.content}"</span>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-gray-200">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Safety Warnings panel */}
                  {safetyAnalysis && (
                    <div className={`px-6 py-2.5 flex items-center justify-between text-xs border-t border-white/5 ${
                      safetyAnalysis.isToxic ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        {safetyAnalysis.isToxic ? <ShieldAlert className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
                        <span>
                          {safetyAnalysis.isToxic 
                            ? `⚠️ AI Warning: Toxic message content detected. Reasons: "${safetyAnalysis.reason}"` 
                            : '✨ AI Verification: Message is safe, non-toxic, and free from spam!'
                          }
                        </span>
                      </div>
                      <button onClick={() => setSafetyAnalysis(null)} className="text-gray-400 hover:text-gray-200">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Input sending bar */}
                  <div className="p-4 border-t border-white/5 bg-slate-950/40 flex items-center gap-3 relative z-10">
                    <div className="relative">
                      <button 
                        onClick={() => setShowAttachmentDropdown(!showAttachmentDropdown)}
                        className="p-3 bg-white/5 border border-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-gray-200 transition-all"
                      >
                        <Paperclip className="w-4.5 h-4.5" />
                      </button>

                      {/* Dropdown for mock attachment inputs */}
                      {showAttachmentDropdown && (
                        <div className="absolute bottom-14 left-0 w-64 p-3 bg-slate-900 border border-white/10 rounded-2xl shadow-xl space-y-2 z-30 font-mono text-xs">
                          <p className="text-[10px] text-gray-400 font-semibold mb-1 uppercase">Share Media / Attachments</p>
                          <input 
                            type="text" 
                            placeholder="Paste Image URL..." 
                            value={mediaType === 'image' ? mediaUrl : ''}
                            onChange={(e) => { setMediaUrl(e.target.value); setMediaType('image'); }}
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/5 rounded-lg text-xs"
                          />
                          <input 
                            type="text" 
                            placeholder="Paste Video URL..." 
                            value={mediaType === 'video' ? mediaUrl : ''}
                            onChange={(e) => { setMediaUrl(e.target.value); setMediaType('video'); }}
                            className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/5 rounded-lg text-xs"
                          />
                          <button 
                            onClick={() => { setMediaUrl('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600'); setMediaType('image'); setShowAttachmentDropdown(false); }}
                            className="w-full py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg text-left px-2.5"
                          >
                            🖼️ Attach Sample Photo
                          </button>
                          {mediaUrl && (
                            <p className="text-[10px] text-emerald-400 truncate">Attached: {mediaUrl}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="Type a message to your homies..."
                      value={inputText}
                      onChange={handleInputChange}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 glass-input rounded-xl px-5 py-3 text-sm"
                    />

                    {/* AI Safety Scan button */}
                    {inputText.trim().length > 0 && (
                      <button 
                        onClick={handleScanSafety}
                        className="p-3 bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/20 text-cyan-400 rounded-xl transition-all"
                        title="Scan Toxicity/Spam with AI"
                      >
                        <ShieldAlert className="w-4.5 h-4.5" />
                      </button>
                    )}

                    <button 
                      onClick={handleSendMessage}
                      className="p-3.5 bg-gradient-to-tr from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95"
                    >
                      <Send className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center border border-cyan-400/20 mb-6 shadow-xl shadow-cyan-500/20">
                    <MessageSquare className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="font-display font-extrabold text-2xl tracking-tight mb-2 text-gray-100">HomieHub Chat Lounges</h3>
                  <p className="text-gray-400 text-sm max-w-sm">
                    Select a lounge chat on the sidebar or click the plus icon to start a private conversation or create a group with your friends!
                  </p>
                  <button 
                    onClick={() => setShowNewChatModal(true)}
                    className="mt-6 px-6 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 rounded-2xl text-sm font-semibold flex items-center gap-2 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Start New Conversation
                  </button>
                </div>
              )}

              {/* Collapsible AI Summary Drawer (Gemini) */}
              <AnimatePresence>
                {showAIDrawer && (
                  <motion.div
                    initial={{ x: 350 }}
                    animate={{ x: 0 }}
                    exit={{ x: 350 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="absolute right-0 top-0 bottom-0 w-80 glass-panel border-l border-white/5 shadow-2xl z-20 flex flex-col"
                  >
                    <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-950/40">
                      <div className="flex items-center gap-2 text-indigo-400 font-display font-bold text-sm">
                        <Sparkles className="w-4.5 h-4.5" />
                        <span>HomieAI Hub Assistant</span>
                      </div>
                      <button onClick={() => setShowAIDrawer(false)} className="text-gray-400 hover:text-gray-200">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
                      {aiLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                          <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                          <p className="text-[11px] font-mono text-gray-400 animate-pulse">Gemini summarizing lounge notes...</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">Conversation Summary</p>
                          <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/5 whitespace-pre-wrap text-gray-200 leading-relaxed font-sans">
                            {aiSummary || "Click 'AI Summarize' at the top of the chat to ask Gemini to review the recent conversation."}
                          </div>
                          
                          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider mt-6">AI Sticker/Caption Assistant</p>
                          <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                            <p className="text-gray-300 mb-3">HomieAI can write captions for your stories. Attach a photo and test it!</p>
                            <button 
                              onClick={async () => {
                                setAiLoading(true);
                                try {
                                  const res = await fetch('/api/ai/caption', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                    body: JSON.stringify({ imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600' })
                                  });
                                  const d = await res.json();
                                  setAiSummary(`✨ Generated Photo Captions:\n\n${d.captions.map((c: string, idx: number) => `${idx + 1}. "${c}"`).join('\n')}`);
                                } catch {
                                  setAiSummary('Failed to connect to image model. Verify your GEMINI_API_KEY is configured.');
                                } finally { setAiLoading(false); }
                              }}
                              className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                            >
                              <Image className="w-3.5 h-3.5" />
                              Generate Caption for Photo
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* ====================================================
            STORIES FEED VIEW
            ==================================================== */}
        {activeMenu === 'stories' && (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white to-indigo-100 bg-clip-text text-transparent">Stories</h2>
                  <p className="text-gray-400 text-sm mt-1">Check out what your homies have been up to in the last 24 hours.</p>
                </div>
                <button 
                  onClick={() => setShowAddStory(true)}
                  className="px-5 py-2.5 bg-gradient-to-tr from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-display font-bold rounded-2xl flex items-center gap-2 shadow-lg shadow-indigo-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm"
                >
                  <Plus className="w-4 h-4" /> Share Memory
                </button>
              </div>

              {/* Stories View list */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                {stories.length > 0 ? stories.map(story => (
                  <button
                    key={story.id}
                    onClick={() => {
                      setViewingStoryGroup([story]);
                      // Register story view
                      fetch(`/api/chats/stories/${story.id}/view`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                      }).then(() => fetchStories());
                    }}
                    className="relative aspect-[3/4] rounded-3xl overflow-hidden group hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/5 bg-slate-900 shadow-md text-left"
                  >
                    <img src={story.mediaUrl} className="absolute inset-0 w-full h-full object-cover z-0 filter brightness-75 group-hover:brightness-90 transition-all" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/40 z-10"></div>
                    
                    {/* Top user profile tag */}
                    <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                      <img src={story.user?.avatarUrl} className="w-7 h-7 rounded-full border border-indigo-400" />
                      <span className="text-[11px] font-semibold font-display text-white">{story.user?.displayName}</span>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-between items-end">
                      <span className="text-[9px] font-mono text-gray-400 bg-black/40 px-2 py-0.5 rounded-md border border-white/5">
                        {new Date(story.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {story.viewers && story.viewers.length > 0 && (
                        <span className="text-[10px] font-mono text-gray-300 bg-white/10 px-2 py-0.5 rounded-full border border-white/5">
                          👁️ {story.viewers.length}
                        </span>
                      )}
                    </div>
                  </button>
                )) : (
                  <div className="col-span-4 p-12 text-center bg-slate-900/40 border border-white/5 rounded-3xl">
                    <p className="text-gray-400 text-sm">No active stories yet. Share a memory to start the feed!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            SHARED TODOS MODULE
            ==================================================== */}
        {activeMenu === 'todo' && (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent">Shared To-Do Board</h2>
                <p className="text-gray-400 text-sm mt-1">Coordinate group tasks, assign errands, and trace milestones together.</p>
              </div>

              {/* Creator form */}
              <div className="glass-card rounded-2xl p-6 mb-6">
                <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4">Add a Task</p>
                <div className="flex flex-col md:flex-row gap-4">
                  <input
                    type="text"
                    placeholder="e.g. Bring chips and drinks for the barbecue..."
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm"
                  />
                  <input
                    type="date"
                    value={newTodoDue}
                    onChange={(e) => setNewTodoDue(e.target.value)}
                    className="glass-input rounded-xl px-4 py-2.5 text-sm font-mono text-gray-400"
                  />
                  <button
                    onClick={handleCreateTodo}
                    className="px-6 py-2.5 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-cyan-500/10"
                  >
                    Add Task
                  </button>
                </div>
              </div>

              {/* Todo list items */}
              <div className="space-y-3">
                {todos.length > 0 ? todos.map(todo => (
                  <div 
                    key={todo.id}
                    className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl flex items-center justify-between hover:border-white/10 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleToggleTodo(todo.id)}
                        className={`w-5.5 h-5.5 rounded-lg border flex items-center justify-center transition-all ${
                          todo.isCompleted 
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                            : 'border-white/20 hover:border-cyan-400'
                        }`}
                      >
                        {todo.isCompleted && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <span className={`text-sm ${todo.isCompleted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                        {todo.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono text-gray-400">
                      {todo.dueDate && (
                        <span className="bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                          ⏳ Due: {todo.dueDate}
                        </span>
                      )}
                      <span className="hidden sm:inline">Created by @{todo.createdBy?.username}</span>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center bg-slate-900/40 border border-white/5 rounded-3xl">
                    <p className="text-gray-400 text-sm">No tasks added to the board yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            LOUNGE POLLS MODULE
            ==================================================== */}
        {activeMenu === 'poll' && (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent">Lounge Polls</h2>
                <p className="text-gray-400 text-sm mt-1">Settle friendly debates or plan weekends using live user vote tallies.</p>
              </div>

              {/* Creator form */}
              <div className="glass-card rounded-2xl p-6 mb-8">
                <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4">Create a New Poll</p>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-sm"
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pollOptions.map((opt, idx) => (
                      <input
                        key={idx}
                        type="text"
                        placeholder={`Option ${idx + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const updated = [...pollOptions];
                          updated[idx] = e.target.value;
                          setPollOptions(updated);
                        }}
                        className="glass-input rounded-xl px-4 py-2 text-sm"
                      />
                    ))}
                  </div>

                  <div className="flex justify-between">
                    <button 
                      onClick={() => setPollOptions(prev => [...prev, ''])}
                      className="text-xs text-cyan-400 font-semibold hover:underline"
                    >
                      + Add Option
                    </button>
                    <button
                      onClick={handleCreatePoll}
                      className="px-6 py-2 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-cyan-500/20"
                    >
                      Publish Poll
                    </button>
                  </div>
                </div>
              </div>

              {/* Display list */}
              <div className="space-y-6">
                {polls.length > 0 ? polls.map(poll => {
                  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
                  
                  return (
                    <div key={poll.id} className="glass-card rounded-2xl p-6">
                      <div className="flex justify-between items-baseline mb-4">
                        <h4 className="font-display font-bold text-lg text-gray-200">{poll.question}</h4>
                        <span className="text-[10px] font-mono text-gray-400">Published by @{poll.creator?.username}</span>
                      </div>

                      <div className="space-y-3">
                        {poll.options.map(option => {
                          const votesCount = option.votes?.length || 0;
                          const percent = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
                          const hasVoted = option.votes?.includes(user?.id || '');
                          
                          return (
                            <button
                              key={option.id}
                              onClick={() => handleVotePoll(poll.id, option.id)}
                              className="w-full text-left p-3.5 bg-slate-900/60 hover:bg-slate-900/90 border border-white/5 rounded-xl transition-all relative overflow-hidden group flex items-center justify-between"
                            >
                              {/* Background percentage bar */}
                              <div 
                                className="absolute left-0 top-0 bottom-0 bg-cyan-500/15 transition-all duration-500" 
                                style={{ width: `${percent}%` }}
                              />

                              <div className="relative z-10 flex items-center gap-3">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                                  hasVoted ? 'border-cyan-400 bg-cyan-500/20 text-cyan-400' : 'border-white/20'
                                }`}>
                                  {hasVoted && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                                </div>
                                <span className="text-sm font-semibold text-gray-300">{option.text}</span>
                              </div>

                              <div className="relative z-10 font-mono text-xs text-gray-400 flex items-center gap-2">
                                <span>{votesCount} votes</span>
                                <span className="font-bold text-cyan-400">({percent}%)</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <p className="mt-4 text-[10px] font-mono text-gray-400">Total votes logged: {totalVotes}</p>
                    </div>
                  );
                }) : (
                  <div className="p-12 text-center bg-slate-900/40 border border-white/5 rounded-3xl">
                    <p className="text-gray-400 text-sm">No polls are running at this time.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            HUB CALENDAR MODULE
            ==================================================== */}
        {activeMenu === 'calendar' && (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
                <div>
                  <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent">Hub Calendar</h2>
                  <p className="text-gray-400 text-sm mt-1">Settle event schedules, upcoming anniversaries, or friendly birthday cards.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Creator column */}
                <div className="glass-card rounded-2xl p-6 h-fit">
                  <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4">Add Hub Event</p>
                  <div className="space-y-4 text-xs font-mono">
                    <div>
                      <label className="text-[10px] text-gray-400">EVENT NAME</label>
                      <input
                        type="text"
                        placeholder="e.g. Homie Dinner Night"
                        value={eventTitle}
                        onChange={(e) => setEventTitle(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 mt-1 font-sans"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">DESCRIPTION (Optional)</label>
                      <textarea
                        placeholder="Details..."
                        rows={3}
                        value={eventDesc}
                        onChange={(e) => setEventDesc(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 mt-1 font-sans"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">START DATE & TIME</label>
                      <input
                        type="datetime-local"
                        value={eventStart}
                        onChange={(e) => setEventStart(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 mt-1 font-mono text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">END DATE & TIME</label>
                      <input
                        type="datetime-local"
                        value={eventEnd}
                        onChange={(e) => setEventEnd(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 mt-1 font-mono text-gray-400"
                      />
                    </div>
                    <button
                      onClick={handleCreateEvent}
                      className="w-full py-3 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-sans font-bold rounded-xl text-sm transition-all shadow-md shadow-cyan-500/10"
                    >
                      Schedule Event
                    </button>
                  </div>
                </div>

                {/* Listing column */}
                <div className="lg:col-span-2 space-y-4">
                  <p className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider mb-2">Scheduled Events</p>
                  
                  {events.length > 0 ? events.map(event => (
                    <div 
                      key={event.id}
                      className="p-5 bg-slate-900/60 border border-white/5 rounded-2xl flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-white/10 transition-all"
                    >
                      <div>
                        <h4 className="font-display font-bold text-base text-cyan-400">{event.title}</h4>
                        {event.description && <p className="text-xs text-gray-300 mt-1">{event.description}</p>}
                        
                        <div className="flex gap-4 text-[11px] font-mono text-gray-400 mt-3">
                          <span className="flex items-center gap-1">⏰ Start: {new Date(event.startDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                          <span className="flex items-center gap-1">⏳ End: {new Date(event.endDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 flex items-center gap-2 border-t md:border-t-0 md:border-l border-gray-800 pt-3 md:pt-0 md:pl-4 text-[10px] font-mono text-gray-400">
                        <span>Scheduled by @{event.creator?.username}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="p-12 text-center bg-slate-900/40 border border-white/5 rounded-3xl">
                      <p className="text-gray-400 text-sm">No events or anniversaries are scheduled.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            AI CHATBOT LOUNGE VIEW (GEMINI)
            ==================================================== */}
        {activeMenu === 'ai-chatbot' && (
          <div className="flex-1 flex flex-col bg-slate-950/10 overflow-hidden relative p-8">
            <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col overflow-hidden">
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
                    <Bot className="w-8 h-8 text-cyan-400" />
                    HomieAI Lounge
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">Vibe with Gemini inside your private social sanctuary.</p>
                </div>
                <button 
                  onClick={() => setChatbotHistory([])}
                  className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-mono rounded-xl transition-all"
                >
                  Clear History
                </button>
              </div>

              {/* Chat sandbox viewport */}
              <div className="flex-1 overflow-y-auto p-4 mb-4 bg-slate-950/40 border border-white/5 rounded-3xl space-y-4 scroll-smooth">
                {chatbotHistory.length > 0 ? chatbotHistory.map((h, idx) => (
                  <div key={idx} className={`flex ${h.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-4 rounded-2xl max-w-[75%] leading-relaxed ${
                      h.role === 'user' 
                        ? 'bg-gradient-to-br from-purple-600 to-indigo-700 rounded-tr-none text-white text-sm font-semibold shadow-xl shadow-purple-900/20' 
                        : 'bg-white/10 backdrop-blur-sm rounded-tl-none text-gray-200 border border-white/10 text-sm whitespace-pre-wrap'
                    }`}>
                      <p className="text-[10px] font-mono text-white/40 mb-1">
                        {h.role === 'user' ? 'You' : 'HomieAI'}
                      </p>
                      {h.text}
                    </div>
                  </div>
                )) : (
                  <div className="h-full flex flex-col justify-center items-center text-center p-6 space-y-4 text-xs">
                    <Sparkles className="w-10 h-10 text-cyan-400 animate-pulse" />
                    <p className="text-gray-400 max-w-xs font-sans text-sm">
                      "Yo! I'm HomieAI, your virtual buddy. Ask me to draft a weekend party planner, suggest a game to play tonight, or settle a fun debate."
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-md pt-2 font-mono">
                      {[
                        "Plan a beach picnic weekend list",
                        "Settle debate: is pineapple fine on pizza?",
                        "Give me 5 chat game icebreakers"
                      ].map(preset => (
                        <button
                          key={preset}
                          onClick={() => setChatbotInput(preset)}
                          className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-300 rounded-xl"
                        >
                          "{preset}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatbotLoading && (
                  <div className="flex justify-start">
                    <div className="p-4 bg-slate-900 rounded-tl-none rounded-2xl border border-white/5 flex items-center gap-2">
                      <div className="w-4 h-4 border border-t-cyan-400 rounded-full animate-spin"></div>
                      <span className="text-xs font-mono text-gray-400 animate-pulse">HomieAI is thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chatbot input controls */}
              <form onSubmit={handleChatbotSubmit} className="flex gap-3">
                <input
                  type="text"
                  placeholder="Chat with HomieAI companion..."
                  value={chatbotInput}
                  onChange={(e) => setChatbotInput(e.target.value)}
                  className="flex-1 glass-input rounded-2xl px-5 py-3.5 text-sm"
                />
                <button
                  type="submit"
                  className="p-4 bg-gradient-to-tr from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white rounded-2xl shadow-lg shadow-cyan-500/20 transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ====================================================
            ADMIN PANEL VIEW (PHASE 13)
            ==================================================== */}
        {activeMenu === 'admin' && (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="max-w-6xl mx-auto animate-fade-in">
              <div className="mb-8 flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                  <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
                    <ShieldAlert className="text-cyan-400 w-8 h-8" />
                    Admin Command Center
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">Monitor server health, manage users, moderate content, and control feature flags.</p>
                </div>

                {/* Sub Tab Navigation */}
                <div className="flex bg-slate-950/40 p-1.5 rounded-xl border border-white/5 font-mono text-xs overflow-x-auto gap-1">
                  {[
                    { id: 'overview', label: 'Overview', icon: BarChart2 },
                    { id: 'users', label: 'Users', icon: Users },
                    { id: 'moderation', label: 'Moderation', icon: AlertTriangle },
                    { id: 'flags', label: 'Feature Flags', icon: Settings },
                    { id: 'logs', label: 'Audit Logs', icon: Bot }
                  ].map(tab => {
                    const TabIcon = tab.icon;
                    const isTabActive = adminTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setAdminTab(tab.id as any)}
                        className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                          isTabActive 
                            ? 'bg-gradient-to-r from-cyan-400 to-purple-500 text-slate-950 font-bold shadow-md shadow-cyan-500/10' 
                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        }`}
                      >
                        <TabIcon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {adminLoading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                  <div className="w-12 h-12 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin"></div>
                  <p className="text-xs font-mono text-gray-400 animate-pulse">Querying administrative services...</p>
                </div>
              ) : (
                <>
                  {/* OVERVIEW SUB-TAB */}
                  {adminTab === 'overview' && adminAnalytics && (
                    <div className="space-y-8">
                      {/* Stat Counters Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'Total Accounts', value: adminAnalytics.counters.totalUsers, desc: `${adminAnalytics.counters.onlineUsers} Active Now`, color: 'text-cyan-400' },
                          { label: 'Messages Exchanged', value: adminAnalytics.counters.totalMessages, desc: 'Lounge conversations', color: 'text-purple-400' },
                          { label: 'Calling Streams', value: adminAnalytics.counters.totalCalls, desc: 'WebRTC call logs', color: 'text-indigo-400' },
                          { label: 'Database Storage', value: `${adminAnalytics.counters.storageUsedMB} MB`, desc: 'Persistent JSON mode', color: 'text-pink-400' }
                        ].map((stat, idx) => (
                          <div key={idx} className="glass-card p-5 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">{stat.label}</p>
                            <h3 className={`text-2xl font-extrabold font-display ${stat.color} mt-2`}>{stat.value}</h3>
                            <p className="text-[10px] text-gray-500 font-mono mt-1">{stat.desc}</p>
                          </div>
                        ))}
                      </div>

                      {/* Health Metrics & Server stats */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Server Metrics Panel */}
                        <div className="lg:col-span-1 glass-card p-6 rounded-2xl space-y-6">
                          <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Server Diagnostics</p>
                          
                          <div className="space-y-4 text-xs font-mono">
                            {/* CPU usage */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">CPU UTILIZATION</span>
                                <span className="text-cyan-400 font-bold">{adminAnalytics.metrics.cpuUsagePercent}%</span>
                              </div>
                              <div className="w-full bg-slate-950/60 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-cyan-400 h-1.5 transition-all duration-500" style={{ width: `${adminAnalytics.metrics.cpuUsagePercent}%` }}></div>
                              </div>
                            </div>

                            {/* RAM usage */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">RAM MEMORY</span>
                                <span className="text-purple-400 font-bold">{adminAnalytics.metrics.memoryUsedGB} GB / {adminAnalytics.metrics.memoryTotalGB} GB</span>
                              </div>
                              <div className="w-full bg-slate-950/60 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-purple-500 h-1.5 transition-all duration-500" style={{ width: `${(adminAnalytics.metrics.memoryUsedGB / adminAnalytics.metrics.memoryTotalGB) * 100}%` }}></div>
                              </div>
                            </div>

                            {/* Network / Latency */}
                            <div className="flex justify-between py-1 border-b border-white/5">
                              <span className="text-gray-400">API GATEWAY LATENCY</span>
                              <span className="text-emerald-400">{adminAnalytics.metrics.apiLatencyMs} ms</span>
                            </div>

                            {/* Uptime */}
                            <div className="flex justify-between py-1 border-b border-white/5">
                              <span className="text-gray-400">SERVER RUNTIME</span>
                              <span className="text-gray-200">
                                {Math.floor(adminAnalytics.metrics.uptimeSeconds / 3600)}h {Math.floor((adminAnalytics.metrics.uptimeSeconds % 3600) / 60)}m
                              </span>
                            </div>

                            {/* Env */}
                            <div className="flex justify-between py-1 border-b border-white/5">
                              <span className="text-gray-400">CONTAINER PORT</span>
                              <span className="text-indigo-400">3000 (INGRESS HOST)</span>
                            </div>

                            {/* Database connection status */}
                            <div className="flex justify-between py-1">
                              <span className="text-gray-400">DATABASE HEALTH</span>
                              <span className="flex items-center gap-1.5 text-emerald-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                ACTIVE FALLBACK
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* User Engagement Trend mockup using clean SVGs & Tailwind */}
                        <div className="lg:col-span-2 glass-card p-6 rounded-2xl flex flex-col justify-between">
                          <div>
                            <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4">Lounge Traffic Trend (DAU)</p>
                            <p className="text-xs text-gray-400 mb-6">Real-time daily active user fluctuations across HomieHub lounges.</p>
                          </div>

                          {/* Beautiful SVG Sparkline Graph */}
                          <div className="flex-1 min-h-[160px] flex items-end justify-between gap-2 px-2 font-mono text-[10px] text-gray-500">
                            {adminAnalytics.engagementTrend.map((t: any, idx: number) => {
                              const pct = Math.min(((t.active / Math.max(...adminAnalytics.engagementTrend.map((v: any) => v.active))) * 100) || 10, 100);
                              return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-3 group">
                                  <div className="w-full relative flex items-end justify-center min-h-[110px]">
                                    {/* Tooltip on hover */}
                                    <div className="absolute bottom-full mb-1 bg-slate-900 border border-white/10 px-2 py-0.5 rounded text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap">
                                      {t.active} Homies
                                    </div>
                                    <div 
                                      className="w-8 rounded-t-lg bg-gradient-to-t from-purple-600/30 via-cyan-400/80 to-cyan-300 hover:from-purple-600/40 hover:to-cyan-400 transition-all shadow-lg shadow-cyan-500/10 cursor-pointer" 
                                      style={{ height: `${pct}%`, minHeight: '8px' }}
                                    ></div>
                                  </div>
                                  <span>{t.date}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* USERS SUB-TAB */}
                  {adminTab === 'users' && (
                    <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
                      <div className="p-5 bg-slate-950/40 border-b border-white/5">
                        <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Account Registry</p>
                      </div>

                      <div className="overflow-x-auto text-xs font-sans">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-slate-950/20 text-gray-400 uppercase font-mono text-[9px] tracking-wider text-nowrap">
                              <th className="p-4">Profile Identity</th>
                              <th className="p-4">Account Status</th>
                              <th className="p-4">Lounge Streak</th>
                              <th className="p-4">Role Privileges</th>
                              <th className="p-4 text-right">Moderator Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminUsers.map(u => (
                              <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-all">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="relative">
                                      <img src={u.avatarUrl} className="w-10 h-10 rounded-full border border-white/10" />
                                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-slate-950 rounded-full ${
                                        u.onlineStatus === 'online' ? 'bg-emerald-500' : u.onlineStatus === 'idle' ? 'bg-amber-500' : 'bg-gray-500'
                                      }`}></span>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <h5 className="font-semibold text-gray-200">{u.displayName}</h5>
                                        {u.isVerified && (
                                          <span className="px-1.5 py-0.5 bg-cyan-400/10 text-cyan-400 font-mono text-[8px] font-bold rounded-md border border-cyan-400/20 text-nowrap">
                                            ✓ VERIFIED
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-gray-400 font-mono">@{u.username} • {u.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="flex flex-wrap gap-1">
                                    {u.isBanned && (
                                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded font-mono text-[9px] text-nowrap">
                                        ❌ BANNED
                                      </span>
                                    )}
                                    {u.isSuspended && (
                                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-mono text-[9px] text-nowrap">
                                        ⚠️ SUSPENDED
                                      </span>
                                    )}
                                    {!u.isBanned && !u.isSuspended && (
                                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono text-[9px] text-nowrap">
                                        ● ACTIVE
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4 font-mono text-[11px] text-amber-500">
                                  <div className="flex items-center gap-1">
                                    <Flame className="w-3.5 h-3.5 fill-amber-500/20" />
                                    <span>{u.streakCount || 0} days</span>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <select
                                    value={u.role || 'user'}
                                    disabled={u.id === user?.id}
                                    onChange={(e) => handleChangeUserRole(u.id, e.target.value as any)}
                                    className="bg-slate-900 border border-white/5 rounded-xl px-2.5 py-1 text-[11px] text-gray-300 font-mono focus:border-cyan-400"
                                  >
                                    <option value="user">User</option>
                                    <option value="admin">Administrator</option>
                                  </select>
                                </td>
                                <td className="p-4 text-right">
                                  <div className="inline-flex gap-2 flex-wrap justify-end">
                                    {/* Verify badge Toggle */}
                                    <button
                                      onClick={() => handleToggleUserVerify(u.id)}
                                      className="px-2.5 py-1.5 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-400 border border-cyan-400/20 rounded-xl text-[10px] font-mono transition-all text-nowrap"
                                      title="Toggle Verification Badge"
                                    >
                                      Verify
                                    </button>

                                    {/* Suspend Toggle */}
                                    <button
                                      onClick={() => handleToggleUserSuspend(u.id)}
                                      disabled={u.id === user?.id}
                                      className={`px-2.5 py-1.5 border rounded-xl text-[10px] font-mono transition-all disabled:opacity-40 text-nowrap ${
                                        u.isSuspended 
                                          ? 'bg-amber-400/20 border-amber-400/30 text-amber-300 hover:bg-amber-400/30' 
                                          : 'bg-amber-500/10 border-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                      }`}
                                    >
                                      {u.isSuspended ? 'Lift Suspend' : 'Suspend'}
                                    </button>

                                    {/* Ban Toggle */}
                                    <button
                                      onClick={() => handleToggleUserBan(u.id)}
                                      disabled={u.id === user?.id}
                                      className={`px-2.5 py-1.5 border rounded-xl text-[10px] font-mono transition-all disabled:opacity-40 text-nowrap ${
                                        u.isBanned 
                                          ? 'bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30' 
                                          : 'bg-red-500/10 border-red-500/10 text-red-400 hover:bg-red-500/20'
                                      }`}
                                    >
                                      {u.isBanned ? 'Unban' : 'Ban'}
                                    </button>

                                    {/* Delete Permanently */}
                                    <button
                                      onClick={() => handleDeleteUser(u.id)}
                                      disabled={u.id === user?.id}
                                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all disabled:opacity-40 inline-flex items-center align-middle"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* MODERATION SUB-TAB */}
                  {adminTab === 'moderation' && (
                    <div className="space-y-6">
                      <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
                        <div className="p-5 bg-slate-950/40 border-b border-white/5">
                          <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Content & Media Reports</p>
                        </div>

                        <div className="overflow-x-auto text-xs">
                          {adminReports.length > 0 ? (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-white/5 bg-slate-950/20 text-gray-400 uppercase font-mono text-[9px] tracking-wider text-nowrap">
                                  <th className="p-4">Report Details</th>
                                  <th className="p-4">Reporter</th>
                                  <th className="p-4">Flagged Content</th>
                                  <th className="p-4">Status</th>
                                  <th className="p-4 text-right">Moderator Resolution</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adminReports.map(report => (
                                  <tr key={report.id} className="border-b border-white/5 hover:bg-white/5 transition-all">
                                    <td className="p-4">
                                      <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded text-[9px] font-mono uppercase">
                                        {report.contentType}
                                      </span>
                                      <p className="font-semibold text-gray-300 mt-2">Reason: "{report.reason}"</p>
                                      <span className="text-[9px] font-mono text-gray-500">ID: {report.contentId}</span>
                                    </td>
                                    <td className="p-4 font-mono">@{report.reporterUsername}</td>
                                    <td className="p-4 max-w-xs truncate">
                                      {report.reportedContent?.startsWith('http') ? (
                                        <div className="flex items-center gap-2">
                                          <img src={report.reportedContent} className="w-10 h-10 object-cover rounded border border-white/10" />
                                          <span className="text-[10px] text-gray-400 truncate">{report.reportedContent}</span>
                                        </div>
                                      ) : (
                                        <p className="text-gray-300 italic">"{report.reportedContent}"</p>
                                      )}
                                    </td>
                                    <td className="p-4">
                                      <span className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase ${
                                        report.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      }`}>
                                        {report.status} {report.resolution ? `(${report.resolution})` : ''}
                                      </span>
                                    </td>
                                    <td className="p-4 text-right text-nowrap">
                                      {report.status === 'pending' ? (
                                        <div className="inline-flex gap-2">
                                          <button
                                            onClick={() => handleResolveReport(report.id, 'delete')}
                                            className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-mono text-[10px]"
                                          >
                                            Delete Content
                                          </button>
                                          <button
                                            onClick={() => handleResolveReport(report.id, 'dismiss')}
                                            className="px-2.5 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 text-gray-300 border border-white/10 rounded-xl font-mono text-[10px]"
                                          >
                                            Dismiss
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-[11px] font-mono text-gray-500">RESOLVED</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="p-12 text-center text-gray-400">
                              No reported lounge items pending moderation. HomieHub is safe! ✨
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* FEATURE FLAGS SUB-TAB */}
                  {adminTab === 'flags' && (
                    <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
                      <div className="p-5 bg-slate-950/40 border-b border-white/5">
                        <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Dynamic Platform Feature Controls</p>
                      </div>

                      <div className="p-6 space-y-4 text-xs font-mono">
                        {adminFeatureFlags.map(flag => (
                          <div 
                            key={flag.id}
                            className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl flex items-center justify-between hover:border-white/10 transition-all gap-4"
                          >
                            <div>
                              <h4 className="font-semibold text-gray-200 font-sans text-sm">{flag.label}</h4>
                              <p className="text-[10px] text-gray-500 mt-1 font-mono">Key: "{flag.key}"</p>
                            </div>

                            {/* Custom Styled Switch */}
                            <button
                              onClick={() => handleToggleFeatureFlag(flag.key, flag.value)}
                              className={`w-12 h-6.5 rounded-full p-1 transition-all flex items-center ${
                                flag.value ? 'bg-cyan-400 justify-end' : 'bg-slate-950 justify-start border border-white/10'
                              }`}
                            >
                              <div className={`w-4.5 h-4.5 rounded-full shadow-md ${flag.value ? 'bg-slate-950' : 'bg-gray-400'}`}></div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AUDIT LOGS SUB-TAB */}
                  {adminTab === 'logs' && (
                    <div className="glass-card rounded-2xl overflow-hidden border border-white/5">
                      <div className="p-5 bg-slate-950/40 border-b border-white/5 flex justify-between items-center gap-4">
                        <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">System Audit & Access Logs</p>
                        <button 
                          onClick={fetchAdminLogs}
                          className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] font-mono border border-white/5 rounded"
                        >
                          Refresh Logs
                        </button>
                      </div>

                      <div className="p-5 font-mono text-xs max-h-[500px] overflow-y-auto space-y-2 select-text">
                        {adminLogs.length > 0 ? adminLogs.map((log, idx) => (
                          <div key={idx} className="py-2 px-3 bg-slate-950/40 border border-white/5 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-slate-950/60 transition-all">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] text-gray-500 text-nowrap">
                                {new Date(log.timestamp).toLocaleString([], { hour12: false })}
                              </span>
                              <span className="px-1.5 py-0.5 bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 rounded text-[9px] uppercase font-bold text-nowrap">
                                {log.action}
                              </span>
                              <span className="text-gray-300 text-[11px]">{log.details}</span>
                            </div>
                            <span className="text-[10px] text-purple-400 self-end md:self-auto font-bold text-nowrap">
                              @{log.operator}
                            </span>
                          </div>
                        )) : (
                          <div className="text-center text-gray-500 py-12">
                            No logs logged yet. Actions on flags, bans, and verification populate logs.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ====================================================
            SETTINGS & PROFILE CANVAS
            ==================================================== */}
        {activeMenu === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="max-w-3xl mx-auto">
              <div className="mb-8">
                <h2 className="font-display font-extrabold text-3xl tracking-tight bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent">Profile & Customization</h2>
                <p className="text-gray-400 text-sm mt-1">Update your private lounge card, link social handles, and adjust credentials.</p>
              </div>

              <div className="space-y-6">
                {/* Media assets */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Aesthetic Identity</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs font-semibold text-gray-400 font-mono">AVATAR PHOTO URL</label>
                      <input
                        type="text"
                        value={editAvatar}
                        onChange={(e) => setEditAvatar(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2 mt-2 text-sm font-mono"
                      />
                      {editAvatar && <img src={editAvatar} className="w-16 h-16 rounded-full border border-cyan-500/20 mt-3" />}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 font-mono">COVER PHOTO URL</label>
                      <input
                        type="text"
                        value={editCover}
                        onChange={(e) => setEditCover(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2 mt-2 text-sm font-mono"
                      />
                      {editCover && <img src={editCover} className="w-full h-16 object-cover rounded-xl mt-3" />}
                    </div>
                  </div>
                </div>

                {/* Profile Card Fields */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <p className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">Card Details</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-400 font-mono">DISPLAY NAME</label>
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="w-full glass-input rounded-xl px-4 py-2.5 mt-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-400 font-mono">BIO DETAILS</label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        rows={3}
                        className="w-full glass-input rounded-xl px-4 py-2.5 mt-2 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Social links */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <p className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider">Lounge Connections (Socials)</p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Instagram className="w-5 h-5 text-pink-500 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Instagram handle..."
                        value={editInsta}
                        onChange={(e) => setEditInsta(e.target.value)}
                        className="flex-1 glass-input rounded-xl px-4 py-2 text-sm font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Twitter className="w-5 h-5 text-sky-500 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Twitter handle..."
                        value={editTwitter}
                        onChange={(e) => setEditTwitter(e.target.value)}
                        className="flex-1 glass-input rounded-xl px-4 py-2 text-sm font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <Github className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="GitHub handle..."
                        value={editGit}
                        onChange={(e) => setEditGit(e.target.value)}
                        className="flex-1 glass-input rounded-xl px-4 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  className="w-full py-4 bg-gradient-to-tr from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-display font-bold rounded-2xl shadow-lg shadow-cyan-500/20 transition-all"
                >
                  Save Profile Identity Card
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ----------------------------------------------------
          MODAL: NEW CHAT CREATION
          ---------------------------------------------------- */}
      <AnimatePresence>
        {showNewChatModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md glass-card rounded-3xl p-6 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-display font-bold text-lg text-gray-100">Start Conversation</h3>
                <button onClick={() => setShowNewChatModal(false)} className="text-gray-400 hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Chat Type Segment */}
                <div className="flex bg-slate-950/40 p-1.5 rounded-xl border border-white/5 font-mono text-xs">
                  <button 
                    onClick={() => { setIsGroupChatCreation(false); setSelectedParticipants([]); }}
                    className={`flex-1 py-2 rounded-lg font-semibold transition-all ${!isGroupChatCreation ? 'bg-cyan-500 text-gray-950 shadow-md shadow-cyan-500/10' : 'text-gray-400'}`}
                  >
                    Direct Message
                  </button>
                  <button 
                    onClick={() => { setIsGroupChatCreation(true); }}
                    className={`flex-1 py-2 rounded-lg font-semibold transition-all ${isGroupChatCreation ? 'bg-cyan-500 text-gray-950 shadow-md shadow-cyan-500/10' : 'text-gray-400'}`}
                  >
                    Group Lounge
                  </button>
                </div>

                {/* Group Details */}
                {isGroupChatCreation && (
                  <div>
                    <label className="text-[10px] font-mono text-gray-400">GROUP NAME</label>
                    <input
                      type="text"
                      placeholder="e.g. Squad Goals 🚀"
                      value={newChatName}
                      onChange={(e) => setNewChatName(e.target.value)}
                      className="w-full glass-input rounded-xl px-4 py-2 mt-1.5 text-sm"
                    />
                  </div>
                )}

                {/* Participant selection list */}
                <div>
                  <label className="text-[10px] font-mono text-gray-400">SELECT FRIENDS</label>
                  <div className="max-h-48 overflow-y-auto mt-2 space-y-1.5 pr-1 text-xs">
                    {usersList.length > 0 ? usersList.map(u => {
                      const isSelected = selectedParticipants.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            if (isGroupChatCreation) {
                              setSelectedParticipants(prev => isSelected ? prev.filter(id => id !== u.id) : [...prev, u.id]);
                            } else {
                              setSelectedParticipants([u.id]);
                            }
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl transition-all ${
                            isSelected ? 'bg-cyan-500/15 border border-cyan-500/20' : 'hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <img src={u.avatarUrl} className="w-8 h-8 rounded-full" />
                            <div className="text-left">
                              <h5 className="font-semibold">{u.displayName}</h5>
                              <p className="text-[10px] font-mono text-gray-400">@{u.username}</p>
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-cyan-500 bg-cyan-400 text-gray-950 shadow shadow-cyan-500/20' : 'border-white/20'
                          }`}>
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                        </button>
                      );
                    }) : (
                      <p className="text-gray-400 text-center py-4 font-mono">No other homies found.</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleCreateNewChat}
                  disabled={selectedParticipants.length === 0}
                  className="w-full py-3 bg-gradient-to-r from-cyan-400 to-purple-600 hover:from-cyan-500 hover:to-purple-700 text-white font-display font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:pointer-events-none mt-2"
                >
                  {isGroupChatCreation ? 'Create Group Lounge' : 'Start Private Chat'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
