import React, { useState } from 'react';
import { Conversation, User } from '../../types/chat';
import { apiClient } from '../../lib/api';
import {
  X,
  Users,
  ShieldAlert,
  UserPlus,
  Trash2,
  LogOut,
  Edit2,
  Check,
  Crown,
  Shield,
  Loader2,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

interface GroupDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation;
  currentUser: User;
  onConversationUpdated: (c: Conversation) => void;
}

export const GroupDetailsDrawer: React.FC<GroupDetailsDrawerProps> = ({
  isOpen,
  onClose,
  conversation,
  currentUser,
  onConversationUpdated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title || '');
  const [description, setDescription] = useState(conversation.description || '');
  const [isSaving, setIsSaving] = useState(false);

  // Add member search state
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { showToast } = useToast();

  if (!isOpen) return null;

  const myMembership = conversation.members.find((m) => m.user_id === currentUser.id);
  const isOwner = myMembership?.role === 'OWNER';
  const isAdmin = isOwner || myMembership?.role === 'ADMIN' || currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';

  const handleSaveDetails = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const updated = await apiClient.conversations.update(conversation.id, {
        title: title.trim(),
        description: description.trim(),
      });
      onConversationUpdated(updated);
      setIsEditing(false);
      showToast('Group details updated', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update group', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const users = await apiClient.users.search(q);
      // Filter out existing members
      const existingIds = new Set(conversation.members.map((m) => m.user_id));
      setSearchResults(users.filter((u) => !existingIds.has(u.id)));
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await apiClient.conversations.addMember(conversation.id, userId);
      showToast('Member added to group', 'success');
      setShowAddMember(false);
      setSearchQuery('');
      setSearchResults([]);
      // Refresh
      const fresh = await apiClient.conversations.get(conversation.id);
      onConversationUpdated(fresh);
    } catch (err: any) {
      showToast(err.message || 'Failed to add member', 'error');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await apiClient.conversations.removeMember(conversation.id, userId);
      showToast('Member removed', 'success');
      const fresh = await apiClient.conversations.get(conversation.id);
      onConversationUpdated(fresh);
    } catch (err: any) {
      showToast(err.message || 'Failed to remove member', 'error');
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) return;
    try {
      await apiClient.conversations.removeMember(conversation.id, currentUser.id);
      showToast('You left the group', 'info');
      onClose();
      window.location.reload();
    } catch (err: any) {
      showToast(err.message || 'Failed to leave group', 'error');
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          <span>Group Information</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
        {/* Group Avatar & Title */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-20 h-20 rounded-3xl overflow-hidden bg-zinc-800 border-2 border-zinc-700/80 shadow-md">
            {conversation.avatar_url ? (
              <img src={conversation.avatar_url} alt="Group" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-zinc-500">
                {conversation.title?.charAt(0) || 'G'}
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="w-full flex flex-col gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-white text-center font-semibold"
                placeholder="Group name"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-300 text-center resize-none"
                placeholder="Group description"
                rows={2}
              />
              <div className="flex justify-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={isSaving}
                  className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>Save</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-center gap-2">
                <h4 className="text-lg font-bold text-white">{conversation.title}</h4>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">{conversation.description || 'No description provided'}</p>
            </div>
          )}
        </div>

        {/* Members Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Members ({conversation.members.length})
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddMember(!showAddMember)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            )}
          </div>

          {/* Add member search box */}
          {showAddMember && (
            <div className="p-3 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex flex-col gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                placeholder="Search registered user..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
              {isSearching && <div className="text-[11px] text-zinc-400">Searching...</div>}
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                {searchResults.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-700/60 text-xs"
                  >
                    <span className="text-zinc-200 font-medium">{u.display_name}</span>
                    <button
                      type="button"
                      onClick={() => handleAddMember(u.id)}
                      className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px]"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="flex flex-col gap-2">
            {conversation.members.map((mem) => {
              const isMemOwner = mem.role === 'OWNER';
              const isMemAdmin = mem.role === 'ADMIN';

              return (
                <div
                  key={mem.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-zinc-800/50 border border-zinc-800"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-700">
                        {mem.user?.avatar_url ? (
                          <img src={mem.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-300">
                            {mem.user?.display_name?.charAt(0) || 'U'}
                          </div>
                        )}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${
                          mem.user?.is_online ? 'bg-emerald-500' : 'bg-zinc-500'
                        }`}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-200 truncate">
                        {mem.user?.display_name || mem.user?.username}
                        {mem.user_id === currentUser.id && ' (You)'}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                        {isMemOwner ? (
                          <span className="flex items-center gap-0.5 text-amber-400 font-semibold">
                            <Crown className="w-3 h-3" /> Owner
                          </span>
                        ) : isMemAdmin ? (
                          <span className="flex items-center gap-0.5 text-indigo-400 font-semibold">
                            <Shield className="w-3 h-3" /> Admin
                          </span>
                        ) : (
                          <span>Member</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAdmin && mem.user_id !== currentUser.id && !isMemOwner && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(mem.user_id)}
                      className="p-1 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leave Group Button */}
        <div className="mt-auto pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={handleLeaveGroup}
            className="w-full py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave Group</span>
          </button>
        </div>
      </div>
    </div>
  );
};
