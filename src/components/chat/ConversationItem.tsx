import React from 'react';
import { Conversation } from '../../types/chat';
import { Pin, BellOff, Users, Image as ImageIcon, Mic, FileText } from 'lucide-react';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (c: Conversation) => void;
  currentUserId: string;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isSelected,
  onSelect,
  currentUserId,
}) => {
  // Check if conversation has any online member other than current user
  const isOnline = conversation.type === 'DIRECT'
    ? conversation.members.some((m) => m.user_id !== currentUserId && m.user?.is_online)
    : false;

  // Format time
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Render last message snippet
  const renderSnippet = () => {
    const last = conversation.last_message;
    if (!last) return <span className="italic text-zinc-500">No messages yet</span>;

    const prefix = conversation.type === 'GROUP' && last.sender_id !== currentUserId ? `${(last as any).sender_name || 'Member'}: ` : '';

    if (last.message_type === 'IMAGE') {
      return (
        <span className="flex items-center gap-1 text-zinc-400">
          <ImageIcon className="w-3.5 h-3.5" />
          <span>{prefix}Photo</span>
        </span>
      );
    }
    if (last.message_type === 'VOICE' || last.message_type === 'AUDIO') {
      return (
        <span className="flex items-center gap-1 text-zinc-400">
          <Mic className="w-3.5 h-3.5 text-indigo-400" />
          <span>{prefix}Voice note</span>
        </span>
      );
    }
    if (last.message_type === 'FILE') {
      return (
        <span className="flex items-center gap-1 text-zinc-400">
          <FileText className="w-3.5 h-3.5" />
          <span>{prefix}Attachment</span>
        </span>
      );
    }

    return (
      <span className="truncate">
        {prefix}{last.content}
      </span>
    );
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation)}
      className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all relative group ${
        isSelected
          ? 'bg-indigo-600/15 border border-indigo-500/30 text-white shadow-sm'
          : 'hover:bg-zinc-800/60 border border-transparent text-zinc-200'
      }`}
    >
      {/* Avatar Container */}
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700/60 flex items-center justify-center">
          {conversation.avatar_url ? (
            <img src={conversation.avatar_url} alt={conversation.title || 'Avatar'} className="w-full h-full object-cover" />
          ) : (
            <Users className="w-5 h-5 text-zinc-400" />
          )}
        </div>
        {/* Real Presence Indicator */}
        {conversation.type === 'DIRECT' && (
          <span
            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 ${
              isOnline ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-zinc-600'
            }`}
          />
        )}
      </div>

      {/* Info Container */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold text-sm truncate text-zinc-100 flex items-center gap-1.5">
            {conversation.title || 'Conversation'}
            {conversation.type === 'GROUP' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">Group</span>
            )}
          </h4>
          <span className="text-[11px] text-zinc-500 font-medium shrink-0 ml-1">
            {formatTime(conversation.last_message?.created_at || conversation.updated_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
          <div className="truncate flex-1">
            {renderSnippet()}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {conversation.is_pinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400" />}
            {conversation.is_muted && <BellOff className="w-3 h-3 text-zinc-500" />}
            {Boolean(conversation.unread_count && conversation.unread_count > 0) && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold min-w-4 text-center">
                {conversation.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};
