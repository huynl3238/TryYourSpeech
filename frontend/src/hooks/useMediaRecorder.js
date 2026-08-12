import { useCallback } from 'react';
import { useSession } from '../context/SessionContext';

// The upload endpoint accepts audio/webm and nothing else, and the file is
// stored as .webm before the AI pipeline reads it. Offering an audio/ogg
// fallback here produced recordings that played back locally but were rejected
// on upload, leaving a "Tải lại" button that could never succeed. Only ask for
// what the server can actually take.
const UPLOADABLE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
];

function getSupportedMimeType() {
  return UPLOADABLE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

// Safari records audio/mp4 and cannot produce WebM at all. Practice, peer notes
// and local playback still work there — only the upload does not — so this is a
// warning the user is shown, not a reason to block the session.
export function canRecordUploadableAudio() {
  return typeof MediaRecorder !== 'undefined' && getSupportedMimeType() !== '';
}

function createAudioStream(stream) {
  const audioTracks = stream
    ?.getAudioTracks()
    .filter((track) => track.readyState === 'live') || [];

  if (audioTracks.length === 0) {
    return null;
  }

  return new MediaStream(audioTracks);
}

function createAudioRecorder(stream) {
  const audioStream = createAudioStream(stream);
  if (!audioStream) {
    return { recorder: null, mimeType: '' };
  }

  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});

  return { recorder, mimeType };
}

export function useMediaRecorder() {
  const { dispatch, refs } = useSession();

  const startLocalRecording = useCallback((stream, turnId) => {
    if (!stream) return;
    if (refs.current.localRecorder && refs.current.localRecorder.state !== 'inactive') return;

    // One array per recorder, captured by this turn's handlers. A single shared
    // array used to be emptied here at the start of every turn, while the
    // previous recorder's `stop` event was still queued — so the moment two
    // recordings start back to back (any turn whose prep time is 0, which is
    // what real Part 1 and Part 3 look like) the finished turn would blob up
    // the *next* turn's chunks, or an empty array, and be dropped as empty.
    const chunks = [];
    let recorder;
    let mimeType;

    try {
      const result = createAudioRecorder(stream);
      recorder = result.recorder;
      mimeType = result.mimeType;
    } catch (err) {
      console.error(`[Recorder] Cannot create local recorder for turn ${turnId}:`, err.message);
      return;
    }

    if (!recorder) {
      console.warn(`[Recorder] No live audio track for local turn ${turnId}`);
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, {
        type: mimeType || 'audio/webm',
      });
      if (blob.size === 0) {
        console.warn(`[Recorder] Ignored empty local audio for turn ${turnId}`);
        return;
      }
      dispatch({ type: 'SAVE_LOCAL_AUDIO', payload: { turnId, blob } });
      console.log(`[Recorder] Local audio saved for turn ${turnId}, size: ${blob.size} bytes`);
    };

    try {
      recorder.start(1000); // collect in 1s chunks
      refs.current.localRecorder = recorder;
      console.log(`[Recorder] Started local recording for turn ${turnId}`);
    } catch (err) {
      console.error(`[Recorder] Cannot start local recorder for turn ${turnId}:`, err.message);
    }
  }, [dispatch, refs]);

  const stopLocalRecording = useCallback(() => {
    const recorder = refs.current.localRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      refs.current.localRecorder = null;
    }
  }, [refs]);

  const startRemoteRecording = useCallback((remoteStream, turnId) => {
    if (!remoteStream) return;
    if (refs.current.remoteRecorder && refs.current.remoteRecorder.state !== 'inactive') return;

    // Same reason as the local recorder above: this array belongs to this turn.
    const chunks = [];
    let recorder;
    let mimeType;

    try {
      const result = createAudioRecorder(remoteStream);
      recorder = result.recorder;
      mimeType = result.mimeType;
    } catch (err) {
      console.error(`[Recorder] Cannot create remote recorder for turn ${turnId}:`, err.message);
      return;
    }

    if (!recorder) {
      console.warn(`[Recorder] No live audio track for remote turn ${turnId}`);
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, {
        type: mimeType || 'audio/webm',
      });
      if (blob.size === 0) {
        console.warn(`[Recorder] Ignored empty remote audio for turn ${turnId}`);
        return;
      }
      dispatch({ type: 'SAVE_REMOTE_AUDIO', payload: { turnId, blob } });
      console.log(`[Recorder] Remote audio saved for turn ${turnId}, size: ${blob.size} bytes`);
    };

    try {
      recorder.start(1000);
      refs.current.remoteRecorder = recorder;
      console.log(`[Recorder] Started remote recording for turn ${turnId}`);
    } catch (err) {
      console.error(`[Recorder] Cannot start remote recorder for turn ${turnId}:`, err.message);
    }
  }, [dispatch, refs]);

  const stopRemoteRecording = useCallback(() => {
    const recorder = refs.current.remoteRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      refs.current.remoteRecorder = null;
    }
  }, [refs]);

  const stopAll = useCallback(() => {
    stopLocalRecording();
    stopRemoteRecording();
  }, [stopLocalRecording, stopRemoteRecording]);

  return {
    startLocalRecording,
    stopLocalRecording,
    startRemoteRecording,
    stopRemoteRecording,
    stopAll,
  };
}
