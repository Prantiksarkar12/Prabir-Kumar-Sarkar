import React from 'react';
import { Message } from '../../types/chat';
import { X, Pin, MessageSquare } from 'lucide-react';

interface PinnedMessagesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedMessages: Message[];
  onScrollToMessage: (id: string) => void;
  onUnpin: (id: string) => void;
}

export const PinnedMessagesDrawer: React.FC<PinnedMessagesDrawerProps> = ({
  isOpen,
  onClose,
  pinnedMessages,
  onScrollToMessage,
  onUnpin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin className="w-4 h-4 text-amber-400 fill-amber-400" />
          <h3 className="font-semibold text-sm text-zinc-100">Pinned Messages</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
            {pinnedMessages.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {pinnedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 text-zinc-500 gap-2 my-auto">
            <Pin className="w-8 h-8 opacity-40" />
            <p className="text-xs">No pinned messages in this conversation yet.</p>
          </div>
        ) : (
          pinnedMessages.map((msg) => (
            <div
              key={msg.id}
              className="p-3.5 rounded-2xl bg-zinc-800/60 border border-zinc-700/60 flex flex-col gap-2 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  {msg.sender?.display_name || msg.sender?.username}
                </span>
                <button
                  type="button"
                  onClick={() => onUnpin(msg.id)}
                  className="text-[11px] text-zinc-400 hover:text-rose-400 transition-colors"
                >
                  Unpin
                </button>
              </div>

              <p className="text-xs text-zinc-200 line-clamp-3 leading-relaxed">
                {msg.content || (msg.attachments && msg.attachments.length > 0 ? 'Attachment' : 'Voice note')}
              </p>

              <button
                type="button"
                onClick={() => {
                  onScrollToMessage(msg.id);
                  onClose();
                }}
                className="mt-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 self-start"
              >
                <MessageSquare className="w-3 h-3" />
                <span>Jump to message</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
