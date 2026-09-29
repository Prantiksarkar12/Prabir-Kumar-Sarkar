import React, { useState, useRef } from 'react';
import { Message, User } from '../../types/chat';
import {
  Check,
  CheckCheck,
  Reply,
  MoreVertical,
  Pin,
  Trash2,
  Edit2,
  Flag,
  Play,
  Pause,
  Download,
  FileText,
  Smile,
  ShieldCheck,
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  currentUser: User;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (message: Message) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTogglePin: (messageId: string) => void;
  onReport: (message: Message) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isCurrentUser,
  currentUser,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  onTogglePin,
  onReport,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isSystem = message.message_type === 'SYSTEM';
  const isDeleted = Boolean(message.deleted_at);

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-[11px] font-medium text-zinc-400 text-center max-w-md">
          {message.content}
        </span>
      </div>
    );
  }

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const quickEmojis = ['👍', '❤️', '🔥', '😂', '🎉', '👀'];

  const canModerate =
    currentUser.role === 'MODERATOR' || currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';

  return (
    <div
      className={`group relative flex gap-2.5 my-1.5 transition-all ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Sender Avatar */}
      {!isCurrentUser && (
        <div className="w-8 h-8 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/60 shrink-0 self-end mb-1">
          {message.sender?.avatar_url ? (
            <img src={message.sender.avatar_url} alt={message.sender.display_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-xs text-zinc-400">
              {message.sender?.display_name?.charAt(0) || 'U'}
            </div>
          )}
        </div>
      )}

      {/* Bubble Container */}
      <div className={`max-w-[75%] sm:max-w-md flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        {/* Sender Name & Role */}
        {!isCurrentUser && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-xs font-semibold text-zinc-300">
              {message.sender?.display_name || message.sender?.username}
            </span>
            {message.sender?.role && message.sender.role !== 'USER' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <ShieldCheck className="w-2.5 h-2.5" />
                {message.sender.role}
              </span>
            )}
          </div>
        )}

        {/* Message Card */}
        <div
          className={`relative p-3.5 rounded-3xl shadow-sm transition-all border ${
            isDeleted
              ? 'bg-zinc-800/40 border-zinc-800 text-zinc-500 italic'
              : isCurrentUser
              ? 'bg-indigo-600 text-white border-indigo-500/30 rounded-br-sm'
              : 'bg-zinc-800/90 text-zinc-100 border-zinc-700/50 rounded-bl-sm'
          } ${message.is_pinned ? 'ring-1 ring-amber-400/50' : ''}`}
        >
          {/* Pin indicator */}
          {message.is_pinned && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-amber-300 mb-1.5">
              <Pin className="w-3 h-3 fill-amber-300" />
              <span>Pinned message</span>
            </div>
          )}

          {/* Reply Quote Banner */}
          {message.reply_to && (
            <div
              className={`p-2 rounded-xl mb-2 text-xs border-l-2 flex flex-col gap-0.5 ${
                isCurrentUser
                  ? 'bg-indigo-700/60 border-white/60 text-indigo-100'
                  : 'bg-zinc-900/60 border-indigo-500 text-zinc-300'
              }`}
            >
              <span className="font-semibold text-[11px] text-indigo-300">
                {message.reply_to.sender_name || 'Replied message'}
              </span>
              <span className="line-clamp-1 opacity-80 text-[11px]">
                {message.reply_to.content}
              </span>
            </div>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-2 mb-2">
              {message.attachments.map((att) => {
                if (att.mime_type.startsWith('image/')) {
                  return (
                    <div key={att.id} className="rounded-2xl overflow-hidden max-h-72 border border-black/10">
                      <img
                        src={att.file_url}
                        alt={att.file_name}
                        className="w-full h-full object-cover hover:scale-[1.02] transition-transform cursor-pointer"
                        onClick={() => window.open(att.file_url, '_blank')}
                      />
                    </div>
                  );
                }

                if (att.mime_type.startsWith('audio/') || message.message_type === 'VOICE') {
                  return (
                    <div
                      key={att.id}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl ${
                        isCurrentUser ? 'bg-indigo-700/80 text-white' : 'bg-zinc-900/80 text-zinc-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={toggleAudio}
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow transition-transform active:scale-95 ${
                          isCurrentUser ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>

                      {/* Waveform visual representation */}
                      <div className="flex-1 flex items-center gap-0.5 h-6">
                        {[40, 70, 30, 90, 60, 100, 45, 80, 50, 75, 35, 95, 65, 85, 40].map((h, i) => (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-all ${
                              isPlayingAudio ? 'animate-pulse' : ''
                            } ${isCurrentUser ? 'bg-white/70' : 'bg-indigo-400'}`}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>

                      <span className="text-xs font-mono font-medium shrink-0">
                        {att.duration_seconds ? `${Math.round(att.duration_seconds)}s` : 'Voice note'}
                      </span>

                      <audio
                        ref={audioRef}
                        src={att.file_url}
                        onEnded={() => setIsPlayingAudio(false)}
                        className="hidden"
                      />
                    </div>
                  );
                }

                return (
                  <a
                    key={att.id}
                    href={att.file_url}
                    download={att.file_name}
                    className={`flex items-center gap-2.5 p-2.5 rounded-2xl transition-colors border ${
                      isCurrentUser
                        ? 'bg-indigo-700/70 hover:bg-indigo-700 border-white/20 text-white'
                        : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-700/60 text-zinc-200'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{att.file_name}</p>
                      <p className="text-[10px] opacity-70">
                        {(att.file_size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Download className="w-4 h-4 opacity-70 shrink-0" />
                  </a>
                );
              })}
            </div>
          )}

          {/* Text Content */}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text">
              {message.content}
            </p>
          )}

          {/* Meta Info (Time, Edited, Delivery Checks) */}
          <div
            className={`flex items-center gap-1.5 mt-1.5 justify-end text-[10px] ${
              isCurrentUser ? 'text-indigo-200' : 'text-zinc-400'
            }`}
          >
            {message.edited_at && <span className="italic">edited</span>}
            <span>{formatTime(message.created_at)}</span>

            {/* Delivery checkmarks for sender */}
            {isCurrentUser && (
              <span className="inline-flex items-center ml-0.5" title={message.delivery_status || 'Sent'}>
                {message.delivery_status === 'READ' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                ) : message.delivery_status === 'DELIVERED' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-indigo-200" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-indigo-200" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Reaction Badges */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 px-1">
            {/* Group identical reactions */}
            {Array.from(new Set(message.reactions.map((r) => r.reaction))).map((emoji) => {
              const reactionsForEmoji = message.reactions!.filter((r) => r.reaction === emoji);
              const hasReacted = reactionsForEmoji.some((r) => r.user_id === currentUser.id);
              const names = reactionsForEmoji.map((r) => r.display_name || r.username).join(', ');

              return (
                <button
                  key={emoji}
                  type="button"
                  title={names}
                  onClick={() => onToggleReaction(message.id, emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    hasReacted
                      ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200 shadow-sm'
                      : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="text-[11px] font-semibold">{reactionsForEmoji.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover Action Bar */}
      {!isDeleted && (
        <div
          className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-center bg-zinc-900/90 backdrop-blur border border-zinc-700/70 p-1 rounded-2xl shadow-xl z-20 ${
            isCurrentUser ? 'order-first mr-1' : 'ml-1'
          }`}
        >
          {/* Quick Reaction */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Add reaction"
            >
              <Smile className="w-4 h-4" />
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-full mb-2 left-0 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-2 flex gap-1.5 z-30 animate-in fade-in zoom-in-95">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onToggleReaction(message.id, emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="p-1.5 hover:bg-zinc-800 rounded-xl text-lg hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reply */}
          <button
            type="button"
            onClick={() => onReply(message)}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Reply"
          >
            <Reply className="w-4 h-4" />
          </button>

          {/* More Actions Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="More"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div
                className="absolute top-full mt-1 right-0 w-44 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl py-1.5 z-30 flex flex-col gap-0.5 text-xs text-zinc-200 animate-in fade-in"
                onMouseLeave={() => setShowMenu(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    onTogglePin(message.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2"
                >
                  <Pin className="w-3.5 h-3.5 text-amber-400" />
                  <span>{message.is_pinned ? 'Unpin message' : 'Pin message'}</span>
                </button>

                {isCurrentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(message);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Edit message</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onDelete(message);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-zinc-800 text-rose-400 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                {!isCurrentUser && (
                  <button
                    type="button"
                    onClick={() => {
                      onReport(message);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 flex items-center gap-2"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Report</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
