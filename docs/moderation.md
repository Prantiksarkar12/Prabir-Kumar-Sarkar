# Moderation & Platform Governance

Pulse includes an enterprise moderation console backed by database auditing and real-time intervention capabilities.

## User Roles & Hierarchy

1. **USER (Level 1)**: Can chat, create groups, block users, report offending content, and manage personal settings.
2. **MODERATOR (Level 2)**: Can inspect open reports, view message history in reported contexts, resolve or dismiss reports, and issue warnings or temporary bans.
3. **ADMIN (Level 3)**: Full user management, group management, report arbitration, and audit log inspection.
4. **SUPER_ADMIN (Level 4)**: Unrestricted administrative authority, role elevation, and system configuration.

## Incident Escalation Workflow

1. A user flags a message or profile via the in-app `Report` action, specifying a category (`HARASSMENT`, `SPAM`, `HATE_SPEECH`, `INAPPROPRIATE`) and optional context.
2. A record is created in the `reports` table with status `OPEN`.
3. Moderators and Admins see the live badge counter in the moderation panel.
4. Moderators review the report and choose an action:
   - **Resolve with Action**: Suspend the offending account and invalidate all its active sessions immediately.
   - **Delete Message**: Soft-delete the violating message for everyone.
   - **Dismiss**: Reject unwarranted flags.
5. Every action generates an immutable record in `audit_logs`.
