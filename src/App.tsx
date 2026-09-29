import React, { useState, useEffect } from 'react';
import { User, Conversation, Message } from './types/chat';
import { apiClient } from './lib/api';
import { socketService } from './lib/socket';

import { ToastProvider, useToast } from './components/ui/Toast';
import { OfflineBanner } from './components/ui/OfflineBanner';
import { AuthModal } from './components/auth/AuthModal';
import { LandingPage } from './components/landing/LandingPage';
import { Sidebar } from './components/chat/Sidebar';
import { ChatArea } from './components/chat/ChatArea';
import { NewConversationModal } from './components/chat/NewConversationModal';
import { NewGroupModal } from './components/chat/NewGroupModal';
import { ProfileDrawer } from './components/profile/ProfileDrawer';
import { SettingsModal } from './components/settings/SettingsModal';
import { ModerationModal } from './components/moderation/ModerationModal';
import { ReportModal } from './components/ui/ReportModal';
import { ServerEnvironmentModal } from './components/server/ServerEnvironmentModal';
import { MessageSquare, Shield, Loader2 } from 'lucide-react';
import { AccountType } from './types/chat';

function ChatPlatform() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [view, setView] = useState<'landing' | 'chat'>('landing');

  // Auth modal controls from landing page & header
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authAccountType, setAuthAccountType] = useState<AccountType>('PERSONAL');

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  // Modals
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [showServerEnv, setShowServerEnv] = useState(false);
  const [reportingMessage, setReportingMessage] = useState<Message | null>(null);

  const { showToast } = useToast();

  // Load session on startup
  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = apiClient.getToken();
        if (token) {
          const res = await apiClient.auth.getSession();
          setCurrentUser(res.user);
          setView('chat');
          socketService.init();
        } else {
          setView('landing');
        }
      } catch (err) {
        console.warn('[Session Error]', err);
        apiClient.setToken(null);
        setView('landing');
      } finally {
        setLoadingSession(false);
      }
    };

    checkSession();
  }, []);

  // Fetch conversations whenever currentUser changes
  const loadConversations = async () => {
    if (!currentUser) return;
    try {
      const list = await apiClient.conversations.list();
      setConversations(list);

      // If a conversation was selected, keep it updated
      setSelectedConversation((prev) => {
        if (!prev) return list.length > 0 ? list[0] : null;
        const fresh = list.find((c) => c.id === prev.id);
        return fresh || (list.length > 0 ? list[0] : null);
      });
    } catch (err) {
      console.error('[Load Conversations Error]', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadConversations();
    }
  }, [currentUser]);

  // Real-time socket events for conversation list updates
  useEffect(() => {
    if (!currentUser) return;

    const cleanupConvCreated = socketService.on('conversation:created', () => {
      loadConversations();
    });

    const cleanupConvUpdated = socketService.on('conversation:updated', (updatedConv: Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
      );
    });

    const cleanupNewMessage = socketService.on('message:new', ({ conversationId, message }: any) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === conversationId) {
            const isCurrentThread = selectedConversation?.id === conversationId;
            return {
              ...c,
              last_message: message,
              updated_at: message.created_at,
              unread_count: isCurrentThread ? 0 : (c.unread_count || 0) + 1,
            };
          }
          return c;
        })
      );
    });

    const cleanupNotification = socketService.on('notification:new', (notif: any) => {
      showToast(`${notif.title}: ${notif.body}`, 'info');
    });

    // Real-time presence listeners
    const cleanupUserOnline = socketService.on('user:online', ({ userId }: { userId: string }) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          members: c.members.map((m) =>
            m.user_id === userId
              ? { ...m, user: m.user ? { ...m.user, is_online: true } : m.user }
              : m
          ),
        }))
      );
      setSelectedConversation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          members: prev.members.map((m) =>
            m.user_id === userId
              ? { ...m, user: m.user ? { ...m.user, is_online: true } : m.user }
              : m
          ),
        };
      });
    });

    const cleanupUserOffline = socketService.on(
      'user:offline',
      ({ userId, lastSeen }: { userId: string; lastSeen?: string }) => {
        setConversations((prev) =>
          prev.map((c) => ({
            ...c,
            members: c.members.map((m) =>
              m.user_id === userId
                ? {
                    ...m,
                    user: m.user
                      ? {
                          ...m.user,
                          is_online: false,
                          last_seen_at: lastSeen || new Date().toISOString(),
                        }
                      : m.user,
                  }
                : m
            ),
          }))
        );
        setSelectedConversation((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            members: prev.members.map((m) =>
              m.user_id === userId
                ? {
                    ...m,
                    user: m.user
                      ? {
                          ...m.user,
                          is_online: false,
                          last_seen_at: lastSeen || new Date().toISOString(),
                        }
                      : m.user,
                  }
                : m
            ),
          };
        });
      }
    );

    const cleanupPresenceSync = socketService.on(
      'user:presence_sync',
      ({ onlineUserIds }: { onlineUserIds: string[] }) => {
        const set = new Set(onlineUserIds);
        setConversations((prev) =>
          prev.map((c) => ({
            ...c,
            members: c.members.map((m) =>
              m.user ? { ...m, user: { ...m.user, is_online: set.has(m.user_id) } } : m
            ),
          }))
        );
        setSelectedConversation((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            members: prev.members.map((m) =>
              m.user ? { ...m, user: { ...m.user, is_online: set.has(m.user_id) } } : m
            ),
          };
        });
      }
    );

    return () => {
      cleanupConvCreated();
      cleanupConvUpdated();
      cleanupNewMessage();
      cleanupNotification();
      cleanupUserOnline();
      cleanupUserOffline();
      cleanupPresenceSync();
    };
  }, [currentUser, selectedConversation?.id]);

  const handleSelectUserForChat = async (targetUser: User) => {
    try {
      const res = await apiClient.conversations.createDirect(targetUser.id);
      await loadConversations();
      const freshConv = await apiClient.conversations.get(res.id);
      setSelectedConversation(freshConv);
    } catch (err: any) {
      showToast(err.message || 'Failed to start conversation', 'error');
    }
  };

  const handleGroupCreated = async (groupRes: any) => {
    await loadConversations();
    const fresh = await apiClient.conversations.get(groupRes.id);
    setSelectedConversation(fresh);
  };

  const handleLogout = async () => {
    await apiClient.auth.logout();
    socketService.disconnect();
    setCurrentUser(null);
    setSelectedConversation(null);
    setConversations([]);
    setShowProfile(false);
    setView('landing');
    showToast('Signed out', 'info');
  };

  if (loadingSession) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
          <MessageSquare className="w-6 h-6 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Connecting to Pulse Platform...</span>
        </div>
      </div>
    );
  }

  // Render Landing Page if unauthenticated or explicitly switched to landing
  if (view === 'landing' || !currentUser) {
    return (
      <>
        <LandingPage
          currentUser={currentUser}
          onOpenAuth={(mode, accType) => {
            setAuthMode(mode);
            if (accType) setAuthAccountType(accType);
            setShowAuth(true);
          }}
          onEnterWorkspace={() => setView('chat')}
        />

        <AuthModal
          isOpen={showAuth}
          onClose={() => setShowAuth(false)}
          initialMode={authMode}
          initialAccountType={authAccountType}
          onSuccess={(user) => {
            setCurrentUser(user);
            setShowAuth(false);
            setView('chat');
            socketService.init();
          }}
        />
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      <OfflineBanner />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Full screen on mobile when no conversation selected) */}
        <div
          className={`${
            selectedConversation ? 'hidden md:flex' : 'flex'
          } w-full md:w-auto h-full shrink-0`}
        >
          <Sidebar
            currentUser={currentUser}
            conversations={conversations}
            selectedConversation={selectedConversation}
            onSelectConversation={(c) => setSelectedConversation(c)}
            onOpenNewChat={() => setShowNewChat(true)}
            onOpenNewGroup={() => setShowNewGroup(true)}
            onOpenProfile={() => setShowProfile(true)}
            onOpenSettings={() => setShowSettings(true)}
            onOpenModeration={() => setShowModeration(true)}
            onOpenLanding={() => setView('landing')}
          />
        </div>

        {/* Chat Area (Full screen on mobile when conversation is selected) */}
        {selectedConversation ? (
          <div
            className={`${
              selectedConversation ? 'flex' : 'hidden md:flex'
            } flex-1 h-full min-w-0`}
          >
            <ChatArea
              conversation={selectedConversation}
              currentUser={currentUser}
              onBackMobile={() => setSelectedConversation(null)}
              onConversationUpdated={(updated) => {
                setSelectedConversation(updated);
                setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
              }}
              onReportMessage={(m) => setReportingMessage(m)}
            />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-zinc-950 text-zinc-500 gap-3">
            <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 shadow-inner">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-zinc-300">Pulse Real-Time Workspace</h3>
            <p className="text-xs max-w-sm text-zinc-400">
              Select a conversation from the sidebar or click "Start a Conversation" to begin messaging.
            </p>
            <button
              type="button"
              onClick={() => setShowNewChat(true)}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-md shadow-rose-950/40 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Start a Conversation</span>
            </button>
          </div>
        )}
      </div>

      {/* Modals & Drawers */}
      <NewConversationModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onSelectUser={handleSelectUserForChat}
        currentUserId={currentUser.id}
      />

      <NewGroupModal
        isOpen={showNewGroup}
        onClose={() => setShowNewGroup(false)}
        onGroupCreated={handleGroupCreated}
        currentUserId={currentUser.id}
      />

      <ProfileDrawer
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        currentUser={currentUser}
        onProfileUpdated={(updated) => setCurrentUser(updated)}
        onLogout={handleLogout}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <ModerationModal
        isOpen={showModeration}
        onClose={() => setShowModeration(false)}
        currentUser={currentUser}
        onOpenServerEnv={() => setShowServerEnv(true)}
      />

      <ReportModal
        isOpen={Boolean(reportingMessage)}
        onClose={() => setReportingMessage(null)}
        targetMessage={reportingMessage}
      />

      <ServerEnvironmentModal
        isOpen={showServerEnv && (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN')}
        onClose={() => setShowServerEnv(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ChatPlatform />
    </ToastProvider>
  );
}
