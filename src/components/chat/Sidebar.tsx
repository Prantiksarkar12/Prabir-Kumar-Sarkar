import React, { useState } from 'react';
import { Conversation, User } from '../../types/chat';
import { ConversationItem } from './ConversationItem';
import {
  MessageSquare,
  Plus,
  Users,
  Search,
  Settings,
  Shield,
  User as UserIcon,
  Filter,
  Flame,
} from 'lucide-react';

interface SidebarProps {
  currentUser: User;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  onSelectConversation: (c: Conversation) => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenModeration: () => void;
  onOpenLanding?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  selectedConversation,
  onSelectConversation,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenProfile,
  onOpenSettings,
  onOpenModeration,
  onOpenLanding,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'direct' | 'groups' | 'pinned' | 'unread'>('all');

  const canModerate =
    currentUser.role === 'MODERATOR' || currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';

  // Filter conversations
  const filtered = conversations.filter((c) => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (c.title || '').toLowerCase().includes(q);
      const matchLastMsg = (c.last_message?.content || '').toLowerCase().includes(q);
      if (!matchTitle && !matchLastMsg) return false;
    }

    if (filter === 'direct') return c.type === 'DIRECT';
    if (filter === 'groups') return c.type === 'GROUP';
    if (filter === 'pinned') return Boolean(c.is_pinned);
    if (filter === 'unread') return Boolean(c.unread_count && c.unread_count > 0);

    return true;
  });

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-zinc-900 border-r border-zinc-800 shrink-0">
      {/* Top App Header & User Bar */}
      <div className="p-4 border-b border-zinc-800 flex flex-col gap-3.5 bg-zinc-900/90">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <MessageSquare className="w-4 h-4 fill-white" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              <span>Pulse</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            {canModerate && (
              <button
                type="button"
                onClick={onOpenModeration}
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 transition-colors relative"
                title="Moderation & Admin Panel"
              >
                <Shield className="w-4 h-4" />
              </button>
            )}

            {onOpenLanding && (
              <button
                type="button"
                onClick={onOpenLanding}
                className="p-2 rounded-xl hover:bg-zinc-800 text-rose-400 hover:text-rose-300 transition-colors"
                title="View Production Landing Page"
              >
                <Flame className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Privacy & Sessions"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenProfile}
              className="p-1 rounded-xl hover:bg-zinc-800 transition-colors"
              title="Profile & Account"
            >
              <div className="w-7 h-7 rounded-lg overflow-hidden bg-zinc-700 border border-zinc-600">
                {currentUser.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-xs text-white">
                    {currentUser.display_name.charAt(0)}
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Start Chat Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenNewChat}
            className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Chat</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewGroup}
            className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 border border-zinc-700/60 transition-colors"
            title="Create group"
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Group</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
          {(['all', 'direct', 'groups', 'pinned', 'unread'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-2.5 py-1 rounded-lg font-medium capitalize text-[11px] whitespace-nowrap transition-colors ${
                filter === tab
                  ? 'bg-zinc-100 text-zinc-950 font-bold'
                  : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1">
        {filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-2 my-auto">
            <MessageSquare className="w-8 h-8 opacity-40" />
            <p className="text-xs font-medium">No conversations found.</p>
            <button
              type="button"
              onClick={onOpenNewChat}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Start a new conversation
            </button>
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversation?.id === conv.id}
              onSelect={onSelectConversation}
              currentUserId={currentUser.id}
            />
          ))
        )}
      </div>
    </div>
  );
};
