import React, { useState } from 'react';
import { Message, User } from '../../types/chat';
import { apiClient } from '../../lib/api';
import { X, Flag, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMessage?: Message | null;
  targetUser?: User | null;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetMessage,
  targetUser,
}) => {
  const [reason, setReason] = useState('HARASSMENT');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.reports.submit({
        message_id: targetMessage?.id,
        reported_user_id: targetMessage?.sender_id || targetUser?.id,
        conversation_id: targetMessage?.conversation_id,
        reason,
        description: description.trim(),
      });
      showToast('Report submitted. A moderator will review it shortly.', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit report', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reportReasons = [
    { value: 'HARASSMENT', label: 'Harassment or Bullying' },
    { value: 'SPAM', label: 'Spam or Fraudulent Activity' },
    { value: 'HATE_SPEECH', label: 'Hate Speech or Violence' },
    { value: 'INAPPROPRIATE', label: 'Inappropriate Content or Media' },
    { value: 'OTHER', label: 'Other Terms Violation' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-4 text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <Flag className="w-5 h-5" />
            <h3 className="font-bold text-base text-white">Submit Moderation Report</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {targetMessage && (
          <div className="p-3 rounded-2xl bg-zinc-800/60 border border-zinc-700/60 text-xs text-zinc-300">
            <span className="font-semibold text-zinc-400 block mb-1">Reported Message Snippet:</span>
            <p className="italic line-clamp-2">"{targetMessage.content || 'Attachment'}"</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Reason *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              {reportReasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Additional Details (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Provide context for our moderation team..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Reports are logged in our PostgreSQL database and immediately forwarded to platform moderators.</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow transition-all disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
            <span>Submit Report</span>
          </button>
        </form>
      </div>
    </div>
  );
};
