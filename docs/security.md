# Security & Threat Model

Pulse enforces defense-in-depth principles across transport, storage, compute, and data layers.

## Core Protections

1. **SQL Injection Resistance**: All SQL queries use parameterized placeholders (`$1, $2, ...`) without raw string interpolation.
2. **Password Cryptography**: Bcrypt with 12 adaptive salting rounds guarantees resistance against offline brute-force and dictionary attacks. Plaintext passwords never touch logs, cookies, or databases.
3. **Cross-Site Scripting (XSS)**: React 19 JSX sanitizes text nodes by default. HTML injection inside messages is precluded.
4. **IDOR & Authorization Guards**: Every endpoint querying a conversation or message verifies the requesting user's active membership in PostgreSQL before releasing data or accepting mutations.
5. **WebSocket Security**: Sockets must pass handshake authentication with a valid, non-expired, non-suspended session token. Sockets are isolated in conversation rooms.
6. **Immutable Audit Trails**: High-privilege administrative interventions (role alterations, suspensions, report resolutions) are automatically appended to the `audit_logs` table with actor ID, IP address, and timestamp.
