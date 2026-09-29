import React, { useState, useEffect } from 'react';
import { User } from '../../types/chat';
import { apiClient } from '../../lib/api';
import { X, Users, Search, Check, Loader2 } from 'lucide-react';
import { useToast } from '../ui/Toast';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (group: any) => void;
  currentUserId: string;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
  currentUserId,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const users = await apiClient.users.search(q);
      setSearchResults(users.filter((u) => u.id !== currentUserId));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Please enter a group title.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.conversations.createGroup(title.trim(), description.trim(), selectedUserIds);
      showToast(`Group "${res.title}" created!`, 'success');
      onGroupCreated(res);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to create group', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base">Create New Group</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Group Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Engineering Sync"
              required
              className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Topic, purpose or guidelines..."
              rows={2}
              className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Add Members ({selectedUserIds.length} selected)
            </label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search registered users..."
                className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
              {loading && <div className="text-center text-xs text-zinc-500 py-2">Searching...</div>}
              {searchResults.map((user) => {
                const isSelected = selectedUserIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`flex items-center justify-between p-2 rounded-xl text-left transition-colors ${
                      isSelected ? 'bg-indigo-600/20 border border-indigo-500/40 text-white' : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                        {user.avatar_url && <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-xs font-medium truncate">{user.display_name}</span>
                    </div>

                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                        isSelected ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  );
};
