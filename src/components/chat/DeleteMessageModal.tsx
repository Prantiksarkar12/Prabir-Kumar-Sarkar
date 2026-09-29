import React, { useState } from 'react';
import { Message, User } from '../../types/chat';
import { Trash2, AlertTriangle, UserMinus, Globe, X, Loader2 } from 'lucide-react';

interface DeleteMessageModalProps {
  isOpen: boolean;
  message: Message | null;
  currentUser: User;
  isGroupAdmin?: boolean;
  onClose: () => void;
  onConfirmDelete: (messageId: string, mode: 'for_me' | 'for_everyone') => Promise<void>;
}

export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  isOpen,
  message,
  currentUser,
  isGroupAdmin = false,
  onClose,
  onConfirmDelete,
}) => {
  const [loadingMode, setLoadingMode] = useState<'for_me' | 'for_everyone' | null>(null);

  if (!isOpen || !message) return null;

  const isSender = message.sender_id === currentUser.id;
  const isPlatformModerator =
    currentUser.role === 'MODERATOR' || currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
  const canDeleteForEveryone = isSender || isPlatformModerator || isGroupAdmin;

  const handleDelete = async (mode: 'for_me' | 'for_everyone') => {
    setLoadingMode(mode);
    try {
      await onConfirmDelete(message.id, mode);
      onClose();
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-zinc-100">Delete Message</h3>
              <p className="text-xs text-zinc-400">Choose how you want to delete this message</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loadingMode !== null}
            className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message preview snippet */}
        <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-300 max-h-24 overflow-y-auto leading-relaxed italic">
          "{message.content || (message.attachments?.length ? 'Attachment' : 'Message')}"
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          {/* Delete for everyone (if authorized) */}
          {canDeleteForEveryone && (
            <button
              type="button"
              onClick={() => handleDelete('for_everyone')}
              disabled={loadingMode !== null}
              className="w-full p-3 rounded-2xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-left flex items-center justify-between transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-600/30 flex items-center justify-center text-rose-300 shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-rose-200">
                    Delete for everyone
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Deletes this message for all members in the conversation
                  </div>
                </div>
              </div>
              {loadingMode === 'for_everyone' && <Loader2 className="w-4 h-4 animate-spin text-rose-400" />}
            </button>
          )}

          {/* Delete for me */}
          <button
            type="button"
            onClick={() => handleDelete('for_me')}
            disabled={loadingMode !== null}
            className="w-full p-3 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/60 text-zinc-300 text-left flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-700/50 flex items-center justify-center text-zinc-300 shrink-0">
                <UserMinus className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white group-hover:text-zinc-200">
                  Delete for me
                </div>
                <div className="text-[11px] text-zinc-400">
                  Removes this message from your device only
                </div>
              </div>
            </div>
            {loadingMode === 'for_me' && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loadingMode !== null}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
