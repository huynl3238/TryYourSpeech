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

export function useMediaRecorder() {
  const { dispatch, refs } = useSession();
  const localChunksRef = useRef([]);
  const remoteChunksRef = useRef([]);

  const startLocalRecording = useCallback((stream, turnId) => {
    if (!stream) return;

    localChunksRef.current = [];
    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        localChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(localChunksRef.current, {
        type: mimeType || 'audio/webm',
      });
      dispatch({ type: 'SAVE_LOCAL_AUDIO', payload: { turnId, blob } });
      console.log(`[Recorder] Local audio saved for turn ${turnId}, size: ${blob.size} bytes`);
    };

    recorder.start(1000); // collect in 1s chunks
    refs.current.localRecorder = recorder;
    console.log(`[Recorder] Started local recording for turn ${turnId}`);
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

    remoteChunksRef.current = [];
    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(remoteStream, mimeType ? { mimeType } : {});

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        remoteChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(remoteChunksRef.current, {
        type: mimeType || 'audio/webm',
      });
      dispatch({ type: 'SAVE_REMOTE_AUDIO', payload: { turnId, blob } });
      console.log(`[Recorder] Remote audio saved for turn ${turnId}, size: ${blob.size} bytes`);
    };

    recorder.start(1000);
    refs.current.remoteRecorder = recorder;
    console.log(`[Recorder] Started remote recording for turn ${turnId}`);
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
