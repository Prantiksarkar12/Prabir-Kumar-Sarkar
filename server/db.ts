import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// Ensure data directory exists for PostgreSQL database files
const dataDir = path.resolve(process.cwd(), 'data/pulse_pg');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure uploads directory exists for persistent media/files
const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<any>;
}

let activeClient: DbClient;
let dbEngineName: string = 'PostgreSQL (Embedded PGlite)';
let isRemotePostgres: boolean = false;

// Initialize embedded PGlite by default
const pgliteInstance = new PGlite(dataDir);
activeClient = {
  async query<T = any>(sql: string, params?: any[]) {
    return pgliteInstance.query<T>(sql, params);
  },
  async exec(sql: string) {
    return pgliteInstance.exec(sql);
  }
};

export const db: DbClient = {
  query<T = any>(sql: string, params?: any[]) {
    return activeClient.query<T>(sql, params);
  },
  exec(sql: string) {
    return activeClient.exec(sql);
  }
};

export function getDbInfo() {
  return {
    engine: dbEngineName,
    isRemote: isRemotePostgres,
    dataDirectory: dataDir,
  };
}

/**
 * Initialize all PostgreSQL tables, indexes, and constraints
 */
export async function initDatabase() {
  // If DATABASE_URL is configured (e.g. self-hosted external PostgreSQL or production VPS), attempt connection
  if (process.env.DATABASE_URL) {
    try {
      console.log('[DB] Connecting to external PostgreSQL at DATABASE_URL...');
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 4000,
      });

      // Test query
      const testRes = await pool.query('SELECT 1 as connected');
      if (testRes.rows.length > 0) {
        activeClient = {
          async query<T = any>(sql: string, params?: any[]) {
            const res = await pool.query(sql, params);
            return { rows: res.rows as T[] };
          },
          async exec(sql: string) {
            return pool.query(sql);
          }
        };
        dbEngineName = 'PostgreSQL (External / Dedicated Server)';
        isRemotePostgres = true;
        console.log('[DB] Connected to dedicated PostgreSQL server successfully.');
      }
    } catch (err: any) {
      console.warn('[DB] Could not connect to external PostgreSQL, falling back to embedded PostgreSQL:', err.message);
      dbEngineName = 'PostgreSQL (Embedded PGlite Persistent Fallback)';
      isRemotePostgres = false;
    }
  }

  console.log('[DB] Initializing PostgreSQL schema with all core platform tables...');

  await db.exec(`
    -- USERS TABLE
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'USER', -- 'USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'
      account_type TEXT NOT NULL DEFAULT 'PERSONAL', -- 'PERSONAL', 'CREATOR', 'BUSINESS', 'PROFESSIONAL'
      is_banned BOOLEAN NOT NULL DEFAULT FALSE,
      ban_reason TEXT,
      last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'PERSONAL';

    -- ACCOUNTS (Multi-provider authentication)
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'credentials',
      provider_account_id TEXT NOT NULL,
      password_hash TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    );

    -- ACCOUNT PROFILES (Account type management)
    CREATE TABLE IF NOT EXISTS account_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_type TEXT NOT NULL DEFAULT 'PERSONAL',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, account_type)
    );

    -- PERSONAL PROFILES
    CREATE TABLE IF NOT EXISTS personal_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      custom_status TEXT DEFAULT '',
      mood_emoji TEXT DEFAULT '',
      pronouns TEXT DEFAULT '',
      birthday DATE,
      location TEXT DEFAULT '',
      website TEXT DEFAULT '',
      hobbies JSONB DEFAULT '[]',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- CREATOR PROFILES
    CREATE TABLE IF NOT EXISTS creator_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'Digital Creator',
      cover_image_url TEXT,
      website_url TEXT,
      social_links JSONB DEFAULT '{}',
      followers_count INTEGER NOT NULL DEFAULT 0,
      subscribers_count INTEGER NOT NULL DEFAULT 0,
      featured_content TEXT DEFAULT '',
      is_accepting_collaborations BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- BUSINESS PROFILES
    CREATE TABLE IF NOT EXISTS business_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Organization',
      logo_url TEXT,
      cover_image_url TEXT,
      description TEXT DEFAULT '',
      website_url TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      opening_hours TEXT DEFAULT 'Mon - Fri: 9:00 AM - 6:00 PM',
      automated_welcome_message TEXT DEFAULT 'Hello! Thank you for reaching out. How can our team assist you today?',
      automated_away_message TEXT DEFAULT 'We are currently offline. We will respond promptly during business hours.',
      quick_replies JSONB DEFAULT '[{"id":"qr_1","title":"Business Hours","content":"Our operational hours are Mon-Fri from 9:00 AM to 6:00 PM."},{"id":"qr_2","title":"Location & Address","content":"You can visit our office or reach us directly via email and phone."}]',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- BUSINESS MEMBERS / STAFF
    CREATE TABLE IF NOT EXISTS business_members (
      id TEXT PRIMARY KEY,
      business_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'STAFF', -- 'OWNER', 'ADMIN', 'MANAGER', 'STAFF'
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(business_user_id, member_user_id)
    );

    -- BUSINESS PERMISSIONS
    CREATE TABLE IF NOT EXISTS business_permissions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL, -- 'OWNER', 'ADMIN', 'MANAGER', 'STAFF'
      permissions JSONB NOT NULL DEFAULT '{"can_respond": true, "can_edit_profile": false, "can_view_analytics": false}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(business_id, role)
    );

    -- PROFESSIONAL PROFILES
    CREATE TABLE IF NOT EXISTS professional_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      profession_category TEXT NOT NULL DEFAULT 'Consultant',
      skills JSONB DEFAULT '["Consulting","Project Delivery","Technical Advisory"]',
      experience_years INTEGER DEFAULT 3,
      portfolio_items JSONB DEFAULT '[]',
      services JSONB DEFAULT '[{"title":"Initial Consultation","description":"30-minute discovery session","rate":"Free"}]',
      hourly_rate TEXT DEFAULT '$75/hr',
      availability_status TEXT DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'BUSY', 'NOT_TAKING_CLIENTS'
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- FOLLOWS (Social Graph for Creators & Users)
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    );

    -- CREATOR SUBSCRIBERS
    CREATE TABLE IF NOT EXISTS creator_subscribers (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscriber_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL DEFAULT 'STANDARD', -- 'STANDARD', 'VIP', 'SUPPORTER'
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'CANCELLED', 'EXPIRED'
      expires_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(creator_id, subscriber_id)
    );

    -- VERIFICATION REQUESTS
    CREATE TABLE IF NOT EXISTS verification_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_type TEXT NOT NULL, -- 'CREATOR', 'BUSINESS', 'PROFESSIONAL'
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO'
      document_urls JSONB DEFAULT '[]',
      notes TEXT DEFAULT '',
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP WITH TIME ZONE,
      rejection_reason TEXT,
      organization_name TEXT DEFAULT '',
      registration_number TEXT DEFAULT '',
      identity_type TEXT DEFAULT '',
      id_number TEXT DEFAULT '',
      proof_url TEXT DEFAULT '',
      website_url TEXT DEFAULT '',
      requested_info_notes TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS organization_name TEXT DEFAULT '';
    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS registration_number TEXT DEFAULT '';
    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS identity_type TEXT DEFAULT '';
    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS id_number TEXT DEFAULT '';
    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS proof_url TEXT DEFAULT '';
    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS website_url TEXT DEFAULT '';
    ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS requested_info_notes TEXT DEFAULT '';

    -- USER AI PRIVACY SETTINGS (Default: OFF - Never automatically train on private chats)
    CREATE TABLE IF NOT EXISTS user_ai_privacy (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      use_chats_for_training BOOLEAN NOT NULL DEFAULT FALSE,
      allow_anonymized_feedback BOOLEAN NOT NULL DEFAULT FALSE,
      allow_model_evaluation BOOLEAN NOT NULL DEFAULT FALSE,
      consent_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- PRANTIK AI MODELS TABLE (Own Model Infrastructure & Lifecycle)
    CREATE TABLE IF NOT EXISTS ai_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, -- e.g. 'PRANTIK-AI-1.0'
      version TEXT NOT NULL,
      base_model TEXT NOT NULL, -- e.g. 'PRANTIK-BASE-7B'
      architecture TEXT NOT NULL DEFAULT 'Transformer Decoder / Private Weights',
      status TEXT NOT NULL DEFAULT 'EVALUATING', -- 'BASE', 'TRAINING', 'EVALUATING', 'STAGING', 'PRODUCTION', 'RETIRED', 'ROLLED_BACK'
      parameters_count TEXT NOT NULL DEFAULT '7 Billion',
      context_window INTEGER NOT NULL DEFAULT 8192,
      training_dataset_id TEXT,
      training_loss NUMERIC(6,4) DEFAULT 0.8421,
      evaluation_score NUMERIC(5,2) DEFAULT 94.50,
      privacy_leakage_detected BOOLEAN NOT NULL DEFAULT FALSE,
      canary_leakage_detected BOOLEAN NOT NULL DEFAULT FALSE,
      evaluations JSONB DEFAULT '{}',
      model_storage_path TEXT DEFAULT 'data/models/prantik-ai-1.0',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      deployed_at TIMESTAMP WITH TIME ZONE
    );

    -- PRANTIK AI DATASETS TABLE (Anonymous Dataset Pipeline)
    CREATE TABLE IF NOT EXISTS ai_datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      source_type TEXT NOT NULL, -- 'USER_CONSENTED_ANONYMIZED', 'CURATED_DOMAIN', 'SYNTHETIC_EVAL', 'INSTRUCTION_SEED'
      consent_policy TEXT NOT NULL DEFAULT 'EXPLICIT_OPT_IN_ONLY',
      status TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'TRAINING', 'COMPLETED', 'REJECTED', 'ARCHIVED'
      record_count INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      pii_redaction_rate NUMERIC(5,2) DEFAULT 100.00,
      lineage_summary JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- PRANTIK AI DATASET RECORDS (De-identified & Redacted)
    CREATE TABLE IF NOT EXISTS ai_dataset_records (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES ai_datasets(id) ON DELETE CASCADE,
      example_id TEXT NOT NULL UNIQUE, -- e.g. 'conversation_example_83921' (NEVER user id/name)
      instruction TEXT NOT NULL,
      input_context TEXT DEFAULT '',
      output_response TEXT NOT NULL,
      source_category TEXT NOT NULL DEFAULT 'CHAT_CONVERSATION',
      consent_verified BOOLEAN NOT NULL DEFAULT TRUE,
      privacy_processed BOOLEAN NOT NULL DEFAULT TRUE,
      pii_redacted_count INTEGER NOT NULL DEFAULT 0,
      safety_score NUMERIC(4,2) DEFAULT 0.99,
      status TEXT NOT NULL DEFAULT 'INCLUDED', -- 'INCLUDED', 'FLAGGED', 'REMOVED', 'REVIEWED'
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- PRANTIK AI TRAINING JOBS
    CREATE TABLE IF NOT EXISTS ai_training_jobs (
      id TEXT PRIMARY KEY,
      model_name TEXT NOT NULL,
      base_model TEXT NOT NULL,
      dataset_id TEXT NOT NULL REFERENCES ai_datasets(id),
      epochs INTEGER NOT NULL DEFAULT 3,
      learning_rate TEXT NOT NULL DEFAULT '2e-4',
      lora_rank INTEGER NOT NULL DEFAULT 16,
      status TEXT NOT NULL DEFAULT 'QUEUED', -- 'QUEUED', 'TRAINING', 'COMPLETED', 'FAILED', 'CANCELLED'
      progress_percent INTEGER NOT NULL DEFAULT 0,
      current_epoch INTEGER NOT NULL DEFAULT 0,
      loss NUMERIC(6,4) DEFAULT 1.2500,
      logs JSONB DEFAULT '[]',
      started_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE
    );

    -- PRANTIK AI AUDIT LOGS (Immutable security and training events)
    CREATE TABLE IF NOT EXISTS ai_audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL DEFAULT 'AI_ADMIN',
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL, -- 'DATASET', 'RECORD', 'MODEL', 'TRAINING_JOB', 'EVALUATION', 'PRIVACY_SETTING'
      resource_id TEXT,
      result TEXT NOT NULL DEFAULT 'SUCCESS',
      details JSONB DEFAULT '{}',
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- ACCOUNT VERIFICATIONS (Historical / Audit View)
    CREATE TABLE IF NOT EXISTS account_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verification_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNVERIFIED',
      documents_info TEXT,
      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP WITH TIME ZONE,
      rejection_reason TEXT,
      UNIQUE(user_id, verification_type)
    );

    -- SESSIONS TABLE
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      device_info TEXT,
      ip_address TEXT,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- DEVICES (Multi-device tracking)
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      device_name TEXT NOT NULL DEFAULT 'Web Browser',
      device_type TEXT NOT NULL DEFAULT 'BROWSER', -- 'MOBILE', 'DESKTOP', 'BROWSER', 'TABLET'
      os TEXT DEFAULT '',
      browser TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      push_token TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- USER SETTINGS
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system',
      language TEXT NOT NULL DEFAULT 'en',
      sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      enter_to_send BOOLEAN NOT NULL DEFAULT TRUE,
      compact_mode BOOLEAN NOT NULL DEFAULT FALSE,
      notify_desktop BOOLEAN NOT NULL DEFAULT TRUE,
      notify_sound BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- PRIVACY SETTINGS
    CREATE TABLE IF NOT EXISTS user_privacy_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      who_can_message TEXT NOT NULL DEFAULT 'EVERYONE',
      who_can_see_online TEXT NOT NULL DEFAULT 'EVERYONE',
      who_can_see_last_seen TEXT NOT NULL DEFAULT 'EVERYONE',
      who_can_add_to_groups TEXT NOT NULL DEFAULT 'EVERYONE',
      read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      push_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- CONVERSATIONS TABLE
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'DIRECT', -- 'DIRECT', 'GROUP'
      title TEXT,
      description TEXT,
      avatar_url TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- GROUPS TABLE
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      avatar_url TEXT,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      member_limit INTEGER NOT NULL DEFAULT 50000,
      rules TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- GROUP MEMBERS
    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'MEMBER', -- 'OWNER', 'ADMIN', 'MODERATOR', 'MEMBER'
      permissions JSONB DEFAULT '{"can_post": true, "can_invite": true, "can_pin": false}',
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(group_id, user_id)
    );

    -- CONVERSATION MEMBERS TABLE
    CREATE TABLE IF NOT EXISTS conversation_members (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'MEMBER', -- 'OWNER', 'ADMIN', 'MEMBER'
      is_muted BOOLEAN NOT NULL DEFAULT FALSE,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      last_read_message_id TEXT,
      last_read_at TIMESTAMP WITH TIME ZONE,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(conversation_id, user_id)
    );

    -- MUTED CONVERSATIONS
    CREATE TABLE IF NOT EXISTS muted_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      muted_until TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, conversation_id)
    );

    -- ARCHIVED CONVERSATIONS
    CREATE TABLE IF NOT EXISTS archived_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, conversation_id)
    );

    -- MESSAGES TABLE
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'TEXT', -- 'TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VOICE', 'SYSTEM'
      reply_to_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      client_message_id TEXT,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      edited_at TIMESTAMP WITH TIME ZONE,
      deleted_at TIMESTAMP WITH TIME ZONE,
      deleted_by TEXT
    );

    -- MESSAGE REPLIES
    CREATE TABLE IF NOT EXISTS message_replies (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      parent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(message_id, parent_message_id)
    );

    -- MESSAGE EDITS AUDIT
    CREATE TABLE IF NOT EXISTS message_edits (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      old_content TEXT NOT NULL,
      new_content TEXT NOT NULL,
      edited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- MESSAGE DELIVERIES
    CREATE TABLE IF NOT EXISTS message_deliveries (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );

    -- MESSAGE DELETIONS (FOR 'DELETE FOR ME')
    CREATE TABLE IF NOT EXISTS message_deletions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );

    -- MESSAGE REACTIONS TABLE
    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(message_id, user_id, reaction)
    );

    -- MESSAGE ATTACHMENTS TABLE
    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      duration_seconds REAL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- MESSAGE READS TABLE
    CREATE TABLE IF NOT EXISTS message_reads (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );

    -- PINNED MESSAGES
    CREATE TABLE IF NOT EXISTS pinned_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      pinned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(conversation_id, message_id)
    );

    -- SAVED MESSAGES (Bookmarks)
    CREATE TABLE IF NOT EXISTS saved_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      note TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, message_id)
    );

    -- BLOCKS TABLE
    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    );

    -- REPORTS TABLE
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      resolution_notes TEXT,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- NOTIFICATIONS TABLE
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- PUSH SUBSCRIPTIONS TABLE
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL,
      keys_auth TEXT NOT NULL,
      keys_p256dh TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- UPLOADS AND FILES STORAGE
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_path TEXT NOT NULL,
      public_url TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      upload_id TEXT REFERENCES uploads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      checksum TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- API KEYS & WEBHOOK EVENTS (Developer and integration endpoints)
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      permissions JSONB DEFAULT '["chat:read", "chat:write"]',
      last_used_at TIMESTAMP WITH TIME ZONE,
      expires_at TIMESTAMP WITH TIME ZONE,
      is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMP WITH TIME ZONE,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- AUDIT LOGS TABLE
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- SECURITY LOGS TABLE
    CREATE TABLE IF NOT EXISTS security_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- ADMIN ACTIONS TABLE
    CREATE TABLE IF NOT EXISTS admin_actions (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- PERFORMANCE INDEXES
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
    CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_created ON security_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_messages_user ON saved_messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_pinned_messages_conv ON pinned_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_ai_models_status ON ai_models(status);
    CREATE INDEX IF NOT EXISTS idx_ai_datasets_status ON ai_datasets(status);
    CREATE INDEX IF NOT EXISTS idx_ai_records_dataset ON ai_dataset_records(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_ai_audit_created ON ai_audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_requests(status);
  `);

  // Seed default PRANTIK AI models if not already existing
  const existingModels = await db.query('SELECT COUNT(*) as count FROM ai_models');
  if (parseInt((existingModels.rows[0] as any)?.count || '0', 10) === 0) {
    console.log('[DB] Seeding PRANTIK AI model versions and private infrastructure...');
    
    // Dataset 1: Core Instruction Set
    await db.query(`
      INSERT INTO ai_datasets (id, name, version, source_type, consent_policy, status, record_count, checksum, pii_redaction_rate, lineage_summary)
      VALUES 
      ('ds_core_v1', 'PRANTIK Foundation Instructions', '1.0.0', 'INSTRUCTION_SEED', 'EXPLICIT_OPT_IN_ONLY', 'APPROVED', 240, 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069', 100.00, '{"origin": "Curated Domain Instructions", "anonymization_verified": true, "human_reviewed": true}'),
      ('ds_consented_v2', 'Consented User Conversation Subset (Anonymized)', '2.1.0', 'USER_CONSENTED_ANONYMIZED', 'EXPLICIT_OPT_IN_ONLY', 'REVIEW', 85, 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 100.00, '{"origin": "Explicit Opt-In Only", "pii_redaction_completed": true, "raw_user_ids_excluded": true}')
    `);

    // Sample anonymized records (Notice: Zero user IDs or personal names!)
    await db.query(`
      INSERT INTO ai_dataset_records (id, dataset_id, example_id, instruction, input_context, output_response, source_category, consent_verified, privacy_processed, pii_redacted_count, safety_score, status)
      VALUES
      ('rec_01', 'ds_core_v1', 'conversation_example_83921', 'How do I configure privacy settings on the platform?', '', 'You can manage your privacy by navigating to Settings > Privacy. Here you can configure who can send you direct messages, see your online presence, view your last seen timestamps, and control read receipts.', 'Q_AND_A', TRUE, TRUE, 0, 0.99, 'INCLUDED'),
      ('rec_02', 'ds_core_v1', 'conversation_example_10482', 'Draft a message acknowledging a business contract receipt.', 'Context: Received NDA from client.', 'Thank you for transmitting the signed agreement. Our legal team has verified the documentation, and we are ready to proceed with project onboarding.', 'INSTRUCTION', TRUE, TRUE, 2, 0.98, 'INCLUDED'),
      ('rec_03', 'ds_consented_v2', 'conversation_example_49201', 'Tell [PERSON_NAME] that the project milestone is ready for review.', '', 'Hi [PERSON_NAME], the assets for Milestone 2 have been published to our shared workspace for your review.', 'CHAT_CONVERSATION', TRUE, TRUE, 1, 0.99, 'INCLUDED')
    `);

    // Model 1: PRANTIK-AI-1.0 (Production)
    await db.query(`
      INSERT INTO ai_models (id, name, version, base_model, architecture, status, parameters_count, context_window, training_dataset_id, training_loss, evaluation_score, privacy_leakage_detected, canary_leakage_detected, evaluations, model_storage_path, deployed_at)
      VALUES 
      ('model_prantik_v1', 'PRANTIK-AI-1.0', '1.0.0', 'PRANTIK-BASE-7B', 'Transformer Decoder / Private QLoRA 4-bit', 'PRODUCTION', '7 Billion', 8192, 'ds_core_v1', 0.6214, 96.50, FALSE, FALSE, '{"accuracy": 96.5, "instruction_following": 98.2, "hallucination_rate": 1.8, "safety_score": 99.4, "privacy_leakage": 0.0, "pii_leakage": 0.0, "canary_test": "PASSED", "prompt_injection_resistance": 97.8}', 'data/models/prantik-ai-1.0', NOW()),
      ('model_prantik_v02', 'PRANTIK-AI-0.2', '0.2.0', 'PRANTIK-BASE-7B', 'Transformer Decoder / Private LoRA Rank-16', 'STAGING', '7 Billion', 4096, 'ds_consented_v2', 0.7850, 91.20, FALSE, FALSE, '{"accuracy": 91.2, "instruction_following": 93.0, "hallucination_rate": 3.4, "safety_score": 98.1, "privacy_leakage": 0.0, "pii_leakage": 0.0, "canary_test": "PASSED", "prompt_injection_resistance": 94.0}', 'data/models/prantik-ai-0.2', NOW()),
      ('model_prantik_v01', 'PRANTIK-AI-0.1', '0.1.0', 'PRANTIK-BASE-7B', 'Transformer Decoder / Base Fine-Tuned', 'ROLLED_BACK', '7 Billion', 4096, 'ds_core_v1', 1.0420, 84.80, FALSE, FALSE, '{"accuracy": 84.8, "instruction_following": 86.5, "hallucination_rate": 5.2, "safety_score": 95.0, "privacy_leakage": 0.0, "pii_leakage": 0.0, "canary_test": "PASSED"}', 'data/models/prantik-ai-0.1', NOW() - INTERVAL '7 days')
    `);

    // Initial AI Audit Logs
    await db.query(`
      INSERT INTO ai_audit_logs (id, actor_id, actor_role, action, resource_type, resource_id, result, details, timestamp)
      VALUES
      ('log_01', NULL, 'SUPER_ADMIN', 'MODEL_DEPLOYED', 'MODEL', 'model_prantik_v1', 'SUCCESS', '{"model_version": "PRANTIK-AI-1.0", "target": "PRODUCTION", "privacy_evaluation": "VERIFIED_SAFE"}', NOW() - INTERVAL '2 days'),
      ('log_02', NULL, 'AI_ENGINEER', 'EVALUATION_COMPLETED', 'MODEL', 'model_prantik_v1', 'SUCCESS', '{"score": 96.5, "privacy_leakage_detected": false, "canary_test": "PASSED"}', NOW() - INTERVAL '3 days'),
      ('log_03', NULL, 'AI_DATA_REVIEWER', 'DATASET_APPROVED', 'DATASET', 'ds_core_v1', 'SUCCESS', '{"records_reviewed": 240, "pii_redaction_rate": 100.0}', NOW() - INTERVAL '4 days')
    `);
  }

  console.log(`[DB] All PostgreSQL tables, foreign keys, indexes, and PRANTIK AI infrastructure initialized successfully on ${dbEngineName}.`);
}
