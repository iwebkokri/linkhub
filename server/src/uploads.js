import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './util.js';

// SVG is deliberately not allowed: it can carry scripts.
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const MAX_UPLOAD_MB = 5;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  // Random name; the extension comes from the validated mime type, never from the client's filename.
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT_BY_MIME[file.mimetype]),
});

export const imageUpload = multer({
  storage,
  // One image, no extra form fields: anything else is not a legitimate request.
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 0, parts: 2, headerPairs: 20 },
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) return cb(null, true);
    cb(new HttpError(400, 'Please upload a PNG, JPG, WebP or GIF image'));
  },
}).single('file');

function hasImageSignature(buf) {
  if (buf.length < 12) return false;
  const png = buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const gif = buf.toString('ascii', 0, 3) === 'GIF';
  const webp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return png || jpg || gif || webp;
}

/** After multer has saved the file: confirm the bytes really are an image. */
export async function verifySavedImage(file) {
  const fd = await fs.promises.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(12);
    await fd.read(buf, 0, 12, 0);
    if (!hasImageSignature(buf)) {
      await fs.promises.unlink(file.path).catch(() => {});
      throw new HttpError(400, 'That file is not a valid image');
    }
  } finally {
    await fd.close();
  }
}
