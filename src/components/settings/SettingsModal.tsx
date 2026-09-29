import React, { useState, useEffect } from 'react';
import { UserPrivacySettings } from '../../types/chat';
import { apiClient } from '../../lib/api';
import {
  X,
  Shield,
  Smartphone,
  Check,
  UserX,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'blocked' | 'sessions'>('privacy');
  const [privacy, setPrivacy] = useState<UserPrivacySettings | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [priv, blocks, sess] = await Promise.all([
          apiClient.users.getPrivacy(),
          apiClient.users.getBlocks(),
          apiClient.users.getSessions(),
        ]);
        setPrivacy(priv);
        setBlockedUsers(blocks || []);
        setSessions(sess || []);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  const handleSavePrivacy = async () => {
    if (!privacy) return;
    setIsSaving(true);
    try {
      await apiClient.users.updatePrivacy(privacy);
      showToast('Privacy preferences updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update privacy settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnblock = async (blockedUserId: string) => {
    try {
      await apiClient.users.unblock(blockedUserId);
      setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== blockedUserId && u.id !== blockedUserId));
      showToast('User unblocked', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to unblock user', 'error');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.users.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast('Session revoked', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke session', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto text-zinc-100">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Privacy & Account Settings</h2>
              <p className="text-xs text-zinc-400">Manage communication policies, security sessions and blocked users</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 flex gap-3 border-b border-zinc-800/80 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'privacy'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Privacy Controls
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blocked')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'blocked'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Blocked Users ({blockedUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'sessions'
                ? 'border-rose-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Active Sessions ({sessions.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-zinc-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
              <span className="text-xs">Loading preferences...</span>
            </div>
          ) : activeTab === 'privacy' && privacy ? (
            <div className="flex flex-col gap-5 text-xs">
              {/* Who can message */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div>
                  <p className="font-semibold text-zinc-200">Who can message me</p>
                  <p className="text-zinc-400 text-[11px]">Control who can start direct conversations with you</p>
                </div>
                <select
                  value={privacy.who_can_message}
                  onChange={(e) => setPrivacy({ ...privacy, who_can_message: e.target.value as any })}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="EVERYONE">Everyone</option>
                  <option value="CONTACTS">Contacts Only</option>
                </select>
              </div>

              {/* Online status visibility */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div>
                  <p className="font-semibold text-zinc-200">Who can see my online status</p>
                  <p className="text-zinc-400 text-[11px]">Real presence broadcast policy</p>
                </div>
                <select
                  value={privacy.who_can_see_online}
                  onChange={(e) => setPrivacy({ ...privacy, who_can_see_online: e.target.value as any })}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="EVERYONE">Everyone</option>
                  <option value="CONTACTS">Contacts Only</option>
                  <option value="NOBODY">Nobody</option>
                </select>
              </div>

              {/* Last seen */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div>
                  <p className="font-semibold text-zinc-200">Who can see last seen timestamp</p>
                  <p className="text-zinc-400 text-[11px]">Display your offline duration</p>
                </div>
                <select
                  value={privacy.who_can_see_last_seen}
                  onChange={(e) => setPrivacy({ ...privacy, who_can_see_last_seen: e.target.value as any })}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="EVERYONE">Everyone</option>
                  <option value="CONTACTS">Contacts Only</option>
                  <option value="NOBODY">Nobody</option>
                </select>
              </div>

              {/* Read receipts */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div>
                  <p className="font-semibold text-zinc-200">Read Receipts</p>
                  <p className="text-zinc-400 text-[11px]">Send and receive read receipts (✓✓ blue marks)</p>
                </div>
                <input
                  type="checkbox"
                  checked={privacy.read_receipts_enabled}
                  onChange={(e) => setPrivacy({ ...privacy, read_receipts_enabled: e.target.checked })}
                  className="rounded bg-zinc-800 border-zinc-700 text-rose-600 focus:ring-rose-500 h-4 w-4"
                />
              </div>

              {/* Push notifications */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div>
                  <p className="font-semibold text-zinc-200">Push Notifications</p>
                  <p className="text-zinc-400 text-[11px]">Receive desktop and mobile notifications when messages arrive</p>
                </div>
                <input
                  type="checkbox"
                  checked={privacy.push_notifications_enabled}
                  onChange={(e) => setPrivacy({ ...privacy, push_notifications_enabled: e.target.checked })}
                  className="rounded bg-zinc-800 border-zinc-700 text-rose-600 focus:ring-rose-500 h-4 w-4"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePrivacy}
                  disabled={isSaving}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-rose-950/30"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Privacy Preferences</span>
                </button>
              </div>
            </div>
          ) : activeTab === 'blocked' ? (
            <div className="flex flex-col gap-3">
              {blockedUsers.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs">
                  <UserX className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>You have not blocked any users.</p>
                </div>
              ) : (
                blockedUsers.map((b) => (
                  <div
                    key={b.id || b.blocked_id}
                    className="p-3 bg-zinc-800/40 border border-zinc-800 rounded-2xl flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-xs text-white">{b.display_name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">@{b.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(b.blocked_id || b.id)}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-colors"
                    >
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-zinc-400 mb-1">
                Active devices and browser sessions authenticated to your account:
              </p>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 bg-zinc-800/40 border border-zinc-800 rounded-2xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {s.device_info || 'Browser Session'}
                        </span>
                        {s.is_current && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Current Device
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        IP: {s.ip_address || '127.0.0.1'} • Expires: {new Date(s.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {!s.is_current && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      className="p-1.5 rounded-xl hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-colors"
                      title="Revoke session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
