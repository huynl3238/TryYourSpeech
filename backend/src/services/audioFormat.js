import { open } from 'node:fs/promises';

export const AUDIO_FILE_EXTENSIONS = ['webm', 'mp4', 'ogg', 'wav'];

const uploadMimeTypes = new Set([
  'audio/webm',
  'video/webm',
  'audio/mp4',
  'video/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'application/ogg',
]);

function getMimeBase(mimeType) {
  if (typeof mimeType !== 'string') {
    return '';
  }

  return mimeType.split(';')[0].trim().toLowerCase();
}

export function isSupportedAudioUploadMimeType(mimeType) {
  return uploadMimeTypes.has(getMimeBase(mimeType));
}

export function detectAudioFormat(header) {
  if (!Buffer.isBuffer(header)) {
    return null;
  }

  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { extension: 'webm', contentType: 'audio/webm' };
  }

  const ftypPosition = header.indexOf(Buffer.from('ftyp'));
  if (ftypPosition >= 4 && ftypPosition <= 32) {
    return { extension: 'mp4', contentType: 'audio/mp4' };
  }

  if (header.length >= 4 && header.subarray(0, 4).toString('ascii') === 'OggS') {
    return { extension: 'ogg', contentType: 'audio/ogg' };
  }

  if (
    header.length >= 12
    && header.subarray(0, 4).toString('ascii') === 'RIFF'
    && header.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return { extension: 'wav', contentType: 'audio/wav' };
  }

  return null;
}

export async function inspectAudioFile(filePath) {
  const handle = await open(filePath, 'r');

  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const format = detectAudioFormat(header.subarray(0, bytesRead));

    if (!format) {
      throw new Error('audio container is not supported');
    }

    return format;
  } finally {
    await handle.close();
  }
}
