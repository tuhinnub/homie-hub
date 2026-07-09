/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.js';
import { Message, User } from '../types.js';

interface CallState {
  isIncoming: boolean;
  isActive: boolean;
  callerId?: string;
  callerName?: string;
  callerAvatar?: string;
  callerSocketId?: string;
  type?: 'voice' | 'video';
  localStream?: MediaStream;
  remoteStream?: MediaStream;
}

interface SocketContextType {
  socket: Socket | null;
  sendMessage: (chatId: string, content: string, type?: string, mediaUrl?: string, mediaName?: string, replyToId?: string) => void;
  sendTyping: (chatId: string) => void;
  sendStopTyping: (chatId: string) => void;
  typingUsers: { [chatId: string]: string[] };
  incomingMessages: Message[];
  clearIncomingMessages: () => void;
  
  // Calling controls
  callState: CallState;
  initiateCall: (targetUser: User, type: 'voice' | 'video') => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ [chatId: string]: string[] }>({});
  const [incomingMessages, setIncomingMessages] = useState<Message[]>([]);

  // Calling States
  const [callState, setCallState] = useState<CallState>({ isIncoming: false, isActive: false });
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Ref pointers to prevent race conditions or state closures
  const activeCallSocketIdRef = useRef<string | null>(null);
  const activeCallUserIdRef = useRef<string | null>(null);

  // Initialize Socket Connection
  useEffect(() => {
    if (!user || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const socketUrl = window.location.origin;
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('⚡ Socket connected to server:', newSocket.id);
      newSocket.emit('identify', user.id);
      newSocket.emit('register-user-channel', user.id);
    });

    // Handle typing events
    newSocket.on('typing', (data: { chatId: string; username: string }) => {
      setTypingUsers(prev => {
        const users = prev[data.chatId] || [];
        if (!users.includes(data.username)) {
          return { ...prev, [data.chatId]: [...users, data.username] };
        }
        return prev;
      });
    });

    newSocket.on('stop-typing', (data: { chatId: string; username: string }) => {
      setTypingUsers(prev => {
        const users = prev[data.chatId] || [];
        return { ...prev, [data.chatId]: users.filter(u => u !== data.username) };
      });
    });

    // Handle incoming messages
    newSocket.on('receive-message', (msg: Message) => {
      setIncomingMessages(prev => [...prev, msg]);
    });

    // ----------------------------------------------------
    // WebRTC CALL SIGNALING RECEIVERS
    // ----------------------------------------------------

    newSocket.on('incoming-call', async (data: {
      callerId: string;
      callerName: string;
      callerAvatar: string;
      type: 'voice' | 'video';
      offer: any;
      socketId: string;
    }) => {
      console.log('📞 Incoming call signaling received:', data);
      activeCallSocketIdRef.current = data.socketId;
      activeCallUserIdRef.current = data.callerId;

      setCallState({
        isIncoming: true,
        isActive: false,
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        callerSocketId: data.socketId,
        type: data.type
      });

      // Save the offer so we can apply it when accepting
      (window as any)._pendingOffer = data.offer;
    });

    newSocket.on('call-answered', async (data: { answer: any; answererId: string }) => {
      console.log('📞 Call answered signaling received. Applying answer SDP.');
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setCallState(prev => ({ ...prev, isActive: true, isIncoming: false }));
      }
    });

    newSocket.on('ice-candidate', async (data: { candidate: any }) => {
      console.log('❄️ ICE Candidate received.');
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      }
    });

    newSocket.on('call-declined', () => {
      console.log('📞 Call declined by target user.');
      cleanupCall();
    });

    newSocket.on('call-ended', () => {
      console.log('📞 Call ended by remote user.');
      cleanupCall();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, token]);

  // Cleanup call helper
  const cleanupCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    activeCallSocketIdRef.current = null;
    activeCallUserIdRef.current = null;
    (window as any)._pendingOffer = null;
    
    setCallState({ isIncoming: false, isActive: false });
  };

  // ----------------------------------------------------
  // CLIENT ACTIONS
  // ----------------------------------------------------

  const sendMessage = (chatId: string, content: string, type = 'text', mediaUrl?: string, mediaName?: string, replyToId?: string) => {
    if (!socket || !user) return;

    const mockMsg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      chatId,
      sender: user,
      content,
      messageType: type as any,
      mediaUrl,
      mediaName,
      replyToId,
      reactions: [],
      isPinned: false,
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    // Emit live message to Socket.IO
    socket.emit('send-message', mockMsg);

    // Persist on database asynchronously
    fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        content,
        messageType: type,
        mediaUrl,
        mediaName,
        replyToId
      })
    }).catch(err => console.error('Failed to persist message', err));
  };

  const sendTyping = (chatId: string) => {
    if (socket && user) {
      socket.emit('typing', { chatId, username: user.displayName });
    }
  };

  const sendStopTyping = (chatId: string) => {
    if (socket && user) {
      socket.emit('stop-typing', { chatId, username: user.displayName });
    }
  };

  const clearIncomingMessages = () => {
    setIncomingMessages([]);
  };

  // ----------------------------------------------------
  // WebRTC HANDLERS (Calling)
  // ----------------------------------------------------

  const createPeerConnection = (targetSocketId?: string, targetUserId?: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          targetSocketId,
          targetUserId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('📹 Remote stream track received.');
      const [remoteStream] = event.streams;
      
      setCallState(prev => ({ ...prev, remoteStream }));

      // Attach to remote video element ref
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  };

  const initiateCall = async (targetUser: User, type: 'voice' | 'video') => {
    if (!socket || !user) return;
    try {
      console.log(`📞 Setting up local stream for ${type} call...`);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      });

      localStreamRef.current = stream;
      setCallState({
        isIncoming: false,
        isActive: true,
        callerId: targetUser.id,
        callerName: targetUser.displayName,
        callerAvatar: targetUser.avatarUrl,
        type,
        localStream: stream
      });

      // Show local video feed instantly
      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }, 300);

      const pc = createPeerConnection(undefined, targetUser.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call-user', {
        targetUserId: targetUser.id,
        callerId: user.id,
        callerName: user.displayName,
        callerAvatar: user.avatarUrl,
        type,
        offer
      });

      activeCallUserIdRef.current = targetUser.id;
    } catch (err) {
      console.error('Failed to access media devices for call:', err);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!socket || !user || !callState.callerSocketId) return;
    try {
      console.log(`📞 Accepting call from caller socket: ${callState.callerSocketId}`);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.type === 'video'
      });

      localStreamRef.current = stream;
      setCallState(prev => ({ ...prev, isActive: true, isIncoming: false, localStream: stream }));

      // Show local video feed instantly
      setTimeout(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }, 300);

      const pc = createPeerConnection(callState.callerSocketId);
      
      const offer = (window as any)._pendingOffer;
      if (offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer-call', {
          callerSocketId: callState.callerSocketId,
          targetUserId: user.id,
          answer
        });
      }
    } catch (err) {
      console.error('Failed to accept call:', err);
      cleanupCall();
    }
  };

  const declineCall = () => {
    if (socket && callState.callerSocketId) {
      socket.emit('decline-call', { targetSocketId: callState.callerSocketId });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (socket) {
      if (callState.callerSocketId) {
        socket.emit('end-call', { targetSocketId: callState.callerSocketId });
      } else if (activeCallUserIdRef.current) {
        socket.emit('end-call', { targetUserId: activeCallUserIdRef.current });
      }
    }
    cleanupCall();
  };

  return (
    <SocketContext.Provider value={{
      socket,
      sendMessage,
      sendTyping,
      sendStopTyping,
      typingUsers,
      incomingMessages,
      clearIncomingMessages,
      
      // Call states & utilities
      callState,
      initiateCall,
      acceptCall,
      declineCall,
      endCall,
      localVideoRef,
      remoteVideoRef
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within an SocketProvider');
  }
  return context;
};
