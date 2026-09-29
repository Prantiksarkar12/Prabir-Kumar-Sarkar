# Media & File Storage Architecture

Pulse handles rich media attachments including voice notes, images, documents, and videos.

## Storage Flow

```text
Browser Client (Microphone / File Picker)
  ↓
Base64 / Binary Payload Stream
  ↓
POST /api/uploads (Authenticated)
  ↓
MIME Type & Size Validation (Max 25MB)
  ↓
Cryptographic UUID Filename Generation
  ↓
Object Storage (Local Disk / S3 / MinIO)
  ↓
URL & Attachment Metadata Stored in PostgreSQL
```

## Security Guarantees

- **No Arbitrary Execution**: Files uploaded to the storage pipeline are stored with stripped permissions and served with `Cache-Control` and strict `Content-Type` headers.
- **Filename Sanitization**: Client-provided filenames are completely discarded for storage paths to prevent path traversal attacks (`../../`). Only the safe sanitized basename is preserved for display.
- **Audio Verification**: Browser `MediaRecorder` generates standard `audio/webm` or `audio/ogg` streams which are decoded natively by HTML5 audio engines.
