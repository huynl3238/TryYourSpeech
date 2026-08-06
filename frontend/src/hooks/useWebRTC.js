import { useCallback, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { getConfig } from '../services/api';
import { cleanupMediaSession, rememberMediaStream } from '../utils/mediaCleanup';

export function useWebRTC({ sendSignal, onSignal, onRemoteStream, onConnectionStateChange }) {
  const { refs } = useSession();

  // Applying one signal to a peer connection that is genuinely ready for it.
  // Kept separate from the socket listener so the same code can run twice: once
  // for signals arriving live, once for signals that had to be held back.
  const applySignal = useCallback(async (pc, { type, payload }) => {
    async function flushPendingIceCandidates() {
      const pendingCandidates = refs.current.pendingIceCandidates || [];
      refs.current.pendingIceCandidates = [];

      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(candidate);
      }
    }

    if (type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      await flushPendingIceCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal('answer', answer);
    } else if (type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      await flushPendingIceCandidates();
    } else if (type === 'ice-candidate') {
      const candidate = new RTCIceCandidate(payload);
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
      } else {
        refs.current.pendingIceCandidates = refs.current.pendingIceCandidates || [];
        refs.current.pendingIceCandidates.push(candidate);
      }
    }
  }, [sendSignal, refs]);

  const buildPeerConnection = useCallback(async () => {
    // Fetch ICE config from backend
    let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const config = await getConfig();
      iceServers = config.iceServers;
    } catch (err) {
      console.warn('[WebRTC] Could not fetch ICE config, using default STUN:', err.message);
    }

    refs.current.iceServers = iceServers;
    const pc = new RTCPeerConnection({ iceServers });
    refs.current.peerConnection = pc;
    refs.current.pendingIceCandidates = [];
    // Nothing may be applied to this connection until startCall has put the
    // microphone on it — see the note there.
    refs.current.readyForSignals = false;
    refs.current.pendingSignals = [];

    // Forward ICE candidates to partner
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('ice-candidate', event.candidate);
      }
    };

    // Receive remote stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      refs.current.remoteStream = remoteStream;
      if (onRemoteStream) {
        onRemoteStream(remoteStream);
      }
      window.dispatchEvent(new Event('remote_stream_ready'));
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (onConnectionStateChange) {
        onConnectionStateChange(pc.connectionState);
      }
    };

    return pc;
  }, [sendSignal, onRemoteStream, onConnectionStateChange, refs]);

  const initPeerConnection = useCallback(async () => {
    const existingPc = refs.current.peerConnection;
    if (existingPc && existingPc.signalingState !== 'closed') {
      return existingPc;
    }

    // Same in-flight guard as getLocalStream, and for the same reason: the await
    // on getConfig() sits between the check above and the assignment inside
    // buildPeerConnection, so overlapping calls each built their own
    // RTCPeerConnection and the first was silently orphaned along with any
    // tracks already added to it.
    if (!refs.current.peerConnectionPromise) {
      refs.current.peerConnectionPromise = buildPeerConnection().finally(() => {
        refs.current.peerConnectionPromise = null;
      });
    }

    return refs.current.peerConnectionPromise;
  }, [buildPeerConnection, refs]);

  const addLocalTracks = useCallback((localStream) => {
    const pc = refs.current.peerConnection;
    if (!pc || !localStream) return null;

    const existingTracks = new Set(pc.getSenders().map((sender) => sender.track).filter(Boolean));
    localStream.getTracks().forEach((track) => {
      if (!existingTracks.has(track)) {
        pc.addTrack(track, localStream);
      }
    });

    return pc;
  }, [refs]);

  const startCall = useCallback(async (localStream, isInitiator) => {
    const pc = addLocalTracks(localStream);
    if (!pc) return;

    // Only now is this connection able to answer properly. Both sides start
    // negotiating off the same `begin_signaling` event and both have to fetch
    // ICE config over the network first, so the offer can easily arrive before
    // this point — and answering early is worse than it sounds. An offer applied
    // with no peer connection at all was dropped outright, which loses the call
    // entirely: no answer is ever sent, nothing retries, and the pair stares at a
    // blank screen until the 45s connect timeout blames WebRTC. An offer applied
    // after the connection existed but before the microphone was attached
    // answered receive-only, and the practice ran with one side silent.
    refs.current.readyForSignals = true;
    const buffered = refs.current.pendingSignals || [];
    refs.current.pendingSignals = [];

    // Order matters: the offer has to be applied before the candidates that
    // followed it, so they are replayed exactly as they arrived.
    for (const signal of buffered) {
      await applySignal(pc, signal);
    }

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('offer', offer);
    }
  }, [addLocalTracks, applySignal, sendSignal, refs]);

  // Handle incoming signals
  useEffect(() => {
    const cleanup = onSignal(async (signal) => {
      const pc = refs.current.peerConnection;

      // Too early: hold it rather than lose it. startCall replays the queue the
      // moment the connection can actually be answered on.
      if (!pc || !refs.current.readyForSignals) {
        refs.current.pendingSignals = refs.current.pendingSignals || [];
        refs.current.pendingSignals.push(signal);
        return;
      }

      try {
        await applySignal(pc, signal);
      } catch (err) {
        console.error('[WebRTC] Signal handling error:', err.message);
      }
    });

    return cleanup;
  }, [onSignal, applySignal, refs]);

  const getLocalStream = useCallback(async (constraints = { audio: true, video: true }) => {
    const existingStream = refs.current.localStream;
    if (existingStream?.getTracks().some((track) => track.readyState === 'live')) {
      return existingStream;
    }

    // The check above runs before the await while the assignment runs after it,
    // so two overlapping calls both saw "no stream yet" and both opened the
    // camera — React StrictMode does exactly that in development. The second
    // stream replaced the first, leaving its tracks live with the camera light
    // still on and an extra track already added to the peer connection. Sharing
    // the in-flight promise makes the second caller wait for the first.
    if (!refs.current.localStreamPromise) {
      refs.current.localStreamPromise = navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          refs.current.localStream = rememberMediaStream(stream);
          return refs.current.localStream;
        })
        .finally(() => {
          refs.current.localStreamPromise = null;
        });
    }

    return refs.current.localStreamPromise;
  }, [refs]);

  const stopAll = useCallback(() => {
    cleanupMediaSession(refs);
  }, [refs]);

  return { initPeerConnection, addLocalTracks, startCall, getLocalStream, stopAll };
}
