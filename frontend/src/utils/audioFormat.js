export const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export function getAudioMimeBase(mimeType) {
  if (typeof mimeType !== 'string') {
    return '';
  }

  return mimeType.split(';')[0].trim().toLowerCase();
}

export function getAudioFileExtension(mimeType) {
  const mimeBase = getAudioMimeBase(mimeType);

  if (mimeBase === 'audio/webm' || mimeBase === 'video/webm') {
    return 'webm';
  }

  if (
    mimeBase === 'audio/mp4'
    || mimeBase === 'video/mp4'
    || mimeBase === 'audio/x-m4a'
    || mimeBase === 'audio/m4a'
  ) {
    return 'mp4';
  }

  if (mimeBase === 'audio/ogg' || mimeBase === 'application/ogg') {
    return 'ogg';
  }

  return '';
}

export function getSupportedRecorderMimeType(Recorder = globalThis.MediaRecorder) {
  if (typeof Recorder?.isTypeSupported !== 'function') {
    return '';
  }

  return RECORDER_MIME_TYPES.find((type) => Recorder.isTypeSupported(type)) || '';
}

export function getRecorderOutputMimeType(recorder, chunks, requestedMimeType) {
  const candidates = [
    recorder?.mimeType,
    chunks.find((chunk) => getAudioFileExtension(chunk?.type))?.type,
    requestedMimeType,
  ];

  return candidates.find((type) => getAudioFileExtension(type)) || '';
}
