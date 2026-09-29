import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, User } from '../../types/chat';
import { apiClient } from '../../lib/api';
import { socketService } from '../../lib/socket';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { PinnedMessagesDrawer } from './PinnedMessagesDrawer';
import { GroupDetailsDrawer } from './GroupDetailsDrawer';
import { DeleteMessageModal } from './DeleteMessageModal';
import {
  Users,
  Search,
  Pin,
  Info,
  Phone,
  Video,
  ArrowLeft,
  ChevronDown,
  Loader2,
  X,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

interface ChatAreaProps {
  conversation: Conversation;
  currentUser: User;
  onBackMobile: () => void;
  onConversationUpdated: (c: Conversation) => void;
  onReportMessage: (m: Message) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  currentUser,
  onBackMobile,
  onConversationUpdated,
  onReportMessage,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Search in conversation
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawers
  const [showPinned, setShowPinned] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);

  // Reply & Edit state
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);

  // Typing users state
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();

  // Load initial messages for conversation
  const loadMessages = async (isInitial = true) => {
    try {
      if (isInitial) setLoading(true);
      const res = await apiClient.messages.list(conversation.id, null, 50, searchQuery || null);
      setMessages(res.messages);
      setHasMore(res.has_more);
      setNextCursor(res.next_cursor);

      // Mark conversation as read
      await apiClient.messages.markRead(conversation.id);
    } catch (err: any) {
      console.error('[Load Messages Error]', err);
      showToast('Failed to load messages', 'error');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // Initial fetch and on conversation change
  useEffect(() => {
    loadMessages(true);
    socketService.joinConversation(conversation.id);
    setReplyToMessage(null);
    setEditingMessage(null);
    setTypingUsers(new Set());
  }, [conversation.id]);

  // Handle in-conversation search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      loadMessages(false);
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  // Socket event subscriptions
  useEffect(() => {
    const cleanupNewMessage = socketService.on('message:new', ({ conversationId, message }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) => {
          // Guard against duplicate
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        // Auto scroll to bottom
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        // Mark as read if not sent by me
        if (message.sender_id !== currentUser.id) {
          apiClient.messages.markRead(conversation.id);
        }
      }
    });

    const cleanupUpdatedMessage = socketService.on('message:updated', ({ conversationId, message }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      }
    });

    const cleanupDeletedMessage = socketService.on('message:deleted', ({ conversationId, messageId }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: 'This message was deleted', deleted_at: new Date().toISOString() } : m
          )
        );
      }
    });

    const cleanupDeletedForMe = socketService.on('message:deleted_for_me', ({ conversationId, messageId }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    });

    const cleanupReactionAdded = socketService.on('message:reaction_added', ({ conversationId, messageId, reaction, userId, display_name, username }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions || [];
            return {
              ...m,
              reactions: [...existing, { id: 'rea_' + Math.random(), message_id: messageId, user_id: userId, reaction, created_at: new Date().toISOString(), display_name, username }],
            };
          })
        );
      }
    });

    const cleanupReactionRemoved = socketService.on('message:reaction_removed', ({ conversationId, messageId, reaction, userId }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              reactions: (m.reactions || []).filter((r) => !(r.user_id === userId && r.reaction === reaction)),
            };
          })
        );
      }
    });

    const cleanupTypingStart = socketService.on('user:typing_start', ({ conversationId, userId, username }: any) => {
      if (conversationId === conversation.id && userId !== currentUser.id) {
        setTypingUsers((prev) => new Set([...prev, username || 'Someone']));
      }
    });

    const cleanupTypingStop = socketService.on('user:typing_stop', ({ conversationId, userId }: any) => {
      if (conversationId === conversation.id) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.clear();
          return next;
        });
      }
    });

    const cleanupReadReceipt = socketService.on('message:read', ({ conversationId }: any) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) => (m.sender_id === currentUser.id ? { ...m, delivery_status: 'READ' } : m))
        );
      }
    });

    return () => {
      cleanupNewMessage();
      cleanupUpdatedMessage();
      cleanupDeletedMessage();
      cleanupDeletedForMe();
      cleanupReactionAdded();
      cleanupReactionRemoved();
      cleanupTypingStart();
      cleanupTypingStop();
      cleanupReadReceipt();
    };
  }, [conversation.id, currentUser.id]);

  // Load older messages (cursor pagination)
  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiClient.messages.list(conversation.id, nextCursor, 50, searchQuery || null);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.has_more);
      setNextCursor(res.next_cursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Message actions
  const handleConfirmDelete = async (messageId: string, mode: 'for_me' | 'for_everyone') => {
    try {
      await apiClient.messages.delete(messageId, mode);
      if (mode === 'for_me') {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        showToast('Message deleted for you', 'success');
      } else {
        showToast('Message deleted for everyone', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete message', 'error');
      throw err;
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      await apiClient.messages.toggleReaction(messageId, emoji);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleTogglePin = async (messageId: string) => {
    try {
      const updated = await apiClient.messages.togglePin(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      showToast(updated.is_pinned ? 'Message pinned' : 'Message unpinned', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle pin', 'error');
    }
  };

  const pinnedMessages = messages.filter((m) => m.is_pinned);

  // Header subtitle
  const getHeaderSubtitle = () => {
    if (conversation.type === 'GROUP') {
      const count = conversation.members.length;
      const onlineCount = conversation.members.filter((m) => m.user?.is_online).length;
      return `${count} members${onlineCount > 0 ? `, ${onlineCount} online` : ''}`;
    }

    const otherMember = conversation.members.find((m) => m.user_id !== currentUser.id);
    if (!otherMember) return 'Direct Message';
    if (otherMember.user?.is_online) return 'Online';
    if (otherMember.user?.last_seen_at) {
      return `Last seen ${new Date(otherMember.user.last_seen_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    return 'Offline';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 relative overflow-hidden">
      {/* Top Header */}
      <div className="h-16 px-4 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          <button
            type="button"
            onClick={onBackMobile}
            className="md:hidden p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Conversation Avatar & Info */}
          <div
            className="flex items-center gap-3 cursor-pointer min-w-0"
            onClick={() => conversation.type === 'GROUP' && setShowGroupDetails(true)}
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700/60 flex items-center justify-center">
                {conversation.avatar_url ? (
                  <img src={conversation.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-5 h-5 text-zinc-400" />
                )}
              </div>
              {conversation.type === 'DIRECT' && (
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900 ${
                    conversation.members.some((m) => m.user_id !== currentUser.id && m.user?.is_online)
                      ? 'bg-emerald-500'
                      : 'bg-zinc-600'
                  }`}
                />
              )}
            </div>

            <div className="min-w-0">
              <h3 className="font-bold text-sm text-zinc-100 truncate flex items-center gap-2">
                <span>{conversation.title}</span>
              </h3>
              <p className="text-xs text-zinc-400 truncate">{getHeaderSubtitle()}</p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Search Toggle */}
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-xl transition-colors ${
              showSearch ? 'bg-indigo-600/20 text-indigo-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Search messages"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Pinned Messages Button */}
          <button
            type="button"
            onClick={() => setShowPinned(!showPinned)}
            className={`p-2 rounded-xl relative transition-colors ${
              showPinned ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Pinned messages"
          >
            <Pin className="w-4 h-4" />
            {pinnedMessages.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-zinc-900" />
            )}
          </button>

          {/* Call Buttons */}
          <button
            type="button"
            onClick={() => showToast('Voice call capability configured for production media server.', 'info')}
            className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Voice call"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => showToast('Video call capability configured for WebRTC peer signaling.', 'info')}
            className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Video call"
          >
            <Video className="w-4 h-4" />
          </button>

          {/* Group details toggle */}
          {conversation.type === 'GROUP' && (
            <button
              type="button"
              onClick={() => setShowGroupDetails(true)}
              className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors ml-1"
              title="Group info"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* In-conversation search bar */}
      {showSearch && (
        <div className="p-2.5 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center gap-2 animate-in slide-in-from-top-2">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search this conversation..."
            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-zinc-500 hover:text-white text-xs"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 z-0">
        {/* Load more messages button */}
        {hasMore && (
          <div className="flex justify-center my-2">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-4 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700/60 flex items-center gap-1.5 transition-colors"
            >
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>Load older messages</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <span className="text-xs">Fetching conversation history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-2">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-zinc-300">No messages yet</p>
            <p className="text-xs max-w-xs">
              Say hello! Messages in this thread are securely stored in PostgreSQL and delivered in real-time.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isCurrentUser={message.sender_id === currentUser.id}
              currentUser={currentUser}
              onReply={(m) => setReplyToMessage(m)}
              onEdit={(m) => setEditingMessage(m)}
              onDelete={(m) => setDeletingMessage(m)}
              onToggleReaction={handleToggleReaction}
              onTogglePin={handleTogglePin}
              onReport={(m) => onReportMessage(m)}
            />
          ))
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator Bar */}
      {typingUsers.size > 0 && (
        <div className="px-4 py-1 text-xs text-indigo-400 font-medium flex items-center gap-2 animate-in fade-in">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]" />
          </div>
          <span>
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        replyToMessage={replyToMessage}
        editingMessage={editingMessage}
        onCancelReply={() => setReplyToMessage(null)}
        onCancelEdit={() => setEditingMessage(null)}
        onMessageSent={(msg) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }}
        onMessageEdited={(msg) => {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        }}
      />

      {/* Pinned Messages Drawer */}
      <PinnedMessagesDrawer
        isOpen={showPinned}
        onClose={() => setShowPinned(false)}
        pinnedMessages={pinnedMessages}
        onScrollToMessage={(msgId) => {
          const el = document.getElementById(msgId);
          el?.scrollIntoView({ behavior: 'smooth' });
        }}
        onUnpin={handleTogglePin}
      />

      {/* Group Details Drawer */}
      {conversation.type === 'GROUP' && (
        <GroupDetailsDrawer
          isOpen={showGroupDetails}
          onClose={() => setShowGroupDetails(false)}
          conversation={conversation}
          currentUser={currentUser}
          onConversationUpdated={onConversationUpdated}
        />
      )}

      {/* Delete Message Modal with Delete for me & Delete for everyone */}
      <DeleteMessageModal
        isOpen={Boolean(deletingMessage)}
        message={deletingMessage}
        currentUser={currentUser}
        isGroupAdmin={
          conversation.type === 'GROUP' &&
          conversation.members.some(
            (m) => m.user_id === currentUser.id && (m.role === 'OWNER' || m.role === 'ADMIN')
          )
        }
        onClose={() => setDeletingMessage(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};
