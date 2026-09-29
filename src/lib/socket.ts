import { io, Socket } from 'socket.io-client';
import { apiClient } from './api';

type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
type StatusCallback = (status: ConnectionStatus) => void;
type PresenceCallback = (onlineUserIds: string[]) => void;
type EventCallback = (data: any) => void;

class SocketService {
  private socket: Socket | null = null;
  private statusListeners = new Set<StatusCallback>();
  private presenceListeners = new Set<PresenceCallback>();
  private onlineUsers = new Set<string>();
  private status: ConnectionStatus = 'disconnected';

  init() {
    const token = apiClient.getToken();
    if (!token) return;

    if (this.socket) {
      this.socket.disconnect();
    }

    this.setStatus('reconnecting');

    const wsUrl = (
      (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_WS_URL || import.meta.env?.VITE_SOCKET_URL || import.meta.env?.VITE_API_URL)) ||
      undefined
    );

    // Connect to real domain or fallback to host
    const socketOptions = {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    };

    this.socket = wsUrl ? io(wsUrl, socketOptions) : io(socketOptions);

    this.socket.on('connect', () => {
      console.log('[Socket] Connected to real-time server');
      this.setStatus('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.setStatus(reason === 'io server disconnect' ? 'disconnected' : 'reconnecting');
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[Socket] Connect error:', error.message);
      this.setStatus('reconnecting');
    });

    // Presence sync from server
    this.socket.on('user:presence_sync', ({ onlineUserIds }: { onlineUserIds: string[] }) => {
      this.onlineUsers = new Set(onlineUserIds);
      this.notifyPresence();
    });

    // Real-time user joined/online
    this.socket.on('user:online', ({ userId }: { userId: string }) => {
      this.onlineUsers.add(userId);
      this.notifyPresence();
    });

    // Real-time user disconnected/offline
    this.socket.on('user:offline', ({ userId }: { userId: string }) => {
      this.onlineUsers.delete(userId);
      this.notifyPresence();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.onlineUsers.clear();
    this.setStatus('disconnected');
    this.notifyPresence();
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private notifyPresence() {
    const list = Array.from(this.onlineUsers);
    this.presenceListeners.forEach((cb) => cb(list));
  }

  onStatusChange(cb: StatusCallback) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  onPresenceChange(cb: PresenceCallback) {
    this.presenceListeners.add(cb);
    cb(Array.from(this.onlineUsers));
    return () => {
      this.presenceListeners.delete(cb);
    };
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  on(event: string, callback: EventCallback) {
    if (!this.socket) return () => {};
    this.socket.on(event, callback);
    return () => {
      this.socket?.off(event, callback);
    };
  }

  emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }

  joinConversation(conversationId: string) {
    this.emit('conversation:join', { conversationId });
  }

  leaveConversation(conversationId: string) {
    this.emit('conversation:leave', { conversationId });
  }

  startTyping(conversationId: string) {
    this.emit('user:typing_start', { conversationId });
  }

  stopTyping(conversationId: string) {
    this.emit('user:typing_stop', { conversationId });
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
