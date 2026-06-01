import { useCallback, useRef } from 'react';
import { useSession } from '../context/SessionContext';

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
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
  const localChunksRef = useRef([]);
  const remoteChunksRef = useRef([]);

  const startLocalRecording = useCallback((stream, turnId) => {
    if (!stream) return;
    if (refs.current.localRecorder && refs.current.localRecorder.state !== 'inactive') return;

    localChunksRef.current = [];
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
        localChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(localChunksRef.current, {
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

    remoteChunksRef.current = [];
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
        remoteChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(remoteChunksRef.current, {
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
