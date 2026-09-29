import React, { useState } from 'react';
import { User } from '../../types/chat';
import { apiClient } from '../../lib/api';
import {
  X,
  User as UserIcon,
  Mail,
  Lock,
  LogOut,
  Trash2,
  Check,
  Shield,
  Loader2,
  Upload,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onProfileUpdated: (user: User) => void;
  onLogout: () => void;
}

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
  onLogout,
}) => {
  const [displayName, setDisplayName] = useState(currentUser.display_name);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '');
  const [isSaving, setIsSaving] = useState(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Delete account state
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await apiClient.users.updateMe({
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl.trim(),
      });
      onProfileUpdated(updated);
      showToast('Profile updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setIsChangingPass(true);
    try {
      await apiClient.auth.changePassword({ currentPassword, newPassword });
      showToast('Password changed successfully', 'success');
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) return;
    setIsDeleting(true);
    try {
      await apiClient.auth.deleteAccount(deletePassword);
      showToast('Your account was permanently deleted.', 'info');
      onLogout();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete account', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const generateNewAvatar = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    const newUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${randomSeed}`;
    setAvatarUrl(newUrl);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-indigo-400" />
          <span>My Profile</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative group">
            <div className="w-24 h-24 rounded-3xl overflow-hidden bg-zinc-800 border-2 border-indigo-500/50 shadow-lg">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-zinc-400">
                  {currentUser.display_name.charAt(0)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={generateNewAvatar}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center rounded-3xl text-white text-[11px] font-medium transition-opacity"
            >
              <Upload className="w-4 h-4 mb-1" />
              <span>Randomize</span>
            </button>
          </div>

          <div className="text-center">
            <p className="font-bold text-base text-white">{currentUser.display_name}</p>
            <p className="text-xs text-zinc-400 font-mono">@{currentUser.username}</p>
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-semibold">
              <Shield className="w-3 h-3" />
              <span>{currentUser.role}</span>
            </div>
          </div>
        </div>

        {/* Profile Edit Form */}
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="Tell others a bit about yourself..."
              className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>Save Profile</span>
          </button>
        </form>

        {/* Change Password Accordion */}
        <div className="border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => setShowPasswordChange(!showPasswordChange)}
            className="w-full flex items-center justify-between text-xs font-semibold text-zinc-300 hover:text-white"
          >
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Change Password</span>
            </span>
            <span className="text-[10px] text-zinc-500">{showPasswordChange ? 'Hide' : 'Show'}</span>
          </button>

          {showPasswordChange && (
            <form onSubmit={handleChangePassword} className="flex flex-col gap-2 mt-3 animate-in fade-in">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                disabled={isChangingPass}
                className="w-full py-1.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold transition-colors"
              >
                {isChangingPass ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        {/* Delete Account */}
        <div className="border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => setShowDelete(!showDelete)}
            className="w-full flex items-center justify-between text-xs font-semibold text-rose-400 hover:text-rose-300"
          >
            <span className="flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </span>
            <span className="text-[10px] text-zinc-500">{showDelete ? 'Cancel' : 'Open'}</span>
          </button>

          {showDelete && (
            <div className="mt-3 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col gap-2 text-xs text-rose-300 animate-in fade-in">
              <p className="text-[11px] leading-relaxed">
                This action is irreversible. All your messages, profile, and settings will be permanently removed.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter password to confirm"
                className="w-full bg-zinc-900 border border-rose-500/30 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting || !deletePassword}
                className="w-full py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="mt-auto border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4 text-zinc-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
