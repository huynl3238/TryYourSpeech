const trackedStreams = new Set();

export function rememberMediaStream(stream) {
  if (!stream) return stream;

  trackedStreams.add(stream);
  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      const hasLiveTrack = stream.getTracks().some((item) => item.readyState === 'live');
      if (!hasLiveTrack) {
        trackedStreams.delete(stream);
      }
    }, { once: true });
  });

  return stream;
}

export function detachVideoElement(videoRef) {
  if (videoRef?.current) {
    videoRef.current.pause?.();
    videoRef.current.srcObject = null;
  }
}

function detachAllVideoElements() {
  document.querySelectorAll('video').forEach((video) => {
    video.pause?.();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load?.();
  });
}

export function stopStreamTracks(stream) {
  if (!stream) return;

  stream.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') {
      track.stop();
    }
  });
  trackedStreams.delete(stream);
}

function stopTrackedStreams() {
  Array.from(trackedStreams).forEach(stopStreamTracks);
}

export function cleanupMediaSession(refs, videoRefs = []) {
  stopTrackedStreams();
  stopStreamTracks(refs.current.localStream);
  stopStreamTracks(refs.current.remoteStream);

  refs.current.peerConnection?.getSenders?.().forEach((sender) => {
    sender.replaceTrack?.(null).catch?.(() => {});
    if (sender.track?.readyState !== 'ended') {
      sender.track?.stop();
    }
  });
  refs.current.peerConnection?.getReceivers?.().forEach((receiver) => {
    if (receiver.track?.readyState !== 'ended') {
      receiver.track?.stop();
    }
  });
  refs.current.peerConnection?.getTransceivers?.().forEach((transceiver) => {
    if (transceiver.sender?.track?.readyState !== 'ended') {
      transceiver.sender?.track?.stop();
    }
    if (transceiver.receiver?.track?.readyState !== 'ended') {
      transceiver.receiver?.track?.stop();
    }
    try {
      transceiver.stop?.();
    } catch (error) {
      console.warn('[MediaCleanup] Cannot stop transceiver', error);
    }
  });
  refs.current.peerConnection?.close?.();

  videoRefs.forEach(detachVideoElement);
  detachAllVideoElements();

  refs.current.peerConnection = null;
  refs.current.localStream = null;
  refs.current.remoteStream = null;
  refs.current.localRecorder = null;
  refs.current.remoteRecorder = null;
  refs.current.recorderStopPromises?.clear();
  refs.current.localChunks = [];
  refs.current.remoteChunks = [];
  refs.current.pendingIceCandidates = [];
  // Signals held back for a connection that no longer exists. Leaving them here
  // would replay the previous call's offer into the next one.
  refs.current.pendingSignals = [];
  refs.current.readyForSignals = false;
}
