import React, { useState } from 'react';
import { User } from '../../types/chat';
import { apiClient } from '../../lib/api';
import { X, Search, MessageSquare, Loader2 } from 'lucide-react';
import { useToast } from '../ui/Toast';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: User) => void;
  currentUserId: string;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  isOpen,
  onClose,
  onSelectUser,
  currentUserId,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<User & { is_online: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.users.search(q);
      setResults(data.filter((u) => u.id !== currentUserId));
    } catch (err: any) {
      showToast('Search failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base">New Direct Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by username or display name..."
            autoFocus
            className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Results */}
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-zinc-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              <span className="text-xs">Searching database...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              {query ? 'No matching users found.' : 'Type a username to find people on Pulse.'}
            </div>
          ) : (
            results.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onSelectUser(user);
                  onClose();
                }}
                className="w-full text-left p-3 rounded-2xl hover:bg-zinc-800 flex items-center gap-3 transition-colors group"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-400">
                        {user.display_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${
                      user.is_online ? 'bg-emerald-500' : 'bg-zinc-600'
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-200 truncate group-hover:text-white">
                    {user.display_name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate font-mono">@{user.username}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
