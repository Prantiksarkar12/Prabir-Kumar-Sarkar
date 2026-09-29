# Pulse Platform Architecture

Pulse is an enterprise-grade real-time chat platform engineered for resilience, absolute data integrity, and low-latency bidirectional communication.

## Architectural Principles

1. **Server as Single Source of Truth**: Client views never maintain unverified state. All creations, modifications, permissions, and soft deletions pass through authenticated server endpoints backed by PostgreSQL ACID transactions.
2. **True Event-Driven Synchronization**: Real-time communication utilizes Socket.IO with WebSocket priority, backed by room-based pub/sub routing, presence registries, and delivery receipts (SENT → DELIVERED → READ).
3. **Defense in Depth**: Role-based access control (RBAC), SQL parameterization, session revocation, and immutable audit logs protect all privileged operations.

## Component Overview

```text
┌────────────────────────────────────────────────────────┐
│                   React 19 Frontend                    │
│   (Socket.IO Client, MediaRecorder, Audio Waveforms)   │
└───────────────▲────────────────────────▲───────────────┘
                │ HTTP REST (JSON)       │ WebSockets (ws://)
┌───────────────▼────────────────────────▼───────────────┐
│               Node.js Express & Socket Gateway         │
│  - Auth Guard & Session Verifier                       │
│  - Room Multiplexer & Presence Registry                │
│  - Upload Storage Pipeline                             │
│  - Audit Log Collector                                 │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
┌───────────────▼────────┐      ┌────────▼───────────────┐
│  PostgreSQL (PGlite)   │      │ Redis / Event Broker   │
│  ACID Source of Truth  │      │ Distributed State      │
└────────────────────────┘      └────────────────────────┘
```

## Data Flow for Message Delivery

1. Client types and attaches media (audio note, image, or document).
2. Client requests `POST /api/conversations/:id/messages`.
3. Server executes transaction:
   - Validates membership in group/conversation.
   - Verifies blocking relationships and user suspension status.
   - Inserts row into `messages`.
   - Inserts attachment metadata into `message_attachments`.
   - Updates `conversations.updated_at`.
   - Marks sender read receipt.
4. On transaction `COMMIT`, server broadcasts `message:new` event to room `conversation:${id}`.
5. Connected sockets receive payload and render instantly; delivery status advances to `DELIVERED`.
6. Recipient opens viewport, triggering `POST /api/conversations/:id/read`, advancing status to `READ` (✓✓ blue).
