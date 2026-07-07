import { fileURLToPath } from 'node:url';
import { join, normalize } from 'node:path';

const uploadsDirectory = fileURLToPath(new URL('../../uploads', import.meta.url));

export function resolveUploadAudioPath(audioUrl) {
  if (typeof audioUrl !== 'string' || !audioUrl.startsWith('/uploads/audio/')) {
    throw new Error('audioUrl is invalid');
  }

  const filePath = join(uploadsDirectory, audioUrl.replace('/uploads/', ''));
  if (!normalize(filePath).startsWith(normalize(uploadsDirectory))) {
    throw new Error('audioUrl is invalid');
  }

  return filePath;
}
