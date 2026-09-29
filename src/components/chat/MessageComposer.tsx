import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../../types/chat';
import { apiClient } from '../../lib/api';
import { socketService } from '../../lib/socket';
import {
  Send,
  Paperclip,
  Mic,
  Square,
  X,
  Smile,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

interface MessageComposerProps {
  conversationId: string;
  replyToMessage: Message | null;
  editingMessage: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onMessageSent: (msg: Message) => void;
  onMessageEdited: (msg: Message) => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  conversationId,
  replyToMessage,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  onMessageSent,
  onMessageEdited,
}) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { showToast } = useToast();

  // If editing message, load content
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Emit typing indicator
  const handleTyping = () => {
    socketService.startTyping(conversationId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketService.stopTyping(conversationId);
    }, 2000);
  };

  // File selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsSubmitting(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploaded = await apiClient.uploads.uploadFile(file);
        setAttachments((prev) => [...prev, uploaded]);
      }
      showToast('File uploaded successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'File upload failed', 'error');
    } finally {
      setIsSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Microphone access is not supported in this browser.', 'error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[Voice Recorder]', err);
      showToast('Could not access microphone. Please grant audio permissions.', 'error');
    }
  };

  // Stop & Cancel Voice Recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  // Finish & Send Voice Message
  const sendVoiceRecording = async () => {
    if (!mediaRecorderRef.current) return;

    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());

    setIsSubmitting(true);
    try {
      // Small delay to ensure all chunks arrived
      await new Promise((r) => setTimeout(r, 200));
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const uploaded = await apiClient.uploads.uploadFile(audioBlob, `voice_${Date.now()}.webm`, recordingSeconds);

      const msg = await apiClient.messages.send(conversationId, {
        content: '',
        message_type: 'VOICE',
        reply_to_message_id: replyToMessage?.id || null,
        client_message_id: 'cli_' + crypto.randomUUID(),
        attachments: [uploaded],
      });

      onMessageSent(msg);
      if (replyToMessage) onCancelReply();
      showToast('Voice message sent', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to send voice message', 'error');
    } finally {
      setIsSubmitting(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;

    setIsSubmitting(true);
    socketService.stopTyping(conversationId);

    try {
      if (editingMessage) {
        // Edit existing
        const updated = await apiClient.messages.edit(editingMessage.id, trimmed);
        onMessageEdited(updated);
        onCancelEdit();
        setContent('');
        showToast('Message updated', 'success');
      } else {
        // Send new
        const msg = await apiClient.messages.send(conversationId, {
          content: trimmed,
          message_type: attachments.length > 0 && attachments[0].mime_type.startsWith('image/') ? 'IMAGE' : 'TEXT',
          reply_to_message_id: replyToMessage?.id || null,
          client_message_id: 'cli_' + crypto.randomUUID(),
          attachments,
        });

        onMessageSent(msg);
        setContent('');
        setAttachments([]);
        if (replyToMessage) onCancelReply();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to send message', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      if (editingMessage) onCancelEdit();
      if (replyToMessage) onCancelReply();
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const emojis = ['👍', '❤️', '🔥', '😂', '🎉', '🚀', '💯', '✨', '👏', '😍', '🙌', '💡'];

  return (
    <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-md relative z-10">
      {/* Reply Banner */}
      {replyToMessage && (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl p-2.5 mb-2.5 text-xs animate-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate">
            <span className="w-1.5 h-6 bg-indigo-500 rounded-full shrink-0" />
            <div className="truncate">
              <span className="font-semibold text-indigo-300">
                Replying to {replyToMessage.sender?.display_name || 'user'}:{' '}
              </span>
              <span className="text-zinc-400 truncate">{replyToMessage.content}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Banner */}
      {editingMessage && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl p-2.5 mb-2.5 text-xs animate-in slide-in-from-bottom-1 text-amber-300">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Editing message</span>
            <span className="text-zinc-400 text-[11px]">(Press Esc to cancel)</span>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attachment Preview Chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200"
            >
              {att.mime_type.startsWith('image/') ? (
                <ImageIcon className="w-4 h-4 text-indigo-400" />
              ) : (
                <Paperclip className="w-4 h-4 text-zinc-400" />
              )}
              <span className="truncate max-w-[150px]">{att.file_name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                className="text-zinc-400 hover:text-rose-400 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Voice Recording UI */}
      {isRecording ? (
        <div className="flex items-center justify-between bg-zinc-900 border border-rose-500/40 rounded-2xl p-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-sm font-semibold text-rose-400">Recording voice message</span>
            <span className="text-xs font-mono font-bold text-zinc-300 bg-zinc-800 px-2.5 py-1 rounded-lg">
              {formatSeconds(recordingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              onClick={sendVoiceRecording}
              className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>Send Audio</span>
            </button>
          </div>
        </div>
      ) : (
        /* Standard Composer Input */
        <div className="flex items-end gap-2 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-1.5 focus-within:border-indigo-500/60 transition-colors">
          {/* File Upload Trigger */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,audio/*,application/pdf,text/plain"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-2xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
            title="Attach file or photo"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Emoji Picker Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-2.5 rounded-2xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
              title="Add emoji"
            >
              <Smile className="w-5 h-5" />
            </button>

            {showEmojiPicker && (
              <div
                className="absolute bottom-full mb-3 left-0 bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl p-2.5 grid grid-cols-6 gap-1.5 z-50 animate-in fade-in zoom-in-95"
                onMouseLeave={() => setShowEmojiPicker(false)}
              >
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setContent((prev) => prev + emoji);
                      setShowEmojiPicker(false);
                      textareaRef.current?.focus();
                    }}
                    className="p-2 hover:bg-zinc-800 rounded-xl text-lg hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-growing Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={editingMessage ? 'Update message...' : 'Write a message... (Enter to send, Shift+Enter for newline)'}
            rows={1}
            className="flex-1 max-h-36 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none py-2.5 px-2 leading-relaxed"
          />

          {/* Voice recording trigger button (shown when content is empty) */}
          {!content.trim() && attachments.length === 0 && !editingMessage ? (
            <button
              type="button"
              onClick={startRecording}
              className="p-2.5 rounded-2xl hover:bg-zinc-800 text-zinc-400 hover:text-indigo-400 transition-colors shrink-0"
              title="Record voice note"
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : (
            /* Send Button */
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isSubmitting || (!content.trim() && attachments.length === 0)}
              className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shadow-md shadow-indigo-600/20 shrink-0"
              title={editingMessage ? 'Save changes' : 'Send message'}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
