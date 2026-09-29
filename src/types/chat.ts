export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
export type AccountType = 'PERSONAL' | 'CREATOR' | 'BUSINESS' | 'PROFESSIONAL';

export interface CreatorProfile {
  user_id: string;
  category: string;
  cover_image_url?: string | null;
  website_url?: string | null;
  social_links?: Record<string, string>;
  followers_count: number;
  featured_content?: string;
  is_accepting_collaborations: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessProfile {
  user_id: string;
  business_name: string;
  category: string;
  logo_url?: string | null;
  cover_image_url?: string | null;
  description?: string;
  website_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  opening_hours?: string | null;
  automated_welcome_message?: string;
  automated_away_message?: string;
  quick_replies?: Array<{ id: string; title: string; content: string }>;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalProfile {
  user_id: string;
  profession_category: string;
  skills: string[];
  experience_years: number;
  portfolio_items?: Array<{ title: string; description: string; link?: string }>;
  services?: Array<{ title: string; description: string; rate?: string }>;
  hourly_rate?: string;
  availability_status: 'AVAILABLE' | 'BUSY' | 'NOT_TAKING_CLIENTS';
  created_at: string;
  updated_at: string;
}

export interface AccountVerification {
  id: string;
  user_id: string;
  verification_type: 'CREATOR' | 'BUSINESS' | 'PROFESSIONAL' | 'EMAIL' | 'PHONE';
  status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  documents_info?: string;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export interface BusinessMember {
  id: string;
  business_user_id: string;
  member_user_id: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF';
  joined_at: string;
  user?: User;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url?: string | null;
  bio?: string | null;
  role: UserRole;
  account_type: AccountType;
  is_banned: boolean;
  ban_reason?: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  is_online?: boolean;
  // Account profile expansions
  creator_profile?: CreatorProfile;
  business_profile?: BusinessProfile;
  professional_profile?: ProfessionalProfile;
  verification_status?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  is_verified?: boolean;
}

export interface UserPrivacySettings {
  user_id: string;
  who_can_message: 'EVERYONE' | 'CONTACTS';
  who_can_see_online: 'EVERYONE' | 'CONTACTS' | 'NOBODY';
  who_can_see_last_seen: 'EVERYONE' | 'CONTACTS' | 'NOBODY';
  who_can_add_to_groups: 'EVERYONE' | 'CONTACTS';
  read_receipts_enabled: boolean;
  push_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  device_info: string;
  ip_address?: string;
  expires_at: string;
  created_at: string;
  last_active_at: string;
}

export type ConversationType = 'DIRECT' | 'GROUP';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MemberRole;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  last_read_message_id?: string | null;
  last_read_at?: string | null;
  joined_at: string;
  // populated user
  user?: User;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  members: ConversationMember[];
  last_message?: Message | null;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
}

export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VOICE' | 'SYSTEM';

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
  username?: string;
  display_name?: string;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  duration_seconds?: number | null;
  created_at: string;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  reply_to_message_id?: string | null;
  client_message_id?: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  // relations
  sender?: User;
  reply_to?: (Message & { sender_name?: string }) | null;
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
  reads?: MessageRead[];
  // client state
  delivery_status?: 'SENT' | 'DELIVERED' | 'READ';
}

export type ReportStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id?: string | null;
  message_id?: string | null;
  conversation_id?: string | null;
  reason: string;
  description?: string | null;
  status: ReportStatus;
  resolution_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  // joined info
  reporter?: { username: string; display_name: string };
  reported_user?: { username: string; display_name: string; role: string; is_banned: boolean };
  message_content?: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  metadata?: any;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
  actor_name?: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'NEW_MESSAGE' | 'MENTION' | 'REACTION' | 'GROUP_INVITE' | 'REPORT_UPDATE' | 'SYSTEM';
  title: string;
  body: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export interface PresenceState {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeen?: string;
}

export interface TypingState {
  conversationId: string;
  userId: string;
  username: string;
}

export interface StorageStats {
  status: string;
  bucket: string;
  endpoint: string;
  region: string;
  engine: string;
  total_files: number;
  total_bytes: number;
  total_size_formatted: string;
  disk_files_count: number;
  disk_bytes: number;
  disk_size_formatted: string;
  files_by_type: {
    images: { count: number; bytes: number; size_formatted: string };
    audio: { count: number; bytes: number; size_formatted: string };
    documents: { count: number; bytes: number; size_formatted: string };
    other: { count: number; bytes: number; size_formatted: string };
  };
  recent_files: Array<{
    id: string;
    filename: string;
    size_bytes: number;
    size_formatted: string;
    mime_type: string;
    public_url?: string;
    created_at: string;
    uploaded_by_username: string;
  }>;
}

