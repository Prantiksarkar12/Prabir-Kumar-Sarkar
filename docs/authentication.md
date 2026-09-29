# Authentication & Session Management

Pulse implements a defense-in-depth security model using token-based session persistence and secure server-side validation.

## Registration Flow

```text
Client Form Submission (username, display_name, email, password)
  ↓
Validation (Regex checks, uniqueness checks in PostgreSQL)
  ↓
Bcrypt Password Hashing (12 rounds)
  ↓
PostgreSQL Transaction:
  1. Insert user row
  2. Insert default privacy settings
  3. Create session record (30-day expiry)
  ↓
Set HTTP-Only Cookie + Return Bearer Token
```

## Session Management

- Each user can have multiple concurrent active sessions (Desktop, Mobile, Tablet).
- Sessions are stored in the `sessions` table with device user-agent, IP address, and last activity timestamps.
- Users can view and revoke individual sessions from Settings.
- When an account is suspended or the password is changed, conflicting sessions are immediately revoked.
