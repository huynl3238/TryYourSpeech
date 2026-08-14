export function getSpeechMediaConstraints(mediaDevices = globalThis.navigator?.mediaDevices) {
  const supported = mediaDevices?.getSupportedConstraints?.() || {};
  const audio = {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
  };

  // WebKit exposes voiceIsolation only on supported Apple versions. Adding it
  // conditionally avoids an over-constrained request on older iPhones.
  if (supported.voiceIsolation) {
    audio.voiceIsolation = { ideal: true };
  }

  return { audio, video: true };
}

export function markAudioTracksAsSpeech(stream) {
  stream?.getAudioTracks().forEach((track) => {
    if ('contentHint' in track) {
      track.contentHint = 'speech';
    }
  });

  return stream;
}
