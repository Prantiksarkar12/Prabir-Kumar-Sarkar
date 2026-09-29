import { Router, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

export const uploadsRouter = Router();

const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// POST /api/uploads and /api/v1/uploads
uploadsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fileName, mimeType, base64Data, duration } = req.body;
    const currentUserId = req.user!.id;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: 'File data and MIME type are required' });
    }

    // Strip data URL prefix if present
    const base64Clean = base64Data.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    // Validate size (max 25MB)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      return res.status(400).json({ error: 'File exceeds maximum allowed size of 25MB' });
    }

    // Determine extension safely
    const extMatch = (fileName || '').match(/\.([a-zA-Z0-9]+)$/);
    let ext = extMatch ? extMatch[1].toLowerCase() : 'bin';

    if (mimeType.includes('image/png')) ext = 'png';
    else if (mimeType.includes('image/jpeg')) ext = 'jpg';
    else if (mimeType.includes('image/webp')) ext = 'webp';
    else if (mimeType.includes('image/gif')) ext = 'gif';
    else if (mimeType.includes('audio/webm')) ext = 'webm';
    else if (mimeType.includes('audio/ogg')) ext = 'ogg';
    else if (mimeType.includes('audio/mp3') || mimeType.includes('audio/mpeg')) ext = 'mp3';
    else if (mimeType.includes('audio/wav')) ext = 'wav';
    else if (mimeType.includes('application/pdf')) ext = 'pdf';

    const safeUniqueName = `${crypto.randomUUID()}.${ext}`;
    const destinationPath = path.join(uploadsDir, safeUniqueName);

    // Save binary data to storage (local filesystem or MinIO mount)
    fs.writeFileSync(destinationPath, buffer);

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const fileUrl = `/uploads/${safeUniqueName}`;
    const originalName = fileName ? path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_') : safeUniqueName;

    const uploadId = 'upl_' + crypto.randomUUID();
    const fileId = 'fil_' + crypto.randomUUID();

    // Store file metadata in PostgreSQL
    await db.query(
      `INSERT INTO uploads (id, user_id, filename, original_name, mime_type, size_bytes, storage_path, public_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [uploadId, currentUserId, safeUniqueName, originalName, mimeType, buffer.length, destinationPath, fileUrl]
    );

    await db.query(
      `INSERT INTO files (id, upload_id, user_id, file_name, file_size, mime_type, file_url, checksum, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [fileId, uploadId, currentUserId, originalName, buffer.length, mimeType, fileUrl, checksum]
    );

    return res.status(201).json({
      id: uploadId,
      file_id: fileId,
      file_name: originalName,
      file_url: fileUrl,
      file_size: buffer.length,
      mime_type: mimeType,
      duration_seconds: duration ? parseFloat(duration) : null,
      checksum,
    });
  } catch (error: any) {
    console.error('[Upload Error]', error);
    return res.status(500).json({ error: 'File upload processing failed' });
  }
});
