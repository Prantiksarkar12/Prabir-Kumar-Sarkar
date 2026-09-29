import {
  User,
  UserPrivacySettings,
  Conversation,
  Message,
  Report,
  AuditLog,
  StorageStats,
} from '../types/chat';

const API_BASE_URL = (
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_BACKEND_URL)) ||
  ''
).replace(/\/+$/, '');

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('pulse_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('pulse_token', token);
      } else {
        localStorage.removeItem('pulse_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['x-session-token'] = this.token;
    }

    let url = endpoint;
    if (!endpoint.startsWith('http')) {
      if (API_BASE_URL) {
        if (API_BASE_URL.endsWith('/api/v1') && endpoint.startsWith('/api/')) {
          url = `${API_BASE_URL}${endpoint.replace(/^\/api/, '')}`;
        } else {
          url = `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
        }
      } else {
        url = endpoint;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || `Request failed with status ${response.status}`;
      const err = new Error(errorMsg) as any;
      err.status = response.status;
      err.is_banned = data.is_banned;
      throw err;
    }

    return data as T;
  }

  // AUTH
  auth = {
    register: async (payload: {
      username: string;
      display_name: string;
      email: string;
      password: string;
      account_type?: string;
      profile_meta?: any;
    }) => {
      const res = await this.request<{ user: User; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      this.setToken(res.token);
      return res;
    },
    login: async (payload: { identifier: string; password: string }) => {
      const res = await this.request<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      this.setToken(res.token);
      return res;
    },
    logout: async () => {
      try {
        await this.request('/api/auth/logout', { method: 'POST' });
      } finally {
        this.setToken(null);
      }
    },
    getSession: async () => {
      return this.request<{ user: User; privacy: UserPrivacySettings; token: string }>('/api/auth/session');
    },
    changePassword: (payload: { currentPassword: string; newPassword: string }) => {
      return this.request<{ success: boolean; message: string }>('/api/auth/password/change', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    deleteAccount: (password: string) => {
      return this.request<{ success: boolean; message: string }>('/api/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
    },
  };

  // USERS
  users = {
    getMe: () => this.request<User>('/api/users/me'),
    updateMe: (data: Partial<{ display_name: string; bio: string; avatar_url: string }>) =>
      this.request<User>('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    search: (query: string) =>
      this.request<Array<User & { is_online: boolean }>>(`/api/users/search?q=${encodeURIComponent(query)}`),
    getUser: (id: string) =>
      this.request<User & { is_online: boolean; is_blocked: boolean }>(`/api/users/${id}`),
    getPrivacy: () => this.request<UserPrivacySettings>('/api/users/me/privacy'),
    updatePrivacy: (settings: Partial<UserPrivacySettings>) =>
      this.request<{ success: boolean }>('/api/users/me/privacy', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    block: (id: string) =>
      this.request<{ success: boolean }>(`/api/users/${id}/block`, { method: 'POST' }),
    unblock: (id: string) =>
      this.request<{ success: boolean }>(`/api/users/${id}/block`, { method: 'DELETE' }),
    getBlocks: () =>
      this.request<Array<{ id: string; blocked_id: string; username: string; display_name: string; avatar_url: string }>>('/api/users/me/blocks'),
    getSessions: () =>
      this.request<Array<{ id: string; device_info: string; ip_address: string; expires_at: string; is_current: boolean }>>('/api/users/me/sessions'),
    revokeSession: (sessionId: string) =>
      this.request<{ success: boolean }>(`/api/users/me/sessions/${sessionId}`, { method: 'DELETE' }),
  };

  // CONVERSATIONS
  conversations = {
    list: () => this.request<Conversation[]>('/api/conversations'),
    get: (id: string) => this.request<Conversation>(`/api/conversations/${id}`),
    createDirect: (targetUserId: string) =>
      this.request<{ id: string; is_existing: boolean }>('/api/conversations/direct', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      }),
    createGroup: (title: string, description: string, memberUserIds: string[]) =>
      this.request<{ id: string; title: string }>('/api/conversations/group', {
        method: 'POST',
        body: JSON.stringify({ title, description, memberUserIds }),
      }),
    update: (id: string, data: Partial<{ title: string; description: string; avatar_url: string }>) =>
      this.request<Conversation>(`/api/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    addMember: (id: string, userId: string) =>
      this.request<{ success: boolean }>(`/api/conversations/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    removeMember: (id: string, targetUserId: string) =>
      this.request<{ success: boolean }>(`/api/conversations/${id}/members/${targetUserId}`, {
        method: 'DELETE',
      }),
    updateSettings: (id: string, settings: { is_pinned?: boolean; is_muted?: boolean; is_archived?: boolean }) =>
      this.request(`/api/conversations/${id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
  };

  // MESSAGES
  messages = {
    list: (conversationId: string, cursor?: string | null, limit: number = 50, q?: string | null) => {
      let url = `/api/conversations/${conversationId}/messages?limit=${limit}`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
      if (q) url += `&q=${encodeURIComponent(q)}`;
      return this.request<{ messages: Message[]; next_cursor: string | null; has_more: boolean }>(url);
    },
    send: (
      conversationId: string,
      payload: {
        content: string;
        message_type?: string;
        reply_to_message_id?: string | null;
        client_message_id?: string;
        attachments?: Array<{ file_name: string; file_url: string; file_size: number; mime_type: string; duration_seconds?: number | null }>;
      }
    ) =>
      this.request<Message>(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    edit: (id: string, content: string) =>
      this.request<Message>(`/api/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    delete: (id: string, mode: 'for_everyone' | 'for_me' = 'for_everyone') =>
      this.request<{ success: boolean; mode: string; messageId: string }>(`/api/messages/${id}?mode=${mode}`, {
        method: 'DELETE',
      }),
    toggleReaction: (id: string, reaction: string) =>
      this.request<{ action: 'added' | 'removed'; reaction: string }>(`/api/messages/${id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ reaction }),
      }),
    markRead: (conversationId: string) =>
      this.request<{ success: boolean; count: number }>(`/api/conversations/${conversationId}/read`, {
        method: 'POST',
      }),
    togglePin: (id: string) =>
      this.request<Message>(`/api/messages/${id}/pin`, {
        method: 'POST',
      }),
  };

  // UPLOADS
  uploads = {
    uploadFile: async (file: File | Blob, customName?: string, duration?: number) => {
      return new Promise<{
        file_name: string;
        file_url: string;
        file_size: number;
        mime_type: string;
        duration_seconds?: number | null;
      }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64Data = reader.result as string;
            const res = await apiClient.request<{
              file_name: string;
              file_url: string;
              file_size: number;
              mime_type: string;
              duration_seconds?: number | null;
            }>('/api/uploads', {
              method: 'POST',
              body: JSON.stringify({
                fileName: customName || (file instanceof File ? file.name : 'audio_message.webm'),
                mimeType: file.type || 'application/octet-stream',
                base64Data,
                duration,
              }),
            });
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
    },
  };

  // REPORTS
  reports = {
    submit: (payload: {
      reported_user_id?: string;
      message_id?: string;
      conversation_id?: string;
      reason: string;
      description?: string;
    }) =>
      this.request<{ success: boolean; message: string }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    list: (status?: string) =>
      this.request<Report[]>(`/api/reports${status ? `?status=${status}` : ''}`),
    resolve: (id: string, payload: { status: string; resolution_notes?: string; action_taken?: string }) =>
      this.request<Report>(`/api/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  };

  // ADMIN
  admin = {
    getStats: () =>
      this.request<{
        total_users: number;
        total_messages: number;
        total_groups: number;
        open_reports: number;
        total_reports: number;
        banned_users: number;
        online_users_count: number;
      }>('/api/admin/stats'),
    getUsers: (q?: string, role?: string) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (role) params.set('role', role);
      return this.request<User[]>(`/api/admin/users?${params.toString()}`);
    },
    changeRole: (id: string, role: string) =>
      this.request<{ id: string; role: string }>(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    ban: (id: string, reason: string) =>
      this.request<{ success: boolean }>(`/api/admin/users/${id}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    unban: (id: string) =>
      this.request<{ success: boolean }>(`/api/admin/users/${id}/unban`, {
        method: 'POST',
      }),
    getAuditLogs: () => this.request<AuditLog[]>('/api/admin/audit-logs'),
    getConversations: () =>
      this.request<Array<{ id: string; type: string; title: string; creator_name: string; member_count: number; updated_at: string }>>(
        '/api/admin/conversations'
      ),
    getStorageStats: () => this.request<StorageStats>('/api/admin/storage'),
  };

  // PROFILES & MULTI-ACCOUNT
  profiles = {
    switchAccountType: (account_type: string, metadata?: any) =>
      this.request<User>('/api/profiles/switch-account-type', {
        method: 'POST',
        body: JSON.stringify({ account_type, metadata }),
      }),
    getCreator: (userId: string) => this.request(`/api/profiles/creator/${userId}`),
    updateCreator: (data: any) =>
      this.request('/api/profiles/creator', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getBusiness: (userId: string) => this.request(`/api/profiles/business/${userId}`),
    updateBusiness: (data: any) =>
      this.request('/api/profiles/business', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getProfessional: (userId: string) => this.request(`/api/profiles/professional/${userId}`),
    updateProfessional: (data: any) =>
      this.request('/api/profiles/professional', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getBusinessMembers: () => this.request('/api/profiles/business-team/members'),
    addBusinessMember: (targetUserId: string, role: string) =>
      this.request('/api/profiles/business-team/members', {
        method: 'POST',
        body: JSON.stringify({ targetUserId, role }),
      }),
    removeBusinessMember: (targetUserId: string) =>
      this.request(`/api/profiles/business-team/members/${targetUserId}`, {
        method: 'DELETE',
      }),
    requestVerification: (verification_type: string, documents_info?: string) =>
      this.request('/api/profiles/verifications/request', {
        method: 'POST',
        body: JSON.stringify({ verification_type, documents_info }),
      }),
    listVerifications: () => this.request('/api/profiles/verifications'),
    reviewVerification: (id: string, status: string, rejection_reason?: string) =>
      this.request(`/api/profiles/verifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rejection_reason }),
      }),
  };

  // HEALTH
  health = {
    get: () => this.request('/api/health'),
    getLiveHealth: () => this.request('/health'),
    getDatabase: () => this.request('/api/health/database'),
    checkDatabase: () => this.request('/api/health/database'),
    getRedis: () => this.request('/api/health/redis'),
    getSmtp: () => this.request('/api/health/smtp'),
  };
}

export const apiClient = new ApiClient();
