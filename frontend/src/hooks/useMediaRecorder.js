import { useCallback } from 'react';
import { useSession } from '../context/SessionContext';
import {
  getRecorderOutputMimeType,
  getSupportedRecorderMimeType,
} from '../utils/audioFormat';
import { stopRecorderAndWait } from '../utils/mediaRecorderLifecycle';

// Ask for the best container the current browser can actually create. iOS uses
// MP4/AAC while Chromium on desktop usually uses WebM/Opus, so the recorded Blob
// must keep the recorder's real MIME type all the way to the upload endpoint.
export function canRecordUploadableAudio() {
  return typeof MediaRecorder !== 'undefined';
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

  const mimeType = getSupportedRecorderMimeType();
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
      const outputMimeType = getRecorderOutputMimeType(recorder, chunks, mimeType);
      const blob = new Blob(chunks, {
        type: outputMimeType,
      });
      if (blob.size === 0) {
        console.warn(`[Recorder] Ignored empty local audio for turn ${turnId}`);
        return;
      }
      dispatch({ type: 'SAVE_LOCAL_AUDIO', payload: { turnId, blob } });
    };

    try {
      recorder.start(1000); // collect in 1s chunks
      refs.current.localRecorder = recorder;
    } catch (err) {
      console.error(`[Recorder] Cannot start local recorder for turn ${turnId}:`, err.message);
    }
  }, [dispatch, refs]);

  const stopLocalRecording = useCallback(() => {
    return stopRecorderAndWait(refs, 'localRecorder');
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
      const outputMimeType = getRecorderOutputMimeType(recorder, chunks, mimeType);
      const blob = new Blob(chunks, {
        type: outputMimeType,
      });
      if (blob.size === 0) {
        console.warn(`[Recorder] Ignored empty remote audio for turn ${turnId}`);
        return;
      }
      dispatch({ type: 'SAVE_REMOTE_AUDIO', payload: { turnId, blob } });
    };

    try {
      recorder.start(1000);
      refs.current.remoteRecorder = recorder;
    } catch (err) {
      console.error(`[Recorder] Cannot start remote recorder for turn ${turnId}:`, err.message);
    }
  }, [dispatch, refs]);

  const stopRemoteRecording = useCallback(() => {
    return stopRecorderAndWait(refs, 'remoteRecorder');
  }, [refs]);

  const stopAllRecordingAndWait = useCallback(async () => {
    const currentStops = [stopLocalRecording(), stopRemoteRecording()];
    const pendingStops = Array.from(refs.current.recorderStopPromises || []);
    await Promise.all([...currentStops, ...pendingStops]);
  }, [refs, stopLocalRecording, stopRemoteRecording]);

  const stopAll = useCallback(() => {
    stopLocalRecording();
    stopRemoteRecording();
  }, [stopLocalRecording, stopRemoteRecording]);

  return {
    startLocalRecording,
    stopLocalRecording,
    startRemoteRecording,
    stopRemoteRecording,
    stopAllRecordingAndWait,
    stopAll,
  };
}
